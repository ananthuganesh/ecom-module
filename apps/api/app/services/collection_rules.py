"""Automatic collections: product lists computed from a rule instead of picked by hand.

- ``new_arrivals``: the newest live products.
- ``best_sellers``: live products ranked by units sold on paid, non-cancelled
  orders over the last ``ruleDays`` days.

Both return at most ``ruleLimit`` product ids, best first. Results are cached
briefly so a busy collection page doesn't re-run the order aggregation.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId

from app.documents import Category, Order, Product

NEW_ARRIVALS = "new_arrivals"
BEST_SELLERS = "best_sellers"
RULES = {
    NEW_ARRIVALS: "New arrivals — newest products first",
    BEST_SELLERS: "Best sellers — most units sold",
}

MIN_LIMIT, MAX_LIMIT = 4, 100
MIN_DAYS, MAX_DAYS = 7, 365
CACHE_SECONDS = 300.0

_LIVE = {"status": {"$ne": "draft"}}
_cache: dict[tuple, tuple[float, list[ObjectId]]] = {}


def clean_rule(value: Any) -> str | None:
    rule = str(value or "").strip().lower()
    return rule if rule in RULES else None


def clamp_limit(value: Any) -> int:
    try:
        return max(MIN_LIMIT, min(MAX_LIMIT, int(value)))
    except (TypeError, ValueError):
        return 24


def clamp_days(value: Any) -> int:
    try:
        return max(MIN_DAYS, min(MAX_DAYS, int(value)))
    except (TypeError, ValueError):
        return 60


def clear_cache() -> None:
    _cache.clear()


async def _new_arrivals(limit: int) -> list[ObjectId]:
    rows = await Product.get_pymongo_collection().find(_LIVE, {"_id": 1}).sort(
        [("createdAt", -1), ("_id", -1)]
    ).limit(limit).to_list(length=limit)
    return [row["_id"] for row in rows]


async def _best_sellers(limit: int, days: int) -> list[ObjectId]:
    since = datetime.utcnow() - timedelta(days=days)
    rows = await Order.get_pymongo_collection().aggregate(
        [
            {
                "$match": {
                    "createdAt": {"$gte": since},
                    "status": {"$nin": ["abandoned", "cancelled"]},
                    "$or": [
                        {"paymentStatus": "paid"},
                        {"transactionDetails.paymentStatus": "paid"},
                    ],
                }
            },
            {"$unwind": "$items"},
            # Legacy rows mix ObjectId and string product ids.
            {"$group": {"_id": {"$toString": "$items.productId"}, "units": {"$sum": "$items.quantity"}}},
            {"$match": {"units": {"$gt": 0}}},
            {"$sort": {"units": -1, "_id": 1}},
            # Head-room for drafts and deleted products dropped below.
            {"$limit": limit * 3},
        ]
    ).to_list(length=None)
    ranked = [ObjectId(r["_id"]) for r in rows if r.get("_id") and ObjectId.is_valid(r["_id"])]
    if not ranked:
        return []
    live = {
        row["_id"]
        for row in await Product.get_pymongo_collection()
        .find({"_id": {"$in": ranked}, **_LIVE}, {"_id": 1})
        .to_list(length=None)
    }
    return [pid for pid in ranked if pid in live][:limit]


async def rule_product_ids(doc: Category) -> list[ObjectId]:
    """Ordered product ids for an automatic collection (empty for a manual one)."""
    rule = clean_rule(doc.rule)
    if not rule:
        return []
    limit = clamp_limit(doc.ruleLimit)
    days = clamp_days(doc.ruleDays)
    key = (rule, limit, days if rule == BEST_SELLERS else 0)
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return list(hit[1])
    ids = await _new_arrivals(limit) if rule == NEW_ARRIVALS else await _best_sellers(limit, days)
    _cache[key] = (time.monotonic(), ids)
    return list(ids)


DEFAULT_AUTO_COLLECTIONS = (
    {"name": "New Arrivals", "slug": "new-arrivals", "rule": NEW_ARRIVALS},
    {"name": "Best Sellers", "slug": "best-sellers", "rule": BEST_SELLERS},
)
SEEDED_KEY = "autoCollectionsSeeded"


async def ensure_default_auto_collections() -> list[str]:
    """Create New Arrivals and Best Sellers once.

    Runs on startup but only ever once (a Setting flag), so an admin who
    deletes or renames one doesn't see it come back. An existing collection at
    the same URL is left alone.
    """
    from app.documents import Setting

    if await Setting.find_one(Setting.key == SEEDED_KEY):
        return []
    created = []
    for spec in DEFAULT_AUTO_COLLECTIONS:
        if await Category.find_one({"slug": spec["slug"]}):
            continue
        await Category(name=spec["name"], slug=spec["slug"], rule=spec["rule"]).insert()
        created.append(spec["slug"])
    await Setting(key=SEEDED_KEY, value={"at": datetime.utcnow().isoformat(), "created": created}).insert()
    return created
