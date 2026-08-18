"""Auto-mark unpaid gateway exits as abandoned orders."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

from pymongo import ReturnDocument

from app.documents import Order

# Customers who leave Razorpay without paying → abandoned after this idle window.
# Default 30m — aligned with STOCK_RESERVE_TTL_MINUTES. Separate from AiSensy
# abandoned-cart WhatsApp delay (admin AiSensy abandonedMinutes, default 15).
DEFAULT_ABANDONED_ORDER_MINUTES = 30
ABANDONABLE_STATUSES = {"order placed"}
PAID_LIKE = {"paid", "refunded", "partially_refunded", "refund_pending"}


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


def is_unpaid_gateway_candidate(order: Order) -> bool:
    status = (order.status or "").strip().lower()
    if status not in ABANDONABLE_STATUSES:
        return False
    if _payment_status(order) in PAID_LIKE:
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
        if await mark_order_abandoned(order, reason="payment_gateway_exit"):
            marked += 1
        else:
            skipped += 1

    return {
        "scanned": len(candidates),
        "marked": marked,
        "skipped": skipped,
        "cutoffMinutes": minutes,
    }


async def mark_order_abandoned(
    order: Order,
    *,
    reason: str = "payment_gateway_exit",
    release_stock: bool = True,
) -> bool:
    """Mark an unpaid gateway-exit order as abandoned (idempotent).

    Uses $set so a stale in-memory transactionDetails cannot wipe stock flags
    written by release_order_stock (stockReleased / stockReserved).
    """
    if (order.status or "").strip().lower() == "abandoned":
        return False
    if not is_unpaid_gateway_candidate(order):
        return False
    if not getattr(order, "id", None):
        return False

    now = datetime.utcnow()
    col = Order.get_pymongo_collection()
    updated = await col.find_one_and_update(
        {
            "_id": order.id,
            "status": {"$nin": ["abandoned", "cancelled", "delivered"]},
            "paymentStatus": {"$nin": list(PAID_LIKE)},
        },
        {
            "$set": {
                "status": "abandoned",
                "transactionDetails.abandonedAt": now.isoformat(),
                "transactionDetails.abandonedReason": reason,
                "updatedAt": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        return False

    order.status = "abandoned"
    order.transactionDetails = dict(updated.get("transactionDetails") or {})
    order.updatedAt = now

    if release_stock:
        try:
            from app.services.stock import release_order_stock

            await release_order_stock(order)
        except Exception as exc:
            print(f"[Orders] Stock release on abandon failed: {exc}")
    return True


async def mark_checkouts_converted_for_order(order: Order, *, user=None) -> int:
    """Mark matching AbandonedCheckout rows converted after payment succeeds."""
    from app.documents import AbandonedCheckout

    or_keys: list[dict[str, Any]] = []
    guest_id = (order.transactionDetails or {}).get("guestId") or getattr(order, "guestId", None)
    if guest_id:
        or_keys.append({"guestId": guest_id})
    customer_id = order.customerId or (getattr(user, "id", None) if user is not None else None)
    if customer_id is not None:
        or_keys.append({"userId": customer_id})
        or_keys.append({"userId": str(customer_id)})
    if not or_keys:
        return 0

    rows = await AbandonedCheckout.find({"status": "abandoned", "$or": or_keys}).to_list()
    if not rows:
        return 0
    now = datetime.utcnow()
    for checkout in rows:
        checkout.status = "converted"
        checkout.orderId = order.id
        checkout.lastActivityAt = now
        await checkout.save()
    return len(rows)


def revive_abandoned_on_payment(order: Order) -> None:
    """If a late payment arrives, move abandoned → order placed (caller saves)."""
    if (order.status or "").strip().lower() == "abandoned":
        order.status = "order placed"
