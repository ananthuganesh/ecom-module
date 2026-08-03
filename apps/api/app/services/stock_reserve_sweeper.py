"""Release soft-reserved stock for unpaid orders past the TTL."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any

from app.documents import Order
from app.services.stock import release_order_stock

STOCK_RESERVE_TTL_MINUTES = 30
PAID_LIKE = {"paid", "refunded", "partially_refunded", "refund_pending"}


async def release_expired_stock_reservations(*, limit: int = 200) -> dict[str, Any]:
    cutoff = datetime.utcnow() - timedelta(minutes=STOCK_RESERVE_TTL_MINUTES)
    # reservedAt stored as ISO string — also match by createdAt as fallback
    candidates = (
        await Order.find(
            {
                "transactionDetails.stockReserved": True,
                "transactionDetails.stockApplied": {"$nin": [True]},
                "transactionDetails.stockReleased": {"$nin": [True]},
                "paymentStatus": {"$nin": list(PAID_LIKE)},
                "createdAt": {"$lte": cutoff},
            }
        )
        .limit(limit)
        .to_list()
    )

    released = 0
    errors = 0
    for order in candidates:
        details = dict(order.transactionDetails or {})
        reserved_at_raw = details.get("reservedAt")
        if reserved_at_raw:
            try:
                reserved_at = datetime.fromisoformat(str(reserved_at_raw).replace("Z", ""))
                if reserved_at > cutoff:
                    continue
            except ValueError:
                pass
        try:
            if await release_order_stock(order):
                released += 1
            # TTL exit without pay → abandoned cart (not an open order).
            try:
                from app.services.order_abandon import mark_order_abandoned

                await mark_order_abandoned(
                    order,
                    reason="payment_reserve_ttl",
                    release_stock=False,
                )
            except Exception as abandon_exc:
                print(f"[Orders] Abandon after TTL release failed for {order.id}: {abandon_exc}")
        except Exception as exc:
            errors += 1
            # reserved=0 is handled as noop now; keep noise down for transient races
            msg = str(exc)
            if "reserved 0" not in msg:
                print(f"[Stock] Reserve TTL release failed for {order.id}: {exc}")

    return {"scanned": len(candidates), "released": released, "errors": errors}


async def stock_reserve_sweeper_loop(stop_event: asyncio.Event, interval_seconds: float = 60.0) -> None:
    while not stop_event.is_set():
        try:
            result = await release_expired_stock_reservations()
            if result.get("released"):
                print(f"[Stock] Released expired reservations: {result}")
        except Exception as exc:
            print(f"[Stock] Reserve sweeper error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
