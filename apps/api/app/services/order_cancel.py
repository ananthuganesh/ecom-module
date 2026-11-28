"""Admin order cancel: carrier cancel (if AWB), restock, refund, archive, notify."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.documents import Order, User


def _status_lower(order: Order) -> str:
    return str(order.status or "").lower().strip()


def _has_shipment(order: Order) -> bool:
    from app.services import couriers

    return bool(couriers.shipment_reference(order))


# Carrier said the consignment is already gone — safe to finish the local cancel.
_ALREADY_GONE = ("already", "not found", "no awb", "does not exist")
# ...unless the carrier is telling us it *refuses* to cancel. "Cannot be cancelled"
# contains "cancelled", so matching on that word alone would strand a live parcel.
_REFUSAL = ("cannot", "can not", "can't", "unable", "not allowed", "not permitted")


def _is_soft_cancel_error(detail: str) -> bool:
    text = str(detail or "").lower()
    if any(token in text for token in _REFUSAL):
        return False
    return any(token in text for token in _ALREADY_GONE)


def assert_cancellable(order: Order) -> None:
    status = _status_lower(order)
    if status == "cancelled":
        raise HTTPException(status_code=400, detail="Order is already cancelled")
    if status in {"delivered", "returned"} or order.isDelivered:
        raise HTTPException(
            status_code=400,
            detail="Delivered or returned orders cannot be cancelled here",
        )


def _is_refundable(order: Order) -> bool:
    """Only a captured Razorpay payment can be refunded."""
    if str(order.paymentStatus or "").lower() not in ("paid", "captured"):
        return False
    return bool(str(order.razorpayPaymentId or "").strip())


async def cancel_order(
    order: Order,
    *,
    actor: str = "admin",
    reason: str = "admin_cancel",
    refund: bool = True,
) -> dict[str, Any]:
    """Cancel order end-to-end.

    - Unfulfilled: mark cancelled, restock, refund, archive, email
    - Fulfilled (AWB): cancel with the carrier that holds it, then same

    Pass refund=False to cancel without returning the customer's money.
    """
    assert_cancellable(order)

    result: dict[str, Any] = {
        "carrier": None,
        "shipmentCancelled": False,
        # `dtdcCancelled` / `dtdc` kept for admin clients that read those keys.
        "dtdcCancelled": False,
        "dtdc": None,
        "restocked": False,
        "refunded": False,
        "refund": None,
        "email": None,
    }
    had_shipment = _has_shipment(order)
    prev_status = order.status

    if had_shipment:
        from app.services import couriers

        carrier = couriers.carrier_for_order(order)
        result["carrier"] = carrier
        try:
            # Route to whichever carrier actually holds the parcel — cancelling a
            # Delhivery waybill against DTDC would leave the shipment live.
            data = await couriers.cancel_shipment(order)
            result["shipmentCancelled"] = True
            result["shipment"] = data
            result["dtdcCancelled"] = True
            result["dtdc"] = data if carrier == couriers.DTDC else None
            # cancel_consignment saves; reload-safe: continue on same instance
        except HTTPException as exc:
            # If the consignment is already gone, finish the local cancel;
            # a refusal means the parcel is still moving, so surface it.
            detail = str(exc.detail or "")
            if not _is_soft_cancel_error(detail):
                raise
            result["shipmentWarning"] = detail
            result["dtdcWarning"] = detail

    now = datetime.utcnow()
    details = dict(order.transactionDetails or {})
    details["cancelledAt"] = now.isoformat()
    details["cancelledBy"] = actor
    details["cancelReason"] = reason
    if had_shipment and not result["shipmentCancelled"]:
        details["shipmentCancelled"] = {
            "note": "local_cancel_without_carrier_response",
            "carrier": result["carrier"],
            "cancelledAt": now.isoformat(),
        }

    order.status = "cancelled"
    order.shippingStatus = "Cancelled"
    order.archived = True
    order.transactionDetails = details
    order.updatedAt = now
    await order.save()

    try:
        from app.services.stock import restock_order_stock

        result["restocked"] = bool(await restock_order_stock(order))
    except Exception as exc:
        print(f"[Cancel] Stock restore failed for {order.id}: {exc}")
        result["restockError"] = str(exc)[:300]

    # Refund after the local cancel is durable, and never abort on failure — the
    # order is already cancelled with the carrier, so a Razorpay outage must not
    # leave it half-cancelled. A failure sets paymentStatus=refund_pending, which
    # the admin can retry from the order page.
    if refund and _is_refundable(order):
        try:
            from app.services.razorpay_refund import refund_order_payment

            refund_result = await refund_order_payment(order, reason=f"{reason}_refund")
            result["refund"] = refund_result
            result["refunded"] = bool(refund_result.get("ok"))
            if not refund_result.get("ok"):
                result["refundError"] = refund_result.get("error") or "refund_failed"
        except Exception as exc:  # noqa: BLE001
            print(f"[Cancel] Refund failed for {order.id}: {exc}")
            result["refundError"] = str(exc)[:300]
    elif refund:
        result["refundSkipped"] = (
            "no captured Razorpay payment" if order.paymentStatus else "order not paid"
        )

    try:
        from app.services import email_resend as email_svc

        user = await User.get(order.customerId) if order.customerId else None
        result["email"] = await email_svc.notify_order_email_once("CANCELLED", order, user)
    except Exception as exc:
        print(f"[Cancel] Email failed for {order.id}: {exc}")
        result["emailError"] = str(exc)[:300]

    result["previousStatus"] = prev_status
    result["hadShipment"] = had_shipment
    return result
