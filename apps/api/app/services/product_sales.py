"""Denormalized product sold counts for storefront PDP."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from bson import ObjectId

from app.documents import Order, Product


def _line_qty_by_product(order: Order) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for item in order.items or []:
        pid = str(item.productId or "").strip()
        qty = int(item.quantity or 0)
        if not pid or qty <= 0:
            continue
        totals[pid] += qty
    return dict(totals)


async def record_order_sold_counts(order: Order) -> bool:
    """Increment Product.soldCount for each line. Caller must ensure once-per-order."""
    totals = _line_qty_by_product(order)
    if not totals:
        return False
    col = Product.get_pymongo_collection()
    now = datetime.utcnow()
    for product_id, qty in totals.items():
        if not ObjectId.is_valid(product_id):
            continue
        await col.update_one(
            {"_id": ObjectId(product_id)},
            {"$inc": {"soldCount": qty}, "$set": {"updatedAt": now}},
        )
    return True


async def recompute_all_sold_counts() -> dict[str, int]:
    """Reset and recompute soldCount from paid orders."""
    product_col = Product.get_pymongo_collection()
    await product_col.update_many({}, {"$set": {"soldCount": 0}})

    totals: dict[str, int] = defaultdict(int)
    orders = await Order.find(
        {
            "$or": [
                {"paymentStatus": "paid"},
                {"transactionDetails.paymentStatus": "paid"},
            ]
        }
    ).to_list()

    order_count = 0
    for order in orders:
        pay = str(order.paymentStatus or "").lower()
        pay_td = str((order.transactionDetails or {}).get("paymentStatus") or "").lower()
        if pay != "paid" and pay_td != "paid":
            continue
        order_count += 1
        for pid, qty in _line_qty_by_product(order).items():
            totals[pid] += qty

    now = datetime.utcnow()
    updated = 0
    for product_id, qty in totals.items():
        if not ObjectId.is_valid(product_id) or qty <= 0:
            continue
        result = await product_col.update_one(
            {"_id": ObjectId(product_id)},
            {"$set": {"soldCount": qty, "updatedAt": now}},
        )
        if result.matched_count:
            updated += 1

    return {"orders": order_count, "productsUpdated": updated, "units": sum(totals.values())}
