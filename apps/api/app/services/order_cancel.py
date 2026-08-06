"""Admin order cancel: DTDC cancel (if AWB), restock, archive, notify."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.documents import Order, User


def _status_lower(order: Order) -> str:
    return str(order.status or "").lower().strip()


def _has_shipment(order: Order) -> bool:
    if str(order.awb or "").strip():
        return True
    dtdc = (order.transactionDetails or {}).get("dtdc")
    if isinstance(dtdc, dict) and str(dtdc.get("reference_number") or "").strip():
        return True
    return False


def assert_cancellable(order: Order) -> None:
    status = _status_lower(order)
    if status == "cancelled":
        raise HTTPException(status_code=400, detail="Order is already cancelled")
    if status in {"delivered", "returned"} or order.isDelivered:
        raise HTTPException(
            status_code=400,
            detail="Delivered or returned orders cannot be cancelled here",
        )


async def cancel_order(
    order: Order,
    *,
    actor: str = "admin",
    reason: str = "admin_cancel",
) -> dict[str, Any]:
    """Cancel order end-to-end.

    - Unfulfilled: mark cancelled, restock, archive, email
    - Fulfilled (AWB): cancel DTDC consignment first, then same
    """
    assert_cancellable(order)

    result: dict[str, Any] = {
        "dtdcCancelled": False,
        "dtdc": None,
        "restocked": False,
        "email": None,
    }
    had_shipment = _has_shipment(order)
    prev_status = order.status

    if had_shipment:
        from app.services import dtdc as dtdc_svc

        try:
            dtdc_data = await dtdc_svc.cancel_consignment(order)
            result["dtdcCancelled"] = True
            result["dtdc"] = dtdc_data
            # cancel_consignment saves; reload-safe: continue on same instance
        except HTTPException as exc:
            # If DTDC already cancelled / missing, still finish local cancel when
            # the consignment is gone — otherwise surface the error.
            detail = str(exc.detail or "")
            soft = any(
                token in detail.lower()
                for token in ("already", "not found", "cancelled", "canceled", "no awb")
            )
            if not soft:
                raise
            result["dtdcWarning"] = detail

    now = datetime.utcnow()
    details = dict(order.transactionDetails or {})
    details["cancelledAt"] = now.isoformat()
    details["cancelledBy"] = actor
    details["cancelReason"] = reason
    if had_shipment and not details.get("dtdcCancelled"):
        details["dtdcCancelled"] = {
            "note": "local_cancel_without_dtdc_response",
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
