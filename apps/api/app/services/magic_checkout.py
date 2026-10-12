"""Razorpay Magic Checkout: Razorpay's own popup collects the address and coupon.

How an order moves through it:

1. `/checkout` collects only the email (for the account), then creates the
   local order with no address and no delivery fee (`transactionDetails.checkout
   = "magic"`), and a Razorpay order carrying `line_items`. Their presence is
   what makes Razorpay open Magic Checkout instead of Standard Checkout.
2. While the shopper is in the popup, Razorpay calls three public endpoints
   (routers/magic_checkout.py) with our order id as `order_id` (the receipt):
   shipping info per address, the list of promotions, and applying a code.
3. After payment, `prepare_paid_order` pulls the address and applied coupon
   from the Razorpay order, recomputes the total from our own rates and coupon
   rules, and only then lets the normal paid-order path finalise it. A total
   that doesn't match what was paid is refused (the caller refunds).

Prepaid only: every shipping method answers `cod: false`.

Docs: https://razorpay.com/docs/payments/magic-checkout/web/
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.documents import Order, Product
from app.services.shipping_settings import get_shipping_settings, rate_for_zip

logger = logging.getLogger(__name__)

CHECKOUT_KEY = "magic"
SHIPPING_METHOD_ID = "standard"
# Razorpay drops the call after 10s; leave room for the rest of the response.
DELIVERABILITY_TIMEOUT_S = 5.0


class MagicAmountMismatch(Exception):
    """The amount paid is not what our own rates and coupon rules charge."""


def is_magic_order(order: Order | None) -> bool:
    details = order.transactionDetails if order and isinstance(order.transactionDetails, dict) else {}
    return details.get("checkout") == CHECKOUT_KEY


async def is_enabled() -> bool:
    from app.services.store_settings import get_payment_methods

    methods = await get_payment_methods()
    return bool(methods.get("razorpay", True) and methods.get("razorpayMagic", False))


def paise(amount: float | int | None) -> int:
    return int(round(float(amount or 0) * 100))


# --------------------------------------------------------------------------
# Razorpay order
# --------------------------------------------------------------------------


def _site_url() -> str:
    from app.services import email_templates as tpl

    return tpl.site_url().rstrip("/")


def _absolute(url: str | None) -> str | None:
    from app.services.aisensy import absolute_http_url

    return absolute_http_url(url, base=_site_url())


async def line_items(order: Order) -> list[dict[str, Any]]:
    """`line_items` for the Razorpay order; prices in paise, as the docs require."""
    from app.services.variants import variant_sku

    out: list[dict[str, Any]] = []
    for line in order.items or []:
        product = None
        if line.productId and ObjectId.is_valid(str(line.productId)):
            product = await Product.get(ObjectId(str(line.productId)))
        variant = " / ".join(p for p in [line.size, line.color] if p)
        sku = (variant_sku(product, color=line.color or "", size=line.size or "") if product else "") or str(
            line.productId
        )
        ref = (product.slug if product and product.slug else None) or str(line.productId)
        price = paise(line.price)
        item: dict[str, Any] = {
            "sku": sku,
            "variant_id": f"{line.productId}:{variant}" if variant else str(line.productId),
            "price": price,
            "offer_price": price,
            "quantity": int(line.quantity or 1),
            "name": (line.productName or "Product")[:255],
            "description": (variant or line.productName or "Product")[:255],
            "product_url": f"{_site_url()}/product/{ref}",
        }
        image = _absolute(line.image)
        if image:
            item["image_url"] = image
        out.append(item)
    return out


async def order_payload(order: Order, *, user_id: str) -> dict[str, Any]:
    items = await line_items(order)
    total = sum(i["offer_price"] * i["quantity"] for i in items)
    return {
        "currency": "INR",
        # Delivery and coupons are added by Razorpay through our endpoints.
        "amount": total,
        "line_items_total": total,
        "line_items": items,
        "receipt": str(order.id)[:40],
        "notes": {"localOrderId": str(order.id), "userId": user_id, "checkout": CHECKOUT_KEY},
    }


# --------------------------------------------------------------------------
# Shipping info
# --------------------------------------------------------------------------


async def shipping_quote(zipcode: str, country: str = "IN") -> tuple[bool, float]:
    """(serviceable, fee in rupees) for a prepaid delivery to this pincode."""
    from app.services import couriers

    pin = re.sub(r"\D", "", str(zipcode or ""))
    if str(country or "IN").upper() not in {"IN", "IND", "INDIA"} or len(pin) != 6:
        return False, 0.0
    try:
        result = await asyncio.wait_for(couriers.deliverability(pin), DELIVERABILITY_TIMEOUT_S)
    except Exception:  # noqa: BLE001
        # Unknown must never block a sale (same rule as the storefront checkout).
        result = {}
    if result.get("deliverable") is False:
        return False, 0.0
    serviceable, fee = rate_for_zip(await get_shipping_settings(), pin, "IN")
    return serviceable, float(fee or 0)


async def shipping_info(body: dict[str, Any]) -> dict[str, Any]:
    out = []
    for addr in body.get("addresses") or []:
        if not isinstance(addr, dict):
            continue
        serviceable, fee = await shipping_quote(addr.get("zipcode"), addr.get("country") or "IN")
        out.append(
            {
                "id": str(addr.get("id") or "0"),
                "zipcode": str(addr.get("zipcode") or ""),
                "state_code": str(addr.get("state_code") or ""),
                "country": str(addr.get("country") or "IN"),
                "shipping_methods": [
                    {
                        "id": SHIPPING_METHOD_ID,
                        "name": "Standard delivery" if serviceable else "Not deliverable",
                        "description": "Free delivery" if serviceable and fee <= 0 else "Standard delivery",
                        "serviceable": serviceable,
                        "shipping_fee": paise(fee) if serviceable else 0,
                        # Prepaid only.
                        "cod": False,
                        "cod_fee": 0,
                    }
                ],
            }
        )
    return {"addresses": out}


# --------------------------------------------------------------------------
# Promotions
# --------------------------------------------------------------------------


async def _pending_magic_order(receipt: Any) -> Order | None:
    ref = str(receipt or "").strip()
    if not ObjectId.is_valid(ref):
        return None
    order = await Order.get(ObjectId(ref))
    if not order or not is_magic_order(order):
        return None
    if str(order.paymentStatus or "").lower() != "pending":
        return None
    return order


def _order_lines(order: Order) -> list[dict[str, Any]]:
    return [
        {"productId": str(i.productId), "price": float(i.price), "quantity": int(i.quantity)}
        for i in order.items or []
    ]


async def get_promotions(body: dict[str, Any]) -> dict[str, Any]:
    # Coupons have no "show publicly" flag, so listing them would expose private
    # codes (influencer, staff). Shoppers type a code and apply_promotion checks it.
    return {"promotions": []}


def _failure(code: str, reason: str) -> dict[str, Any]:
    return {"failure_code": code, "failure_reason": reason}


async def apply_promotion(body: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    """(ok, response body). Same rules and limits as the storefront coupon box."""
    from app.services import discounts

    code = str(body.get("code") or "").strip().upper()
    order = await _pending_magic_order(body.get("order_id"))
    if not code or not order:
        return False, _failure("INVALID_PROMOTION", "This code can't be applied to this order.")
    try:
        coupon, discount = await discounts.validate_coupon(
            code, items=_order_lines(order), subtotal=float(order.total or 0)
        )
    except HTTPException as exc:
        # 404 = unknown code; 400 = expired, used up, or cart doesn't qualify.
        detail = str(exc.detail or "This code can't be applied.")
        unmet = exc.status_code == 400 and ("Minimum" in detail or "eligible" in detail or "Add products" in detail)
        return False, _failure("REQUIREMENT_NOT_MET" if unmet else "INVALID_PROMOTION", detail)

    discount = round(min(float(discount), float(order.total or 0)), 2)
    # Remembered so payment can be checked against what we quoted here.
    await Order.get_pymongo_collection().update_one(
        {"_id": order.id},
        {"$set": {"transactionDetails.magicPromotion": {"code": coupon.code, "discount": discount}}},
    )
    return True, {
        "promotion": {
            "reference_id": coupon.code,
            "type": "coupon",
            "code": coupon.code,
            "value": paise(discount),
            "value_type": "fixed_amount",
            "description": coupon.name or f"{coupon.code} applied",
        }
    }


# --------------------------------------------------------------------------
# After payment
# --------------------------------------------------------------------------


def _ten_digit_phone(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def shipping_address_from(customer: dict[str, Any], fallback_email: str = "") -> dict[str, Any]:
    """Razorpay `customer_details` → the address shape the rest of the store reads."""
    ship = customer.get("shipping_address") if isinstance(customer.get("shipping_address"), dict) else {}
    name = " ".join(str(ship.get("name") or "").split())
    first, _, last = name.partition(" ")
    phone = _ten_digit_phone(ship.get("contact") or customer.get("contact"))
    pin = re.sub(r"\D", "", str(ship.get("zipcode") or ""))
    return {
        "name": name,
        "firstName": first,
        "lastName": last,
        "email": str(customer.get("email") or fallback_email or "").strip().lower(),
        "phone": phone,
        "address": str(ship.get("line1") or "").strip(),
        "address2": str(ship.get("line2") or "").strip(),
        "city": str(ship.get("city") or "").strip(),
        "state": str(ship.get("state") or "").strip(),
        "postalCode": pin,
        "pincode": pin,
        "country": "India",
    }


async def _discount_for(order: Order, codes: list[str]) -> tuple[str | None, float]:
    """The discount we quoted for the code Razorpay says was applied."""
    from app.services import discounts

    if not codes:
        return None, 0.0
    code = codes[0].strip().upper()
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    quoted = details.get("magicPromotion") or {}
    if str(quoted.get("code") or "").upper() == code:
        return code, float(quoted.get("discount") or 0)
    try:
        coupon, discount = await discounts.validate_coupon(
            code, items=_order_lines(order), subtotal=float(order.total or 0)
        )
    except HTTPException:
        return code, 0.0
    return coupon.code, round(min(float(discount), float(order.total or 0)), 2)


async def prepare_paid_order(order: Order, rz_order: dict[str, Any], paid_paise: int) -> None:
    """Copy address, delivery fee and coupon onto the order, checking the amount.

    Raises MagicAmountMismatch when what was paid differs from what our own
    rates and coupon rules charge for that address and code.
    """
    customer = rz_order.get("customer_details") if isinstance(rz_order.get("customer_details"), dict) else {}
    address = shipping_address_from(customer, (order.shippingAddress or {}).get("email") or "")
    serviceable, fee = await shipping_quote(address["pincode"])
    if not serviceable:
        raise MagicAmountMismatch(f"pincode {address['pincode'] or '-'} is not serviceable")

    codes = [
        str(p.get("code") or "")
        for p in rz_order.get("promotions") or []
        if isinstance(p, dict) and p.get("code")
    ]
    code, discount = await _discount_for(order, codes)
    subtotal = float(order.total or 0)
    gift_fee = float(order.giftFee or 0)
    expected = paise(max(0.0, subtotal + fee + gift_fee - discount))
    # 1 paisa of slack for rounding between our rupees and Razorpay's paise.
    if paid_paise + 1 < expected:
        raise MagicAmountMismatch(f"paid {paid_paise} but expected {expected}")

    details = dict(order.transactionDetails or {})
    details["magicCheckout"] = {
        "shippingFee": rz_order.get("shipping_fee"),
        "promotions": codes,
        "expectedPaise": expected,
        "paidPaise": paid_paise,
        **({"notes": rz_order.get("notes")} if isinstance(rz_order.get("notes"), dict) else {}),
    }
    order.shippingAddress = address
    order.deliveryAmount = fee
    order.discount = discount
    order.discountAmount = discount
    # Usage is claimed when the order is committed (apply_order_commitments).
    order.couponCode = code if discount > 0 else None
    order.finalPrice = round(paid_paise / 100, 2)
    order.transactionDetails = details
    order.updatedAt = datetime.utcnow()

    from app.services.dtdc_est_cost import apply_dtdc_est_cost

    apply_dtdc_est_cost(order)
    await order.save()
