"""Razorpay refund helpers for admin cancel refunds and payment auto-refunds."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.documents import Order


async def refund_razorpay_payment(
    payment_id: str,
    *,
    reason: str,
    amount_paise: int | None = None,
) -> dict[str, Any]:
    """Full (or remaining) refund. Never invents success."""
    if not payment_id:
        return {"ok": False, "error": "missing_payment_id"}
    try:
        from app.services.razorpay_cfg import require_creds
        import razorpay

        key_id, key_secret = require_creds()
        client = razorpay.Client(auth=(key_id, key_secret))
        payment = client.payment.fetch(payment_id)
        amount_paid = int(payment.get("amount") or 0)
        already_refunded = int(payment.get("amount_refunded") or 0)
        remaining = amount_paid - already_refunded
        if remaining <= 0:
            return {
                "ok": True,
                "already_refunded": True,
                "amount_refunded": already_refunded,
                "amount_refunded_paise": already_refunded,
            }
        refund_amount = remaining if amount_paise is None else min(int(amount_paise), remaining)
        if refund_amount <= 0:
            return {"ok": False, "error": "invalid_refund_amount"}
        refund = client.payment.refund(
            payment_id,
            {
                "amount": refund_amount,
                "speed": "normal",
                "notes": {"reason": str(reason or "refund")[:200]},
            },
        )
        return {
            "ok": True,
            "refund": refund if isinstance(refund, dict) else {"raw": refund},
            "amount_refunded": refund_amount,
            "amount_refunded_paise": refund_amount,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[Razorpay] Refund failed for {payment_id}: {exc}")
        return {"ok": False, "error": str(exc)[:300]}


def apply_refund_to_order(order: Order, *, reason: str, result: dict[str, Any]) -> None:
    """Persist refund outcome on the order. Only mark refunded when Razorpay confirms."""
    details = dict(order.transactionDetails or {})
    details["refundReason"] = reason
    now = datetime.utcnow().isoformat()

    if result.get("ok"):
        paise = int(result.get("amount_refunded_paise") or result.get("amount_refunded") or 0)
        rupees = round(paise / 100.0, 2) if paise else 0
        prev = float(details.get("refundedAmount") or 0)
        details["refundedAmount"] = round(prev + rupees, 2) if rupees else prev or rupees
        details["refundedAt"] = now
        details.pop("autoRefundFailed", None)
        details.pop("autoRefundError", None)

        refund = result.get("refund") if isinstance(result.get("refund"), dict) else {}
        refund_id = str((refund or {}).get("id") or "").strip()
        entries = list(details.get("refunds") or [])
        entries.append(
            {
                "id": refund_id or None,
                "amount": rupees,
                "amountPaise": paise,
                "reason": reason,
                "at": now,
                "alreadyRefunded": bool(result.get("already_refunded")),
            }
        )
        details["refunds"] = entries
        if refund_id:
            details["lastRefundId"] = refund_id

        order.paymentStatus = "refunded"
        details["paymentStatus"] = "refunded"
        if result.get("already_refunded"):
            details["autoRefundAlreadyDone"] = True
    else:
        order.paymentStatus = "refund_pending"
        details["paymentStatus"] = "refund_pending"
        details["autoRefundFailed"] = True
        details["autoRefundError"] = result.get("error") or "refund_failed"
        details["refundPendingAt"] = now

    order.transactionDetails = details
    order.updatedAt = datetime.utcnow()


async def refund_order_payment(order: Order, *, reason: str = "admin_cancel_refund") -> dict[str, Any]:
    """Issue Razorpay refund for a cancelled (or refund-pending) paid order."""
    status = str(order.status or "").lower()
    if status != "cancelled":
        raise HTTPException(status_code=400, detail="Refund is only available after the order is cancelled")

    pay = str(order.paymentStatus or "").lower()
    details = order.transactionDetails or {}
    details_pay = str(details.get("paymentStatus") or "").lower()
    if pay == "refunded" or details_pay == "refunded":
        raise HTTPException(status_code=400, detail="Order is already refunded")

    # Paid / refund_pending (retry) only
    if pay not in {"paid", "refund_pending", "partially_refunded"} and details_pay not in {
        "paid",
        "refund_pending",
        "partially_refunded",
    }:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot refund order with payment status '{pay or details_pay or 'unknown'}'",
        )

    payment_id = str(
        order.razorpayPaymentId
        or details.get("razorpayPaymentId")
        or details.get("paymentId")
        or ""
    ).strip()
    if not payment_id:
        raise HTTPException(
            status_code=400,
            detail="No Razorpay payment id on this order — cannot refund via API",
        )

    result = await refund_razorpay_payment(payment_id, reason=reason)
    apply_refund_to_order(order, reason=reason, result=result)
    await order.save()
    if not result.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=result.get("error") or "Razorpay refund failed",
        )
    return result
