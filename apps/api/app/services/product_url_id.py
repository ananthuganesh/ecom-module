"""12-digit public productUrlId helpers (mirror orderUrlId / customerUrlId)."""

from __future__ import annotations

import os
import random

from pymongo import ReturnDocument

from app.documents import Product, Setting

_START_MIN = 100_000_000_000
_START_MAX = 899_999_999_999
_SEQ_KEY = "seq_product_url_id"


def _format_id(n: int) -> str:
    return f"{n:012d}"


async def next_product_url_id() -> str:
    """Allocate the next 12-digit productUrlId and advance the settings counter."""
    col = Setting.get_pymongo_collection()
    existing = await col.find_one({"key": _SEQ_KEY})
    if not existing:
        env_start = os.environ.get("PRODUCT_URL_ID_START", "").strip()
        if env_start.isdigit() and len(env_start) <= 12:
            start_floor = int(env_start) - 1
        else:
            start_floor = random.randint(_START_MIN, _START_MAX) - 1
        if start_floor < _START_MIN - 1:
            start_floor = _START_MIN - 1
        await col.update_one(
            {"key": _SEQ_KEY},
            {"$set": {"value": {"seq": start_floor}}},
            upsert=True,
        )

    doc = await col.find_one_and_update(
        {"key": _SEQ_KEY},
        {"$inc": {"value.seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    n = int((doc.get("value") or {}).get("seq") or _START_MIN)
    return _format_id(n)


async def ensure_product_url_id(product: Product) -> str | None:
    """Assign productUrlId if missing."""
    existing = getattr(product, "productUrlId", None)
    if existing and str(existing).isdigit() and len(str(existing)) == 12:
        return str(existing)
    url_id = await next_product_url_id()
    product.productUrlId = url_id
    await product.save()
    return url_id
