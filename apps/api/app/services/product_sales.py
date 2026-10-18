"""Recent-sales social proof for the product page ("500+ sold this week")."""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId

from app.documents import Order

WINDOW_DAYS = 7
# Below this the line is hidden — a slow week should not advertise a weak number.
MIN_DISPLAY = 10
CACHE_SECONDS = 600.0

_cache: dict[str, tuple[float, int | None]] = {}


def _ids(value: Any) -> list[Any]:
    """Legacy rows store ids as either strings or ObjectIds."""
    out: list[Any] = [str(value)]
    if ObjectId.is_valid(str(value)):
        out.append(ObjectId(str(value)))
    return out


def display_floor(units: int) -> int | None:
    """Round down to a "N+" figure that never overstates: 47 → 40, 523 → 500, 1840 → 1000."""
    if units < MIN_DISPLAY:
        return None
    step = 10 if units < 100 else 100 if units < 1000 else 1000
    return units // step * step


async def units_sold(product_id: str, *, days: int = WINDOW_DAYS) -> int:
    """Units of this product on paid, non-cancelled orders placed in the last ``days``."""
    since = datetime.utcnow() - timedelta(days=days)
    ids = _ids(product_id)
    orders = await Order.find(
        {
            "createdAt": {"$gte": since},
            "items.productId": {"$in": ids},
            "status": {"$nin": ["abandoned", "cancelled"]},
            "$or": [
                {"paymentStatus": "paid"},
                {"transactionDetails.paymentStatus": "paid"},
            ],
        }
    ).to_list()
    wanted = {str(i) for i in ids}
    return sum(
        max(int(item.quantity or 0), 0)
        for order in orders
        for item in order.items
        if str(item.productId or "") in wanted
    )


async def sold_this_week(product_id: str) -> int | None:
    """Display figure for the product page, cached briefly per product."""
    key = str(product_id)
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = display_floor(await units_sold(key))
    _cache[key] = (now, value)
    return value
