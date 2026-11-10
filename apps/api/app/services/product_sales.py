"""Product sales figures.

- Social proof for the product page ("500+ sold this week").
- The admin product-wise sales report: pieces sold per product over a date range.
"""

from __future__ import annotations

import time
from datetime import date, datetime, time as dtime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from bson import ObjectId

from app.documents import Order, Product, ReturnRequest

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


# ─── Admin report: pieces sold per product ──────────────────────────────────

IST = ZoneInfo("Asia/Kolkata")
# Same definition of a sale as the monthly report: paid and not cancelled/abandoned.
SOLD_ORDER_FILTER: dict[str, Any] = {
    "status": {"$nin": ["abandoned", "cancelled", "canceled"]},
    "$or": [
        {"paymentStatus": "paid"},
        {"transactionDetails.paymentStatus": "paid"},
    ],
}


def ist_day_bounds(start: date | None, end: date | None) -> tuple[datetime | None, datetime | None]:
    """Inclusive IST calendar days → naive-UTC [start, end) for ``createdAt``."""

    def _utc(d: date) -> datetime:
        return datetime.combine(d, dtime.min, tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)

    return (
        _utc(start) if start else None,
        _utc(end + timedelta(days=1)) if end else None,
    )


def _variant_label(item: dict) -> str:
    parts = [str(item.get(k) or "").strip() for k in ("size", "color")]
    return " / ".join(p for p in parts if p) or "Default"


def _qty(value: Any) -> int:
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError):
        return 0


def _price(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def sales_report(start: date | None = None, end: date | None = None) -> dict[str, Any]:
    """Pieces sold per product for orders placed between ``start`` and ``end`` (IST, inclusive).

    ``unitsSold`` is gross; ``returnedUnits`` are pieces from those same orders that
    came back (return received); ``netUnits`` is the difference. ``grossSales`` is
    unit price × quantity, before order-level discounts, delivery and gift fees.
    """
    since, until = ist_day_bounds(start, end)
    match: dict[str, Any] = dict(SOLD_ORDER_FILTER)
    if since or until:
        match["createdAt"] = {k: v for k, v in (("$gte", since), ("$lt", until)) if v}

    rows: dict[str, dict[str, Any]] = {}
    order_ids: list[str] = []
    cursor = Order.get_pymongo_collection().find(match, {"items": 1})
    async for order in cursor:
        oid = str(order["_id"])
        order_ids.append(oid)
        for item in order.get("items") or []:
            if not isinstance(item, dict):
                continue
            qty = _qty(item.get("quantity"))
            if qty <= 0:
                continue
            pid = str(item.get("productId") or "").strip()
            key = pid or f"name:{str(item.get('productName') or 'Unknown').strip().lower()}"
            row = rows.get(key)
            if row is None:
                row = rows[key] = {
                    "productId": pid or None,
                    "productName": str(item.get("productName") or "").strip() or "Unknown product",
                    "image": item.get("image") or None,
                    "unitsSold": 0,
                    "returnedUnits": 0,
                    "grossSales": 0.0,
                    "_orders": set(),
                    "_variants": {},
                }
            row["unitsSold"] += qty
            row["grossSales"] += qty * _price(item.get("price"))
            row["_orders"].add(oid)
            label = _variant_label(item)
            row["_variants"][label] = row["_variants"].get(label, 0) + qty
            if not row["image"] and item.get("image"):
                row["image"] = item.get("image")

    if order_ids:
        returns = ReturnRequest.get_pymongo_collection().find(
            {"status": "received", "orderId": {"$in": order_ids}}, {"items": 1}
        )
        async for ret in returns:
            for item in ret.get("items") or []:
                if not isinstance(item, dict):
                    continue
                pid = str(item.get("productId") or "").strip()
                key = pid or f"name:{str(item.get('productName') or 'Unknown').strip().lower()}"
                if key in rows:
                    rows[key]["returnedUnits"] += _qty(item.get("quantity"))

    # Prefer the live catalogue name/slug; order lines keep the name at time of sale.
    product_oids = [ObjectId(r["productId"]) for r in rows.values() if ObjectId.is_valid(str(r["productId"] or ""))]
    catalog: dict[str, dict] = {}
    if product_oids:
        async for doc in Product.get_pymongo_collection().find(
            {"_id": {"$in": product_oids}},
            {"productName": 1, "name": 1, "slug": 1, "productUrlId": 1, "thumbnails": 1},
        ):
            catalog[str(doc["_id"])] = doc

    items: list[dict[str, Any]] = []
    for row in rows.values():
        doc = catalog.get(str(row["productId"] or ""))
        if doc:
            row["productName"] = doc.get("productName") or doc.get("name") or row["productName"]
            row["slug"] = doc.get("slug")
            row["productUrlId"] = doc.get("productUrlId")
            thumbs = doc.get("thumbnails") or []
            if thumbs and not row["image"]:
                row["image"] = thumbs[0]
        returned = min(row["returnedUnits"], row["unitsSold"])
        items.append(
            {
                "productId": row["productId"],
                "productName": row["productName"],
                "slug": row.get("slug"),
                "productUrlId": row.get("productUrlId"),
                "image": row["image"],
                "inCatalog": bool(doc),
                "unitsSold": row["unitsSold"],
                "returnedUnits": returned,
                "netUnits": row["unitsSold"] - returned,
                "orders": len(row["_orders"]),
                "grossSales": round(row["grossSales"], 2),
                "variants": sorted(
                    ({"label": k, "units": v} for k, v in row["_variants"].items()),
                    key=lambda v: (-v["units"], v["label"]),
                ),
            }
        )
    items.sort(key=lambda r: (-r["unitsSold"], r["productName"].lower()))

    return {
        "from": start.isoformat() if start else None,
        "to": end.isoformat() if end else None,
        "totals": {
            "products": len(items),
            "orders": len(order_ids),
            "unitsSold": sum(r["unitsSold"] for r in items),
            "returnedUnits": sum(r["returnedUnits"] for r in items),
            "netUnits": sum(r["netUnits"] for r in items),
            "grossSales": round(sum(r["grossSales"] for r in items), 2),
        },
        "items": items,
    }
