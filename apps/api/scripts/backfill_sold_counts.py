#!/usr/bin/env python3
"""Recompute Product.soldCount from paid / COD-confirmed orders."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import init_db
from app.services.product_sales import recompute_all_sold_counts


async def main() -> None:
    await init_db()
    stats = await recompute_all_sold_counts()
    # Mark counted so live increments do not double-apply on next commitment.
    from app.documents import Order

    col = Order.get_pymongo_collection()
    result = await col.update_many(
        {
            "$or": [
                {"paymentStatus": {"$in": ["paid", "pay_on_delivery"]}},
                {"transactionDetails.paymentStatus": {"$in": ["paid", "pay_on_delivery"]}},
                {"paymentMethod": "cod"},
            ]
        },
        {"$set": {"transactionDetails.soldCounted": True}},
    )
    print(
        f"soldCount backfill: orders={stats['orders']} "
        f"productsUpdated={stats['productsUpdated']} units={stats['units']} "
        f"ordersMarked={result.modified_count}"
    )


if __name__ == "__main__":
    asyncio.run(main())
