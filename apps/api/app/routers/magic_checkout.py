"""Endpoints Razorpay calls while a shopper is in the Magic Checkout popup.

Register these in the Razorpay Dashboard (Magic Checkout → Platform Setup →
Custom E-Commerce Platform):

- Shipping info:      {site}/api/payments/magic/shipping-info
- Get promotions:     {site}/api/payments/magic/promotions
- Apply promotion:    {site}/api/payments/magic/apply-promotion
- Abandoned webhook:  {site}/api/payments/magic/abandoned

The storefront itself uses /start (create the order and open the popup, no
login needed) and /verify (confirm by Razorpay's signature).

Razorpay sends no signature, and the docs ask for them to be unauthenticated.
They only quote: nothing here can take money or confirm an order, and the
amount paid is checked against our own rates after payment
(services/magic_checkout.prepare_paid_order). The docs show these as both GET
and POST with a JSON body, so both are accepted.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from app.deps import OptionalUser
from app.documents import Order, PaymentTransaction, Product
from app.services import magic_checkout
from app.services.rate_limit import rate_limit_dependency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments/magic", tags=["payments"])

# Calls come from Razorpay's servers, so one IP carries every shopper's checkout.
_razorpay_rate_limit = rate_limit_dependency("magic-checkout", limit=600)


async def _json_body(request: Request) -> dict:
    raw = await request.body()
    if not raw:
        return {}
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return {}
    return body if isinstance(body, dict) else {}


@router.api_route("/shipping-info", methods=["GET", "POST"])
async def shipping_info(request: Request, _: None = Depends(_razorpay_rate_limit)):
    return await magic_checkout.shipping_info(await _json_body(request))


@router.api_route("/promotions", methods=["GET", "POST"])
async def get_promotions(request: Request, _: None = Depends(_razorpay_rate_limit)):
    return await magic_checkout.get_promotions(await _json_body(request))


@router.api_route("/apply-promotion", methods=["GET", "POST"])
async def apply_promotion(request: Request, _: None = Depends(_razorpay_rate_limit)):
    ok, body = await magic_checkout.apply_promotion(await _json_body(request))
    if not ok:
        logger.info("Magic Checkout promotion refused: %s", body.get("failure_reason"))
    return JSONResponse(body, status_code=200 if ok else 400)


@router.api_route("/abandoned", methods=["GET", "POST"])
async def abandoned(request: Request, _: None = Depends(_razorpay_rate_limit)):
    """Razorpay's abandoned-checkout webhook: adds phone/email for cart recovery."""
    try:
        await magic_checkout.record_abandoned(await _json_body(request))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Magic abandoned webhook failed: %s", exc)
    # Always 200: a retry can't fix a payload we couldn't use.
    return {"status": "ok"}


# --------------------------------------------------------------------------
# Storefront: one-click start and verify
# --------------------------------------------------------------------------


def _owns_pending(order: Order, user, guest_id: str) -> bool:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    if not magic_checkout.is_magic_order(order) or str(order.paymentStatus or "").lower() != "pending":
        return False
    if order.customerId:
        return bool(user and str(user.id) == str(order.customerId))
    return bool(guest_id) and str(details.get("guestId") or "") == guest_id


CartKey = tuple[tuple[str, str, str, int, float], ...]


def _order_cart_key(order: Order) -> CartKey:
    return tuple(
        sorted(
            (
                str(line.productId),
                line.size or "",
                line.color or "",
                int(line.quantity or 0),
                round(float(line.price or 0), 2),
            )
            for line in order.items or []
        )
    )


async def _requested_cart_key(order_items: list) -> CartKey | None:
    """The cart as place_pending_order would store it (axes and current price).

    No stock check: a pending order for this same cart already holds that stock.
    None when any line is unusable — then a fresh order reports the real error.
    """
    from app.services.variants import product_variant_axes

    lines = []
    for oi in order_items or []:
        if not isinstance(oi, dict):
            return None
        pid = str(oi.get("product") or "")
        if not ObjectId.is_valid(pid):
            return None
        product = await Product.get(ObjectId(pid))
        if not product or not product.pricing:
            return None
        try:
            qty = int(oi.get("qty") or 1)
        except (TypeError, ValueError):
            return None
        axes = product_variant_axes(product)
        lines.append(
            (
                str(product.id),
                (oi.get("size") or "") if axes.get("size") else "",
                (oi.get("color") or "") if axes.get("color") else "",
                qty,
                round(float(product.pricing.sellingPrice or 0), 2),
            )
        )
    return tuple(sorted(lines)) if lines else None


async def _recent_pending_order(user, guest_id: str, cart: CartKey) -> Order | None:
    """This shopper's newest unpaid Magic order for the same cart, if still fresh.

    Covers a reload or a second "Buy now", where the page lost localOrderId and
    would otherwise open a duplicate pending order for the same cart.
    """
    from app.services.order_abandon import abandoned_order_minutes

    if user is not None:
        owner: dict = {"customerId": user.id}
    elif guest_id:
        owner = {"customerId": None, "transactionDetails.guestId": guest_id}
    else:
        return None
    since = datetime.utcnow() - timedelta(minutes=abandoned_order_minutes())
    recent = (
        await Order.find(
            {
                **owner,
                "status": "order placed",
                "paymentStatus": "pending",
                "transactionDetails.checkout": magic_checkout.CHECKOUT_KEY,
                "createdAt": {"$gte": since},
            }
        )
        .sort([("createdAt", -1)])
        .limit(5)
        .to_list()
    )
    for order in recent:
        if _owns_pending(order, user, guest_id) and _order_cart_key(order) == cart:
            return order
    return None


@router.post("/start")
async def start(
    body: dict,
    request: Request,
    user: OptionalUser,
    _: None = Depends(rate_limit_dependency("magic-start", limit=20)),
):
    """Create the order and its Razorpay order in one go, signed in or not.

    A retry from the same browser (same guestId, or same account) with the same
    cart reuses the pending order — named by localOrderId, or found by owner when
    the page lost it — so reopening the popup doesn't hold the stock twice or
    leave duplicate unpaid orders. A changed cart or price gets a fresh order.
    """
    from app.routers.orders import place_pending_order
    from app.routers.payments import open_razorpay_order

    if not await magic_checkout.is_enabled():
        raise HTTPException(status_code=400, detail="Express checkout is currently unavailable")
    raw_guest = body.get("guestId")
    guest_id = raw_guest.strip()[:100] if isinstance(raw_guest, str) else ""

    cart = await _requested_cart_key(body.get("orderItems") or [])
    order = None
    previous = str(body.get("localOrderId") or "")
    if cart and ObjectId.is_valid(previous):
        candidate = await Order.get(ObjectId(previous))
        if candidate and _owns_pending(candidate, user, guest_id) and _order_cart_key(candidate) == cart:
            order = candidate
    if order is None and cart:
        order = await _recent_pending_order(user, guest_id, cart)
    if order is None:
        order = await place_pending_order(
            {
                "orderItems": body.get("orderItems") or [],
                "checkoutMode": "magic",
                "paymentMethod": "razorpay",
                "guestId": guest_id or None,
                "attribution": body.get("attribution"),
            },
            user,
            request,
        )
    payment = await open_razorpay_order(order, user_id=user.id if user else None)
    prefill = {}
    if user:
        prefill = {
            "name": user.name or "",
            "email": user.email or "",
            "contact": f"+91{magic_checkout._ten_digit_phone(user.phone)}"
            if len(magic_checkout._ten_digit_phone(user.phone)) == 10
            else "",
        }
    return {**payment, "localOrderId": str(order.id), "prefill": prefill}


@router.post("/verify")
async def verify(
    body: dict,
    user: OptionalUser,
    _: None = Depends(rate_limit_dependency("magic-verify", limit=30)),
):
    """Confirm a one-click payment. Razorpay's signature is the proof; no login needed."""
    from app.routers import payments

    rz_order_id = str(body.get("razorpay_order_id") or body.get("razorpayOrderId") or "")
    rz_payment_id = str(body.get("razorpay_payment_id") or body.get("razorpayPaymentId") or "")
    rz_signature = str(body.get("razorpay_signature") or body.get("razorpaySignature") or "")
    local_order_id = str(body.get("localOrderId") or "")
    if not (rz_order_id and rz_payment_id and rz_signature and ObjectId.is_valid(local_order_id)):
        raise HTTPException(status_code=400, detail="Missing payment verification fields")

    order = await Order.get(ObjectId(local_order_id))
    if not order or not magic_checkout.is_magic_order(order) or order.razorpayOrderId != rz_order_id:
        raise HTTPException(status_code=400, detail="Payment does not match this order")
    txn = await PaymentTransaction.find_one(
        PaymentTransaction.razorpayOrderId == rz_order_id, PaymentTransaction.orderId == order.id
    )
    if not txn:
        raise HTTPException(status_code=400, detail="Payment transaction does not match order")

    key_id, key_secret = await payments._get_razorpay_creds()
    expected = hmac.new(
        key_secret.encode("utf-8"), f"{rz_order_id}|{rz_payment_id}".encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, rz_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    def receipt(o: Order) -> dict:
        # The caller holds a valid payment signature, but keep the reply to what
        # the success page needs; addresses stay behind the account.
        return {"_id": str(o.id), "finalPrice": o.finalPrice, "couponCode": o.couponCode, "orderNumber": o.orderNumber}

    if str(order.paymentStatus or "").lower() == "paid":
        if order.razorpayPaymentId and str(order.razorpayPaymentId) != rz_payment_id:
            await payments._auto_refund_razorpay_payment(rz_payment_id, reason="duplicate_payment_already_paid")
            return {"success": True, "order": receipt(order), "duplicateRefunded": True}
        return {"success": True, "order": receipt(order)}

    import razorpay

    try:
        payment = razorpay.Client(auth=(key_id, key_secret)).payment.fetch(rz_payment_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not verify payment with provider") from exc
    if str(payment.get("status") or "").lower() != "captured":
        raise HTTPException(status_code=400, detail="Payment not captured")
    if payment.get("order_id") and str(payment.get("order_id")) != rz_order_id:
        raise HTTPException(status_code=400, detail="Payment does not belong to this Razorpay order")

    if not await payments._prepare_magic_payment(order, txn, payment, rz_order_id):
        raise HTTPException(status_code=400, detail="Payment amount does not match the order. It is being refunded.")

    txn.status = "paid"
    txn.razorpayPaymentId = rz_payment_id
    txn.updatedAt = datetime.utcnow()
    await txn.save()
    await payments._finalize_paid_order(order, rz_payment_id=rz_payment_id, payment=payment, user=None)
    return {"success": True, "order": receipt(order)}
