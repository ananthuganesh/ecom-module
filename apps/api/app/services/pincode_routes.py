"""Pincode → carrier overrides, cached in process.

The table is small (~9k rows) and changes only when a carrier updates its
coverage, so the whole map is held in memory and refreshed on a TTL rather than
hitting Mongo on every booking.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Any

from app.documents import PincodeRoute

# DTDC's IP-dispatch branch list — pincodes DTDC will not deliver normally.
DTDC_IP_DISPATCH_SOURCE = "dtdc-ip-dispatch"

_CACHE: dict[str, str] | None = None
_CACHE_AT = 0.0
_CACHE_TTL_SEC = 300.0

# Upserts issued at once; enough to saturate the connection pool without
# opening thousands of concurrent operations.
BULK_CHUNK = 200


def normalize_pincode(value: Any) -> str | None:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits if len(digits) == 6 else None


def invalidate_cache() -> None:
    global _CACHE, _CACHE_AT
    _CACHE = None
    _CACHE_AT = 0.0


async def _load_map() -> dict[str, str]:
    global _CACHE, _CACHE_AT
    now = time.monotonic()
    if _CACHE is not None and (now - _CACHE_AT) < _CACHE_TTL_SEC:
        return _CACHE
    routes = await PincodeRoute.find_all().to_list()
    _CACHE = {r.pincode: r.carrier for r in routes if r.pincode and r.carrier}
    _CACHE_AT = now
    return _CACHE


async def carrier_for_pincode(pincode: Any) -> str | None:
    """The carrier this pincode is routed to, or None when there is no override."""
    pin = normalize_pincode(pincode)
    if not pin:
        return None
    return (await _load_map()).get(pin)


async def route_count(carrier: str | None = None) -> int:
    routes = await _load_map()
    if carrier is None:
        return len(routes)
    return sum(1 for value in routes.values() if value == carrier)


async def upsert_routes(rows: list[dict[str, Any]], *, source: str) -> dict[str, int]:
    """Insert or update pincode routes. Returns counts, and refreshes the cache.

    Upserts run concurrently in batches. The table is ~9k rows, and doing them
    one at a time against Atlas takes minutes and leaves the import half
    applied if it is interrupted.

    `rows` items need `pincode` and `carrier`; city/state/branch/tatDays/reason
    are optional metadata carried through from the import.
    """
    now = datetime.utcnow()
    pending: list[tuple[str, dict[str, Any]]] = []
    seen: set[str] = set()
    skipped = 0

    for row in rows:
        pin = normalize_pincode(row.get("pincode"))
        carrier = str(row.get("carrier") or "").strip().lower()
        if not pin or not carrier or pin in seen:
            skipped += 1
            continue
        seen.add(pin)
        pending.append(
            (
                pin,
                {
                    "carrier": carrier,
                    "reason": str(row.get("reason") or ""),
                    "source": source,
                    "city": row.get("city") or None,
                    "state": row.get("state") or None,
                    "branch": row.get("branch") or None,
                    "tatDays": row.get("tatDays"),
                    "updatedAt": now,
                },
            )
        )

    created = 0
    updated = 0
    if pending:
        collection = PincodeRoute.get_pymongo_collection()

        async def _one(pin: str, fields: dict[str, Any]):
            return await collection.update_one(
                {"pincode": pin},
                {"$set": fields, "$setOnInsert": {"pincode": pin, "createdAt": now}},
                upsert=True,
            )

        for start in range(0, len(pending), BULK_CHUNK):
            batch = pending[start : start + BULK_CHUNK]
            results = await asyncio.gather(*[_one(pin, f) for pin, f in batch])
            for result in results:
                if getattr(result, "upserted_id", None) is not None:
                    created += 1
                else:
                    updated += 1

    invalidate_cache()
    return {"created": created, "updated": updated, "skipped": skipped}


async def clear_source(source: str) -> int:
    """Drop every route from one import (so a re-import can replace it)."""
    collection = PincodeRoute.get_pymongo_collection()
    result = await collection.delete_many({"source": source})
    invalidate_cache()
    return int(result.deleted_count or 0)
