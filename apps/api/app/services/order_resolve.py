"""Resolve an order by Mongo ObjectId, orderUrlId (12-digit), or orderNumber (UA1000)."""

from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId

from app.documents import Order


async def resolve_order(order_ref: str | None) -> Order | None:
    raw = str(order_ref or "").strip()
    if not raw:
        return None
    cleaned = raw.lstrip("#").strip()
    if not cleaned:
        return None

    # 24-char hex → Mongo ObjectId
    if len(cleaned) == 24:
        try:
            order = await Order.get(ObjectId(cleaned))
            if order:
                return order
        except (InvalidId, TypeError):
            pass

    # 12-digit public URL id
    if cleaned.isdigit() and len(cleaned) >= 12:
        order = await Order.find_one(Order.orderUrlId == cleaned)
        if order:
            return order

    order = await Order.find_one(Order.orderNumber == cleaned)
    if order:
        return order
    return await Order.find_one(Order.orderNumber == f"#{cleaned}")
