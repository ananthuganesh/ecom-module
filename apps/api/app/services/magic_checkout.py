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
    # Automatic discounts are priced in: offer_price is the unit price after them.
    line_discounts = list((_details(order).get("lineDiscounts") or []))
    for idx, line in enumerate(order.items or []):
        product = None
        if line.productId and ObjectId.is_valid(str(line.productId)):
            product = await Product.get(ObjectId(str(line.productId)))
        variant = " / ".join(p for p in [line.size, line.color] if p)
        sku = (variant_sku(product, color=line.color or "", size=line.size or "") if product else "") or str(
            line.productId
        )
        ref = (product.slug if product and product.slug else None) or str(line.productId)
        price = paise(line.price)
        qty = max(1, int(line.quantity or 1))
        off = float(line_discounts[idx]) if idx < len(line_discounts) else 0.0
        offer = max(0, price - int(round(off * 100 / qty)))
        item: dict[str, Any] = {
            "sku": sku,
            "variant_id": f"{line.productId}:{variant}" if variant else str(line.productId),
            "price": price,
            "offer_price": offer,
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
    """Fee per address, after any automatic free shipping this order qualifies for.

    Each quote is remembered on the order so a free-shipping code (which
    Razorpay applies without an address) and the post-payment check use the
    same numbers Razorpay showed the shopper.
    """
    order = await _pending_magic_order(body.get("order_id"))
    shopper = await _shopper(order, body.get("contact"), body.get("email")) if order else None
    quotes: dict[str, dict[str, Any]] = {}
    out = []
    for addr in body.get("addresses") or []:
        if not isinstance(addr, dict):
            continue
        serviceable, fee = await shipping_quote(addr.get("zipcode"), addr.get("country") or "IN")
        off, coupon = 0.0, None
        if order and serviceable:
            off, coupon = await free_shipping_for(order, shopper, fee)
            zip_key = re.sub(r"\D", "", str(addr.get("zipcode") or ""))
            if zip_key:
                quotes[zip_key] = {"fee": fee, "discount": off, "discountId": str(coupon.id) if coupon else None}
        charged = max(0.0, fee - off)
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
                        "description": "Free delivery" if serviceable and charged <= 0 else "Standard delivery",
                        "serviceable": serviceable,
                        "shipping_fee": paise(charged) if serviceable else 0,
                        # Prepaid only.
                        "cod": False,
                        "cod_fee": 0,
                    }
                ],
            }
        )
    if order and quotes:
        await Order.get_pymongo_collection().update_one(
            {"_id": order.id},
            {"$set": {f"transactionDetails.magicShippingQuotes.{z}": q for z, q in quotes.items()}},
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


async def _shopper(order: Order, contact: Any = None, email: Any = None):
    """Who is applying a code: the linked account, plus what Razorpay knows."""
    from app.documents import User
    from app.services.discounts import Shopper

    user = None
    if order.customerId and ObjectId.is_valid(str(order.customerId)):
        user = await User.get(ObjectId(str(order.customerId)))
    return Shopper.of(user, phone=contact, email=email or (order.shippingAddress or {}).get("email"))


def _order_lines(order: Order) -> list[dict[str, Any]]:
    return [
        {"productId": str(i.productId), "price": float(i.price), "quantity": int(i.quantity)}
        for i in order.items or []
    ]


async def get_promotions(body: dict[str, Any]) -> dict[str, Any]:
    """Coupons already public on product pages that this cart qualifies for.

    Private codes (influencer, staff) are never listed; shoppers type those
    and apply_promotion checks them.
    """
    from app.services import discounts

    order = await _pending_magic_order(body.get("order_id"))
    if not order:
        return {"promotions": []}
    shopper = await _shopper(order, body.get("contact"), body.get("email"))
    out = []
    for coupon in await discounts.shown_coupons():
        try:
            await discounts.validate_coupon(
                coupon.code, items=_order_lines(order), subtotal=float(order.total or 0), shopper=shopper
            )
        except HTTPException:
            continue
        promo = {"code": coupon.code, "summary": discounts.summary_text(coupon)}
        if coupon.name:
            promo["description"] = coupon.name
        out.append(promo)
    return {"promotions": out}


def _failure(code: str, reason: str) -> dict[str, Any]:
    return {"failure_code": code, "failure_reason": reason}


def _details(order: Order) -> dict[str, Any]:
    return order.transactionDetails if isinstance(order.transactionDetails, dict) else {}


def _baked(order: Order) -> list[dict[str, Any]]:
    """Automatic discounts already priced into this order's Razorpay line items."""
    return [d for d in _details(order).get("discounts") or [] if d.get("method") == "automatic" and not d.get("shipping")]


def _baked_goods(order: Order) -> float:
    details = _details(order)
    if details.get("autoGoodsDiscount") is not None:
        return float(details.get("autoGoodsDiscount") or 0)
    return round(sum(float(d.get("amount") or 0) for d in _baked(order)), 2)


async def _coupons(ids: list[Any]) -> list[Any]:
    from app.documents import Coupon

    oids = [ObjectId(str(i)) for i in ids if ObjectId.is_valid(str(i))]
    return await Coupon.find({"_id": {"$in": oids}}).to_list() if oids else []


async def _in_force(order: Order) -> list[Any]:
    """Coupons currently shaping this order's price (an applied code's set, else the automatic ones)."""
    promo = _details(order).get("magicPromotion") or {}
    if promo.get("discounts"):
        return await _coupons([d.get("id") for d in promo["discounts"]])
    return await _coupons([d.get("id") for d in _baked(order)])


async def free_shipping_for(order: Order, shopper: Any, fee: float) -> tuple[float, Any]:
    """(amount off the delivery fee, coupon) from automatic free shipping, if any.

    Only a free-shipping discount that combines with everything already in
    force counts, because those are fixed once Razorpay shows the prices.
    """
    from app.services import discounts

    if fee <= 0:
        return 0.0, None
    in_force = await _in_force(order)
    best: tuple[float, Any] = (0.0, None)
    for coupon in await discounts.live_automatic_discounts():
        if discounts.discount_class(coupon) != "shipping":
            continue
        if any(not discounts.combines(coupon, other) for other in in_force if other.id != coupon.id):
            continue
        if not await discounts.passes_rules(coupon, _order_lines(order), shopper, exclude_order_id=order.id):
            continue
        value = discounts.shipping_value(coupon, fee)
        if value > best[0]:
            best = (value, coupon)
    return best


_UNMET_PHRASES = (
    "Minimum", "eligible", "Add products", "qualifying items", "Sign in or add",
    "better discount", "delivery address", "doesn't apply", "combined with",
)


def _reject(detail: str, status: int = 400) -> tuple[bool, dict[str, Any]]:
    unmet = status == 400 and any(phrase in detail for phrase in _UNMET_PHRASES)
    return False, _failure("REQUIREMENT_NOT_MET" if unmet else "INVALID_PROMOTION", detail)


async def quote_code(order: Order, code: str, shopper: Any) -> tuple[bool, dict[str, Any]]:
    """(ok, quote | failure) for applying `code` on top of what this order already has.

    The quote's `discount` is the extra amount Razorpay takes off; `goods`,
    `shipping`, `discounts` and `lineDiscounts` describe the final result.
    """
    from app.services import discounts

    lines = _order_lines(order)
    baked = await _coupons([d.get("id") for d in _baked(order)])
    baked_goods = _baked_goods(order)
    details = _details(order)
    quotes = details.get("magicShippingQuotes") or {}
    ship_autos = await _coupons([q.get("discountId") for q in quotes.values() if q.get("discountId")])

    try:
        coupon = await discounts.find_code_coupon(code)
    except discounts.DiscountRejected as exc:
        return _reject(exc.detail, exc.status_code)

    if discounts.discount_class(coupon) == "shipping":
        try:
            await discounts.check_rules(coupon, lines, shopper, exclude_order_id=order.id)
        except discounts.DiscountRejected as exc:
            return _reject(exc.detail, exc.status_code)
        if any(not discounts.combines(coupon, other) for other in baked + ship_autos):
            return _reject("This code can't be combined with your other discounts")
        if not quotes:
            return _reject("Choose your delivery address first, then apply this code")
        # Razorpay doesn't say which address is chosen, so take the smallest fee quoted.
        value = min(
            min(max(0.0, float(q.get("fee") or 0) - float(q.get("discount") or 0)),
                discounts.shipping_value(coupon, float(q.get("fee") or 0)))
            for q in quotes.values()
        )
        if value <= 0:
            return _reject("Free shipping doesn't apply to this delivery")
        entry = {**discounts.AppliedDiscount(coupon, [0.0] * len(lines), value).as_dict()}
        return True, {
            "code": coupon.code,
            "discount": round(value, 2),
            "goods": baked_goods,
            "shipping": round(value, 2),
            "discounts": _baked(order) + [entry],
            "lineDiscounts": details.get("lineDiscounts") or [0.0] * len(lines),
        }

    res = await discounts.resolve(lines, shopper=shopper, code=code, only=baked, exclude_order_id=order.id)
    if res.code_error:
        return _reject(res.code_error, res.code_status)
    chosen = [a.coupon for a in res.applied]
    if any(not discounts.combines(ship, c) for ship in ship_autos for c in chosen if c.id != ship.id):
        return _reject("This code can't be combined with free shipping on your order")
    value = round(res.goods - baked_goods, 2)
    if value <= 0:
        return _reject("Your cart already has a better discount")
    return True, {
        "code": coupon.code,
        "discount": value,
        "goods": res.goods,
        "shipping": 0.0,
        "discounts": [a.as_dict() for a in res.applied],
        "lineDiscounts": [round(x, 2) for x in res.line_discounts],
    }


async def apply_promotion(body: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    """(ok, response body). Same rules and limits as the storefront coupon box."""
    code = str(body.get("code") or "").strip().upper()
    order = await _pending_magic_order(body.get("order_id"))
    if not code or not order:
        return False, _failure("INVALID_PROMOTION", "This code can't be applied to this order.")
    ok, quote = await quote_code(order, code, await _shopper(order, body.get("contact"), body.get("email")))
    if not ok:
        return False, quote
    # Remembered so payment can be checked against what we quoted here.
    await Order.get_pymongo_collection().update_one(
        {"_id": order.id}, {"$set": {"transactionDetails.magicPromotion": quote}}
    )
    from app.documents import Coupon

    coupon = await Coupon.find_one(Coupon.code == quote["code"])
    return True, {
        "promotion": {
            "reference_id": quote["code"],
            "type": "coupon",
            "code": quote["code"],
            "value": paise(quote["discount"]),
            "value_type": "fixed_amount",
            "description": (coupon.name if coupon and coupon.name else None) or f"{quote['code']} applied",
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


async def _promotion_for(order: Order, codes: list[str], shopper: Any) -> dict[str, Any] | None:
    """The quote for the code Razorpay says was applied (recomputed if we never quoted it)."""
    if not codes:
        return None
    code = codes[0].strip().upper()
    quoted = _details(order).get("magicPromotion") or {}
    if str(quoted.get("code") or "").upper() == code:
        return quoted
    ok, quote = await quote_code(order, code, shopper)
    return quote if ok else None


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
    shopper = await _shopper(order, address["phone"], address["email"])
    promo = await _promotion_for(order, codes, shopper)

    # Automatic free shipping: what Razorpay was quoted for this pincode, else our rule.
    quote = (_details(order).get("magicShippingQuotes") or {}).get(address["pincode"]) or {}
    if quote and float(quote.get("fee") or 0) == float(fee):
        auto_ship, auto_ship_id = float(quote.get("discount") or 0), quote.get("discountId")
    else:
        off, ship_coupon = await free_shipping_for(order, shopper, fee)
        auto_ship, auto_ship_id = off, (str(ship_coupon.id) if ship_coupon else None)

    baked_goods = _baked_goods(order)
    subtotal = float(order.total or 0)
    gift_fee = float(order.giftFee or 0)
    extra = float(promo.get("discount") or 0) if promo else 0.0
    expected = paise(max(0.0, subtotal - baked_goods + (fee - auto_ship) + gift_fee - extra))
    # 1 paisa of slack for rounding between our rupees and Razorpay's paise.
    if paid_paise + 1 < expected:
        raise MagicAmountMismatch(f"paid {paid_paise} but expected {expected}")

    details = dict(order.transactionDetails or {})
    applied = list(promo.get("discounts") or []) if promo else list(_baked(order))
    if auto_ship > 0 and auto_ship_id:
        ship_coupon = (await _coupons([auto_ship_id]) or [None])[0]
        if ship_coupon is not None:
            from app.services.discounts import AppliedDiscount

            applied.append(AppliedDiscount(ship_coupon, [0.0] * len(order.items or []), auto_ship).as_dict())
    goods = float(promo.get("goods") or 0) if promo else baked_goods
    shipping_off = round(auto_ship + (float(promo.get("shipping") or 0) if promo else 0.0), 2)
    discount = round(goods, 2)
    code = promo.get("code") if promo else None
    details["discounts"] = applied
    details["lineDiscounts"] = (promo.get("lineDiscounts") if promo else None) or details.get("lineDiscounts") or []
    details["shippingDiscount"] = shipping_off
    details["deliveryFee"] = fee
    details["magicCheckout"] = {
        "shippingFee": rz_order.get("shipping_fee"),
        "promotions": codes,
        "expectedPaise": expected,
        "paidPaise": paid_paise,
        **({"notes": rz_order.get("notes")} if isinstance(rz_order.get("notes"), dict) else {}),
    }
    order.shippingAddress = address
    order.deliveryAmount = round(max(0.0, fee - shipping_off), 2)
    order.discount = discount
    order.discountAmount = discount
    # Usage is claimed when the order is committed (apply_order_commitments).
    order.couponCode = code
    order.finalPrice = round(paid_paise / 100, 2)
    order.transactionDetails = details
    order.updatedAt = datetime.utcnow()

    from app.services.dtdc_est_cost import apply_dtdc_est_cost

    apply_dtdc_est_cost(order)
    await order.save()


# --------------------------------------------------------------------------
# Customer account (one-click: no login before the popup)
# --------------------------------------------------------------------------


async def link_customer(order: Order) -> Any:
    """Attach a paid one-click order to a customer account, creating one if needed.

    Matches on the phone first, because Razorpay verified it with an OTP, then
    on the email. Never signs anyone in: the account only gains the order.
    """
    from pymongo.errors import DuplicateKeyError

    from app.documents import User
    from app.services.customer_url_id import next_customer_url_id

    if order.customerId:
        return None
    addr = order.shippingAddress or {}
    phone = _ten_digit_phone(addr.get("phone"))
    email = str(addr.get("email") or "").strip().lower()

    user = None
    if len(phone) == 10:
        matches = await User.find(
            {"phone": {"$in": [phone, f"91{phone}", f"+91{phone}", f"0{phone}"]}}
        ).sort("createdAt").to_list()
        user = next((u for u in matches if email and (u.email or "").lower() == email), None) or (
            matches[0] if matches else None
        )
    if not user and email:
        user = await User.find_one(User.email == email)
    if not user:
        name = str(addr.get("name") or "").strip() or (email.split("@")[0] if email else "Customer")
        user = User(
            name=name,
            firstName=addr.get("firstName") or None,
            lastName=addr.get("lastName") or None,
            email=email or None,
            phone=phone or None,
            password=None,
        )
        user.customerUrlId = await next_customer_url_id()
        try:
            await user.insert()
        except DuplicateKeyError:
            # Same email created by a concurrent request (verify vs webhook).
            user = await User.find_one(User.email == email)
    if not user:
        return None
    order.customerId = user.id
    order.updatedAt = datetime.utcnow()
    await order.save()
    return user


# --------------------------------------------------------------------------
# Abandoned-checkout webhook
# --------------------------------------------------------------------------

ABANDONED_SAMPLE_KEY = "magic_abandoned_samples"


def _first(*values: Any) -> str:
    for v in values:
        if v not in (None, "") and not isinstance(v, (dict, list)):
            return str(v).strip()
    return ""


async def _order_for_abandoned(body: dict[str, Any]) -> Order | None:
    notes = body.get("notes") if isinstance(body.get("notes"), dict) else {}
    ref = _first(body.get("receipt"), notes.get("localOrderId"), body.get("order_id"))
    if ObjectId.is_valid(ref):
        order = await Order.get(ObjectId(ref))
        if order:
            return order
    rz = _first(body.get("razorpay_order_id"), body.get("rzp_order_id"), body.get("order_id"))
    if rz:
        rz = rz if rz.startswith("order_") else f"order_{rz}"
        return await Order.find_one(Order.razorpayOrderId == rz)
    return None


async def _keep_sample(body: dict[str, Any]) -> None:
    """Keep the last few raw payloads: Razorpay doesn't publish the full format."""
    from app.documents import Setting

    try:
        setting = await Setting.find_one(Setting.key == ABANDONED_SAMPLE_KEY)
        samples = list((setting.value or {}).get("samples") or []) if setting else []
        samples = ([{"at": datetime.utcnow().isoformat(), "body": body}] + samples)[:10]
        if setting:
            setting.value = {"samples": samples}
            await setting.save()
        else:
            await Setting(key=ABANDONED_SAMPLE_KEY, value={"samples": samples}).insert()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not keep Magic abandoned sample: %s", exc)


async def record_abandoned(body: dict[str, Any]) -> bool:
    """Add the phone/email Razorpay collected to our abandoned-cart row.

    Only for a guest's unpaid Magic order, and only onto a guest row: the
    endpoint is public, so it must never put contact details on an account's
    cart (the recovery link signs in the cart's account).
    """
    from app.documents import AbandonedCheckout
    from app.services import cart_recovery

    await _keep_sample(body)
    order = await _order_for_abandoned(body)
    if not order or not is_magic_order(order) or order.customerId:
        return False
    if str(order.paymentStatus or "").lower() != "pending":
        return False

    customer = body.get("customer") if isinstance(body.get("customer"), dict) else {}
    ship = next(
        (
            v
            for k, v in {**body, **customer}.items()
            if k.lower() in {"shipping_address", "shippingaddress"} and isinstance(v, dict)
        ),
        {},
    )
    phone = _ten_digit_phone(_first(body.get("phone"), body.get("contact"), customer.get("contact"), customer.get("phone"), ship.get("contact")))
    email = _first(body.get("email"), customer.get("email")).lower()
    if len(phone) != 10 and "@" not in email:
        return False

    guest_id = str((order.transactionDetails or {}).get("guestId") or "").strip()
    row = None
    if guest_id:
        row = await AbandonedCheckout.find_one(
            AbandonedCheckout.guestId == guest_id,
            AbandonedCheckout.status == "abandoned",
            AbandonedCheckout.userId == None,  # noqa: E711
        )
    if row is None:
        row = AbandonedCheckout(
            guestId=guest_id or None,
            items=[
                {
                    "productId": str(i.productId),
                    "name": i.productName,
                    "price": i.price,
                    "quantity": i.quantity,
                    "color": i.color,
                    "size": i.size,
                    "image": i.image,
                }
                for i in order.items or []
            ],
            totalAmount=float(order.total or 0),
            status="abandoned",
        )
    details = dict(row.customerDetails or {})
    if len(phone) == 10:
        details["phone"] = phone
    if "@" in email:
        details["email"] = email
    name = _first(ship.get("name"), customer.get("name"), body.get("name"))
    if name and not details.get("name"):
        details["name"] = name
    row.customerDetails = details
    row.orderId = order.id
    row.lastActivityAt = datetime.utcnow()
    await cart_recovery.ensure_recovery_token(row)
    await row.save() if row.id else await row.insert()
    return True
