"""Auto-mark unpaid gateway exits as abandoned orders."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

from app.documents import Order

# Customers who leave Razorpay without paying → abandoned after this idle window.
# Default 30m — aligned with STOCK_RESERVE_TTL_MINUTES. Separate from AiSensy
# abandoned-cart WhatsApp delay (admin AiSensy abandonedMinutes, default 15).
DEFAULT_ABANDONED_ORDER_MINUTES = 30
ABANDONABLE_STATUSES = {"order placed", "draft"}
PAID_LIKE = {"paid", "refunded", "partially_refunded", "pay_on_delivery", "refund_pending"}
COD_LIKE = {"cod", "cash_on_delivery", "pay_on_delivery"}


def abandoned_order_minutes() -> int:
    raw = (os.environ.get("ABANDONED_ORDER_MINUTES") or "").strip()
    try:
        minutes = int(raw) if raw else DEFAULT_ABANDONED_ORDER_MINUTES
    except (TypeError, ValueError):
        minutes = DEFAULT_ABANDONED_ORDER_MINUTES
    return max(1, min(minutes, 24 * 60))


def _payment_status(order: Order) -> str:
    return str(
        order.paymentStatus
        or (order.transactionDetails or {}).get("paymentStatus")
        or ""
    ).strip().lower()


def _payment_method(order: Order) -> str:
    return str(
        order.paymentMethod
        or (order.transactionDetails or {}).get("paymentMethod")
        or ""
    ).strip().lower()


def is_unpaid_gateway_candidate(order: Order) -> bool:
    status = (order.status or "").strip().lower()
    if status not in ABANDONABLE_STATUSES:
        return False
    if _payment_status(order) in PAID_LIKE:
        return False
    if _payment_method(order) in COD_LIKE:
        return False
    # Treat empty / pending as unpaid online
    pay = _payment_status(order)
    return pay in ("", "pending")


async def mark_stale_unpaid_orders_abandoned(*, limit: int = 200) -> dict[str, Any]:
    """
    Mark unpaid online orders (customer exited payment gateway) as abandoned
    once older than ABANDONED_ORDER_MINUTES (default 15).
    """
    minutes = abandoned_order_minutes()
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)

    # Prefer createdAt; fall back to updatedAt for odd imports
    candidates = (
        await Order.find(
            {
                "status": {"$in": list(ABANDONABLE_STATUSES)},
                "paymentStatus": {"$nin": list(PAID_LIKE)},
                "$or": [
                    {"createdAt": {"$lte": cutoff}},
                    {
                        "createdAt": {"$exists": False},
                        "updatedAt": {"$lte": cutoff},
                    },
                ],
            }
        )
        .limit(limit)
        .to_list()
    )

    marked = 0
    skipped = 0
    for order in candidates:
        if not is_unpaid_gateway_candidate(order):
            skipped += 1
            continue
        created = order.createdAt or order.updatedAt
        if created and created > cutoff:
            skipped += 1
            continue
        order.status = "abandoned"
        details = dict(order.transactionDetails or {})
        details["abandonedAt"] = datetime.utcnow().isoformat()
        details["abandonedReason"] = "payment_gateway_exit"
        order.transactionDetails = details
        order.updatedAt = datetime.utcnow()
        await order.save()
        try:
            from app.services.stock import release_order_stock

            await release_order_stock(order)
        except Exception as exc:
            print(f"[Orders] Stock release on abandon failed: {exc}")
        marked += 1

    return {
        "scanned": len(candidates),
        "marked": marked,
        "skipped": skipped,
        "cutoffMinutes": minutes,
    }


def revive_abandoned_on_payment(order: Order) -> None:
    """If a late payment arrives, move abandoned → order placed (caller saves)."""
    if (order.status or "").strip().lower() == "abandoned":
        order.status = "order placed"
