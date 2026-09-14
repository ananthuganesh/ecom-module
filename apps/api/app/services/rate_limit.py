"""Rate limiting + login lockout.

Uses Mongo when the DB is initialized (works across API workers). Falls back to
in-process buckets only when DB is unavailable.
"""

from __future__ import annotations

import ipaddress
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from pymongo import ReturnDocument

from app.db import get_db

_buckets: dict[str, deque[float]] = defaultdict(deque)

LOGIN_FAIL_LIMIT = 5
LOGIN_FAIL_WINDOW_SECONDS = 15 * 60


def _public_ip(value: str) -> str | None:
    try:
        ip = ipaddress.ip_address(value.strip())
    except ValueError:
        return None
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        return None
    return str(ip)


def client_ip(request: Request) -> str:
    """Resolve client IP.

    Only honor proxy headers when TRUST_PROXY=1. Even then, the leftmost
    X-Forwarded-For entry is whatever the client typed, so it is never used:
    Cloudflare's CF-Connecting-IP wins, otherwise the rightmost public hop,
    which our own proxy appended.
    """
    trust = str(os.environ.get("TRUST_PROXY") or "").strip().lower() in {"1", "true", "yes"}
    if trust:
        cf_ip = _public_ip(request.headers.get("cf-connecting-ip") or "")
        if cf_ip:
            return cf_ip
        hops = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
        for hop in reversed(hops):
            public = _public_ip(hop)
            if public:
                return public
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _memory_enforce(key: str, *, limit: int, window_seconds: float) -> None:
    now = time.monotonic()
    bucket = _buckets[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests; try again later")
    bucket.append(now)


async def enforce_rate_limit(
    key: str,
    *,
    limit: int,
    window_seconds: float = 60.0,
) -> None:
    db = get_db()
    if db is None:
        _memory_enforce(key, limit=limit, window_seconds=window_seconds)
        return

    now = time.time()
    window = max(1, int(window_seconds))
    bucket_id = f"rl:{key}:{int(now // window)}"
    expires_at = datetime.fromtimestamp(now + window + 60, tz=timezone.utc)
    col = db["rate_limits"]
    try:
        doc = await col.find_one_and_update(
            {"_id": bucket_id},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {"expiresAt": expires_at},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except Exception:
        _memory_enforce(key, limit=limit, window_seconds=window_seconds)
        return

    count = int((doc or {}).get("count") or 0)
    if count > limit:
        raise HTTPException(status_code=429, detail="Too many requests; try again later")


def rate_limit_dependency(prefix: str, *, limit: int, window_seconds: float = 60.0):
    async def _dep(request: Request) -> None:
        await enforce_rate_limit(
            f"{prefix}:{client_ip(request)}",
            limit=limit,
            window_seconds=window_seconds,
        )

    return _dep


def _fail_key(email: str) -> str:
    return f"loginfail:{str(email or '').strip().lower()}"


async def assert_login_not_locked(email: str) -> None:
    db = get_db()
    if db is None:
        return
    doc = await db["rate_limits"].find_one({"_id": _fail_key(email)})
    if not doc:
        return
    count = int(doc.get("count") or 0)
    updated = float(doc.get("updatedAt") or 0)
    if count >= LOGIN_FAIL_LIMIT and (time.time() - updated) < LOGIN_FAIL_WINDOW_SECONDS:
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-in attempts. Try again later.",
        )


async def record_failed_login(email: str) -> None:
    db = get_db()
    if db is None:
        return
    now = time.time()
    await db["rate_limits"].update_one(
        {"_id": _fail_key(email)},
        {
            "$inc": {"count": 1},
            "$set": {
                "updatedAt": now,
                "expiresAt": datetime.fromtimestamp(
                    now + LOGIN_FAIL_WINDOW_SECONDS + 60, tz=timezone.utc
                ),
            },
        },
        upsert=True,
    )


async def clear_failed_login(email: str) -> None:
    db = get_db()
    if db is None:
        return
    await db["rate_limits"].delete_one({"_id": _fail_key(email)})
