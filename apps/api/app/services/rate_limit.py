"""Simple in-process sliding-window rate limiter (single API instance)."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


_buckets: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(
    key: str,
    *,
    limit: int,
    window_seconds: float = 60.0,
) -> None:
    now = time.monotonic()
    bucket = _buckets[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests; try again later")
    bucket.append(now)


def rate_limit_dependency(prefix: str, *, limit: int, window_seconds: float = 60.0):
    async def _dep(request: Request) -> None:
        enforce_rate_limit(
            f"{prefix}:{client_ip(request)}",
            limit=limit,
            window_seconds=window_seconds,
        )

    return _dep
