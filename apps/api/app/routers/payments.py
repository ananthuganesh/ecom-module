import hashlib
import hmac
import json
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request

from app.deps import CurrentUser
from app.documents import Order, PaymentTransaction, User
from app.serializers import remap_order
from app.services import payment_instrument as pay_instrument
from app.services import razorpay_cfg
from app.services.fulfillment import process_full_order_flow
from app.services.rate_limit import rate_limit_dependency
from app.services.stock import apply_order_commitments, ensure_stock_for_payment

router = APIRouter(prefix="/api/payments", tags=["payments"])


async def _get_razorpay_creds() -> tuple[str, str]:
    return razorpay_cfg.require_creds()


async def _upgrade_guest_customer_from_order(order: Order) -> None:
    """Replace placeholder Guest User name/phone from shipping details (Urban Aana pattern)."""
    if not order.customerId:
        return
    try:
        user = await User.get(order.customerId)
    except Exception:
        return
    if not user:
        return

    ship = order.shippingAddress or {}
    ship_name = " ".join(
        str(
            ship.get("name")
            or ship.get("fullName")
            or f"{ship.get('firstName') or ''} {ship.get('lastName') or ''}"
        ).split()
    ).strip()
    ship_phone = str(ship.get("phone") or ship.get("mobile") or "").strip()

    changed = False
    current = (user.name or "").strip().lower()
    if (not current or current in {"guest user", "guest", "customer"}) and ship_name:
        user.name = ship_name
        changed = True
    if not (user.phone or "").strip() and ship_phone:
        digits = "".join(ch for ch in ship_phone if ch.isdigit())
        if len(digits) >= 10 and not digits.startswith("0000"):
            user.phone = digits[-10:]
            changed = True
    ship_email = str(ship.get("email") or "").strip().lower()
    if ship_email and not (user.email or "").strip():
        user.email = ship_email
        changed = True
    if changed:
        user.updatedAt = datetime.utcnow()
        await user.save()


async def _auto_refund_razorpay_payment(payment_id: str, *, reason: str) -> dict:
    """Full refund when we cannot fulfill after capture. Never invents success."""
    if not payment_id:
        return {"ok": False, "error": "missing_payment_id"}
    try:
        key_id, key_secret = await _get_razorpay_creds()
        import razorpay

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
            }
        refund = client.payment.refund(
            payment_id,
            {
                "amount": remaining,
                "speed": "normal",
                "notes": {"reason": reason[:200]},
            },
        )
        return {
            "ok": True,
            "refund": refund if isinstance(refund, dict) else {"raw": refund},
            "amount_refunded": remaining,
        }
    except Exception as exc:
        print(f"[Payment] Auto-refund failed for {payment_id}: {exc}")
        return {"ok": False, "error": str(exc)[:300]}


def _apply_auto_refund_to_order(order: Order, *, reason: str, result: dict) -> None:
    """Persist refund outcome. Only mark refunded when Razorpay confirms."""
    details = dict(order.transactionDetails or {})
    details["autoRefundReason"] = reason
    if result.get("ok"):
        order.paymentStatus = "refunded"
        details["paymentStatus"] = "refunded"
        details.pop("autoRefundFailed", None)
        details.pop("autoRefundError", None)
        refund = result.get("refund") or {}
        if isinstance(refund, dict) and refund.get("id"):
            details["autoRefundId"] = refund["id"]
        if result.get("amount_refunded") is not None:
            details["autoRefundAmount"] = result["amount_refunded"]
        if result.get("already_refunded"):
            details["autoRefundAlreadyDone"] = True
    else:
        order.paymentStatus = "refund_pending"
        details["paymentStatus"] = "refund_pending"
        details["autoRefundFailed"] = True
        details["autoRefundError"] = result.get("error") or "refund_failed"
    order.transactionDetails = details
    order.updatedAt = datetime.utcnow()


async def _finalize_paid_order(order: Order, *, rz_payment_id: str, payment: dict, user: User | None = None) -> None:
    # Idempotent: already paid with this payment.
    if str(order.paymentStatus or "").lower() == "paid":
        if order.razorpayPaymentId and str(order.razorpayPaymentId) != str(rz_payment_id):
            await _auto_refund_razorpay_payment(
                rz_payment_id,
                reason="duplicate_payment_already_paid",
            )
            raise HTTPException(
                status_code=409,
                detail="Order already paid; duplicate payment is being refunded",
            )
        await apply_order_commitments(order)
        return

    # Stock before money permanence: re-reserve if TTL/abandon released the hold.
    try:
        await ensure_stock_for_payment(order)
    except HTTPException as stock_exc:
        refund_result = await _auto_refund_razorpay_payment(
            rz_payment_id, reason="stock_unavailable_at_capture"
        )
        _apply_auto_refund_to_order(
            order, reason="stock_unavailable_at_capture", result=refund_result
        )
        details = dict(order.transactionDetails or {})
        details["stockFailureReason"] = str(stock_exc.detail)
        order.transactionDetails = details
        await order.save()
        if refund_result.get("ok"):
            detail = "Item no longer available. Payment has been refunded."
        else:
            detail = (
                "Item no longer available. Automatic refund failed — "
                "our team will refund you shortly."
            )
        raise HTTPException(status_code=409, detail=detail) from stock_exc

    col = Order.get_pymongo_collection()
    claim = await col.find_one_and_update(
        {
            "_id": order.id,
            "paymentStatus": {"$nin": ["paid", "refunded", "partially_refunded", "refund_pending"]},
        },
        {
            "$set": {
                "paymentStatus": "paid",
                "razorpayPaymentId": rz_payment_id,
                "transactionDetails.paymentStatus": "paid",
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    if claim is None:
        refreshed = await Order.get(order.id)
        if refreshed and str(refreshed.paymentStatus or "").lower() == "paid":
            if refreshed.razorpayPaymentId and str(refreshed.razorpayPaymentId) != str(rz_payment_id):
                await _auto_refund_razorpay_payment(
                    rz_payment_id,
                    reason="duplicate_payment_race",
                )
            await apply_order_commitments(refreshed)
            order.paymentStatus = refreshed.paymentStatus
            order.transactionDetails = dict(refreshed.transactionDetails or {})
            return
        raise HTTPException(status_code=409, detail="Could not finalize payment status")

    order = await Order.get(order.id) or order
    pay_instrument.apply_instrument_to_order(order, payment)
    from app.services.order_abandon import revive_abandoned_on_payment

    revive_abandoned_on_payment(order)
    order.updatedAt = datetime.utcnow()
    await order.save()

    try:
        await apply_order_commitments(order)
    except Exception as commit_exc:
        refund_result = await _auto_refund_razorpay_payment(
            rz_payment_id, reason="stock_commit_failed"
        )
        _apply_auto_refund_to_order(order, reason="stock_commit_failed", result=refund_result)
        await order.save()
        if refund_result.get("ok"):
            detail = "Could not allocate stock. Payment has been refunded."
        else:
            detail = (
                "Could not allocate stock. Automatic refund failed — "
                "our team will refund you shortly."
            )
        raise HTTPException(status_code=409, detail=detail) from commit_exc

    await _upgrade_guest_customer_from_order(order)
    try:
        from app.services import erp_ops

        await erp_ops.ensure_order_invoice_safe(order, actor=user, context="payment_paid")
    except Exception:
        pass
    try:
        actor = user or (await User.get(order.customerId) if order.customerId else None)
        if actor:
            await process_full_order_flow(order, actor)
    except Exception as exc:
        order.shippingStatus = "Shipping Sync Failed"
        await order.save()
        print(f"[Payment] Fulfillment update failed: {exc}")
    try:
        from app.services import aisensy as aisensy_svc
        from app.services import email_resend as email_svc
        from app.services import meta_capi as meta_capi_svc

        notify_user = user or (await User.get(order.customerId) if order.customerId else None)
        await aisensy_svc.notify_order_event_once("orderPaid", order, notify_user)
        await email_svc.notify_order_email_once("CONFIRMED", order, notify_user)
        await email_svc.notify_staff_new_order(order, notify_user)
        await meta_capi_svc.notify_purchase_once(order, notify_user)
    except Exception as exc:
        print(f"[Notify] orderPaid: {exc}")


@router.get("/config")
async def payment_config():
    """Public checkout config (no secrets)."""
    prefs = await razorpay_cfg.get_prefs()
    return {"razorpayConfigured": prefs["isConnected"]}


@router.post("/create-order")
async def create_razorpay_order(
    body: dict,
    user: CurrentUser,
    _: None = Depends(rate_limit_dependency("pay-create", limit=30)),
):
    local_order_id = body.get("localOrderId") or body.get("orderId")
    if not local_order_id or not ObjectId.is_valid(str(local_order_id)):
        raise HTTPException(status_code=400, detail="localOrderId required")
    order = await Order.get(ObjectId(local_order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.customerId) != str(user.id) and not user.isAdmin:
        raise HTTPException(status_code=403, detail="Unauthorized: This order does not belong to you")
    if order.paymentStatus == "paid":
        raise HTTPException(status_code=400, detail="This order has already been paid")

    # Reuse open Razorpay order to avoid duplicate captures on retry.
    if order.razorpayOrderId:
        existing_txn = await PaymentTransaction.find_one(
            PaymentTransaction.orderId == order.id,
            PaymentTransaction.razorpayOrderId == order.razorpayOrderId,
        )
        expected_paise = int(round(float(order.finalPrice) * 100))
        txn_paise = int(existing_txn.amountInPaise or 0) if existing_txn else 0
        reusable = (
            existing_txn
            and str(existing_txn.status or "").lower() in ("created", "attempted", "")
            and txn_paise == expected_paise
            and expected_paise >= 100
        )
        if reusable:
            # Confirm the Razorpay order is still open; otherwise create a fresh one.
            try:
                import razorpay

                key_id, key_secret = await _get_razorpay_creds()
                client = razorpay.Client(auth=(key_id, key_secret))
                remote = client.order.fetch(order.razorpayOrderId)
                remote_status = str((remote or {}).get("status") or "").lower()
                if remote_status in ("created", "attempted"):
                    return {
                        "razorpayOrder": {
                            "id": order.razorpayOrderId,
                            "amount": txn_paise,
                            "currency": existing_txn.currency or "INR",
                        },
                        "keyId": key_id,
                        "razorpayOrderId": order.razorpayOrderId,
                        "amount": txn_paise,
                        "currency": existing_txn.currency or "INR",
                        "reused": True,
                    }
            except Exception:
                # Fall through and create a new Razorpay order.
                pass
            # Stale / paid / missing remote order — clear for recreation.
            order.razorpayOrderId = None
            await order.save()
            if existing_txn and str(existing_txn.status or "").lower() in ("created", "attempted", ""):
                existing_txn.status = "superseded"
                existing_txn.updatedAt = datetime.utcnow()
                await existing_txn.save()

    key_id, key_secret = await _get_razorpay_creds()
    amount_paise = int(round(float(order.finalPrice) * 100))
    if amount_paise < 100:
        raise HTTPException(status_code=400, detail="Order amount is too low for online payment")
    payload: dict = {
        "currency": "INR",
        "amount": amount_paise,
        "receipt": str(local_order_id)[:40],
        "notes": {"localOrderId": str(local_order_id), "userId": str(user.id)},
    }

    try:
        import razorpay

        client = razorpay.Client(auth=(key_id, key_secret))
        rz_order = client.order.create(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Payment provider error") from exc

    await PaymentTransaction(
        orderId=order.id,
        userId=user.id,
        razorpayOrderId=rz_order["id"],
        amountInPaise=int(payload["amount"]),
        currency="INR",
        status="created",
    ).insert()
    order.razorpayOrderId = rz_order["id"]
    order.paymentMethod = "razorpay"
    await order.save()
    return {
        "razorpayOrder": rz_order,
        "keyId": key_id,
        "razorpayOrderId": rz_order["id"],
        "amount": int(payload["amount"]),
        "currency": "INR",
    }


@router.post("/verify")
async def verify_payment(
    body: dict,
    user: CurrentUser,
    _: None = Depends(rate_limit_dependency("pay-verify", limit=30)),
):
    rz_order_id = body.get("razorpay_order_id") or body.get("razorpayOrderId")
    rz_payment_id = body.get("razorpay_payment_id") or body.get("razorpayPaymentId")
    rz_signature = body.get("razorpay_signature") or body.get("razorpaySignature")
    local_order_id = body.get("localOrderId") or body.get("orderId")

    if not all([rz_order_id, rz_payment_id, rz_signature, local_order_id]):
        raise HTTPException(status_code=400, detail="Missing payment verification fields")

    order = await Order.get(ObjectId(str(local_order_id)))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.customerId) != str(user.id) and not user.isAdmin:
        raise HTTPException(status_code=403, detail="Unauthorized")

    txn = await PaymentTransaction.find_one(
        PaymentTransaction.razorpayOrderId == rz_order_id,
        PaymentTransaction.orderId == order.id,
    )
    if not txn:
        txn = await PaymentTransaction.find_one(PaymentTransaction.razorpayOrderId == rz_order_id)
        if not txn or str(txn.orderId) != str(order.id):
            raise HTTPException(status_code=400, detail="Payment transaction does not match order")
    if str(txn.userId) != str(user.id) and not user.isAdmin:
        raise HTTPException(status_code=403, detail="Payment transaction does not belong to user")

    _, key_secret = await _get_razorpay_creds()
    expected = hmac.new(
        key_secret.encode("utf-8"),
        f"{rz_order_id}|{rz_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, rz_signature):
        txn.status = "failed"
        txn.failureReason = "Invalid signature"
        await txn.save()
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    import razorpay

    key_id, _ = await _get_razorpay_creds()
    client = razorpay.Client(auth=(key_id, key_secret))
    try:
        payment = client.payment.fetch(rz_payment_id)
    except Exception as exc:
        txn.status = "failed"
        txn.failureReason = f"Razorpay fetch failed: {exc}"
        await txn.save()
        raise HTTPException(status_code=502, detail="Could not verify payment with provider") from exc

    if str(order.paymentStatus or "").lower() == "paid":
        # Already finalized — idempotent success (same or missing payment id).
        if order.razorpayPaymentId and str(order.razorpayPaymentId) != str(rz_payment_id):
            await _auto_refund_razorpay_payment(
                rz_payment_id,
                reason="duplicate_payment_already_paid",
            )
            return {"success": True, "order": remap_order(order), "duplicateRefunded": True}
        await apply_order_commitments(order)
        return {"success": True, "order": remap_order(order)}

    pay_status = str(payment.get("status") or "").lower()
    if pay_status != "captured":
        txn.status = "failed"
        txn.failureReason = f"Unexpected payment status: {pay_status}"
        await txn.save()
        raise HTTPException(status_code=400, detail=f"Payment not captured (status={pay_status})")

    amount = int(payment.get("amount") or 0)
    if amount != int(txn.amountInPaise or 0):
        txn.status = "failed"
        txn.failureReason = f"Amount mismatch: razorpay={amount} txn={txn.amountInPaise}"
        await txn.save()
        raise HTTPException(status_code=400, detail="Payment amount does not match order")

    payment_order_id = payment.get("order_id")
    if payment_order_id and str(payment_order_id) != str(rz_order_id):
        txn.status = "failed"
        txn.failureReason = "Payment order id mismatch"
        await txn.save()
        raise HTTPException(status_code=400, detail="Payment does not belong to this Razorpay order")

    txn.status = "paid"
    txn.razorpayPaymentId = rz_payment_id
    txn.updatedAt = datetime.utcnow()
    await txn.save()

    await _finalize_paid_order(order, rz_payment_id=rz_payment_id, payment=payment, user=user)
    return {"success": True, "order": remap_order(order)}


async def _order_from_webhook_payload(payload: dict) -> Order | None:
    payment = (((payload.get("payload") or {}).get("payment") or {}).get("entity") or {})
    order_ent = (((payload.get("payload") or {}).get("order") or {}).get("entity") or {})
    rz_order_id = payment.get("order_id") or order_ent.get("id")
    if not rz_order_id:
        return None
    txn = await PaymentTransaction.find_one(PaymentTransaction.razorpayOrderId == rz_order_id)
    if txn and ObjectId.is_valid(str(txn.orderId)):
        return await Order.get(txn.orderId)
    return await Order.find_one(Order.razorpayOrderId == rz_order_id)


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    _: None = Depends(rate_limit_dependency("webhook", limit=120)),
):
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    secret = razorpay_cfg.webhook_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="Razorpay webhook secret is required")
    expected = hmac.new(str(secret).encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    payload = json.loads(body.decode("utf-8") or "{}")
    event = payload.get("event")
    payment = (((payload.get("payload") or {}).get("payment") or {}).get("entity") or {})
    rz_order_id = payment.get("order_id")
    rz_payment_id = payment.get("id")

    order = await _order_from_webhook_payload(payload)

    if event == "payment.captured" and rz_order_id:
        txn = await PaymentTransaction.find_one(PaymentTransaction.razorpayOrderId == rz_order_id)
        if not txn:
            raise HTTPException(status_code=400, detail="Unknown Razorpay order for webhook")
        if payment.get("amount") is not None:
            if int(payment.get("amount") or 0) != int(txn.amountInPaise or 0):
                raise HTTPException(status_code=400, detail="Webhook payment amount does not match transaction")
        txn.status = "paid"
        txn.razorpayPaymentId = rz_payment_id
        txn.webhookPayload = payload
        txn.updatedAt = datetime.utcnow()
        await txn.save()
        if order and order.paymentStatus != "paid":
            user = await User.get(order.customerId) if order.customerId else None
            await _finalize_paid_order(order, rz_payment_id=rz_payment_id, payment=payment, user=user)
        elif order and order.paymentStatus == "paid":
            if pay_instrument.apply_instrument_to_order(order, payment):
                await order.save()
            try:
                from app.services import erp_ops

                await erp_ops.ensure_order_invoice_safe(order, context="webhook_already_paid")
            except Exception:
                pass
        if order:
            await apply_order_commitments(order)

    return {"status": "ok"}
