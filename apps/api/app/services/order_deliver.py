"""Manually mark an order delivered from the admin panel.

Mirrors what the courier sync does when a carrier reports "Delivered"
(``dtdc.track_order`` / ``delhivery``): order + shipping status, ``isDelivered``,
``deliveredAt``, invoice, and the one-time customer notifications. Unlike the
order-status mapping in ``fulfillment.apply_shipping_status_from_order_status``,
it also moves ``shippingStatus`` on orders that carry an AWB — that is the
usual reason to do it by hand (the courier never reported the delivery).
``isDelivered`` then takes the order out of the tracking sync.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.documents import Order, User

# States a delivery can't follow: the parcel never left, or the return flow owns it.
BLOCKED_STATUSES = {"cancelled", "canceled", "abandoned", "return requested", "returned"}
BLOCKED_SHIPPING = {"cancelled", "returned"}


def _paid(order: Order) -> bool:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    status = str(order.paymentStatus or details.get("paymentStatus") or "").strip().lower()
    return status == "paid"


def parse_delivered_at(value: Any) -> datetime | None:
    """ISO date/datetime from the admin, stored as naive UTC like other timestamps."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="deliveredAt must be an ISO date") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    if parsed > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Delivery date can't be in the future.")
    return parsed


def assert_can_mark_delivered(order: Order) -> None:
    status = str(order.status or "").strip().lower()
    if status in BLOCKED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"A {status} order can't be marked as delivered.",
        )
    if str(order.shippingStatus or "").strip().lower() in BLOCKED_SHIPPING:
        raise HTTPException(
            status_code=400,
            detail=f"Shipment is {order.shippingStatus}; it can't be marked as delivered.",
        )
    if not _paid(order):
        raise HTTPException(
            status_code=400,
            detail="Only paid orders can be marked as delivered.",
        )


async def mark_order_delivered(
    order: Order,
    *,
    actor: str = "admin",
    delivered_at: datetime | None = None,
) -> dict[str, Any]:
    """Mark ``order`` delivered. Idempotent: a delivered order is left untouched."""
    already = bool(order.isDelivered) and str(order.status or "").lower() == "delivered"
    if already:
        return {"changed": False, "alreadyDelivered": True}
    assert_can_mark_delivered(order)

    now = datetime.utcnow()
    when = delivered_at or now
    order.status = "delivered"
    order.shippingStatus = "Delivered"
    order.isDelivered = True
    order.deliveredAt = when
    order.deliveryDate = when
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    order.transactionDetails = {
        **details,
        "manualDelivery": {"by": actor, "at": now, "deliveredAt": when},
    }
    order.updatedAt = now
    await order.save()

    try:
        from app.services import erp_ops

        await erp_ops.ensure_invoice_on_fulfillment(order, context="admin_mark_delivered")
    except Exception as exc:
        print(f"[Invoice] mark delivered {order.id}: {exc}")

    notified = False
    try:
        from app.services import aisensy as aisensy_svc
        from app.services import email_resend as email_svc

        user = await User.get(order.customerId) if order.customerId else None
        await aisensy_svc.notify_order_event_once("orderDelivered", order, user)
        await email_svc.notify_order_email_once("DELIVERED", order, user)
        notified = True
    except Exception as exc:
        print(f"[Notify] admin mark delivered: {exc}")

    return {"changed": True, "alreadyDelivered": False, "notified": notified}
