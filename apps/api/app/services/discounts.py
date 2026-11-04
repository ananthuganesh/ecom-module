"""Discount / coupon rules for order, product, and Buy X Get Y kinds (Shopify-style).

A coupon is checked against a cart (server-priced lines) and, when its rules
need it, the shopper: specific-customer codes and once-per-customer codes
match a signed-in account or, for Magic Checkout guests, the phone/email
Razorpay passes. Legacy coupons (saved before these rules existed) keep their
old behaviour through the model defaults.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from bson import ObjectId

from app.documents import Coupon, Order, Product, User

PAID_STATUSES = ("paid", "Paid", "PAID", "captured", "refunded", "partially_refunded", "refund_pending")


# ─────────────────────────────────────────────────────────────── shopper


def _ten_digits(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-10:] if len(digits) >= 10 else ""


@dataclass(frozen=True)
class Shopper:
    """Who is checking out, as far as we know before payment."""

    user_id: str = ""
    phone: str = ""
    email: str = ""

    @classmethod
    def of(cls, user: Any = None, *, phone: Any = None, email: Any = None) -> "Shopper":
        return cls(
            user_id=str(getattr(user, "id", "") or ""),
            phone=_ten_digits(phone) or _ten_digits(getattr(user, "phone", None)),
            email=str(email or getattr(user, "email", "") or "").strip().lower(),
        )

    @property
    def known(self) -> bool:
        return bool(self.user_id or self.phone or self.email)


# ─────────────────────────────────────────────────────────────── cart lines


def _norm_items(items: list[dict] | None) -> list[dict]:
    out = []
    for raw in items or []:
        pid = str(raw.get("productId") or raw.get("product") or raw.get("_id") or "")
        if not pid:
            continue
        try:
            qty = int(raw.get("quantity") or raw.get("qty") or 1)
            price = float(raw.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if qty <= 0:
            continue
        out.append({"productId": pid, "quantity": qty, "price": price})
    return out


async def _with_collections(lines: list[dict]) -> list[dict]:
    """Attach each line's product collections (Category ids) for collection rules."""
    ids = [ObjectId(p) for p in {line["productId"] for line in lines} if ObjectId.is_valid(p)]
    by_id: dict[str, set[str]] = {}
    if ids:
        for product in await Product.find({"_id": {"$in": ids}}).to_list():
            by_id[str(product.id)] = {str(c) for c in (product.collections or [])}
    return [{**line, "collections": by_id.get(line["productId"], set())} for line in lines]


def _target(applies_to: str | None, product_ids: list[str], collection_ids: list[str]):
    """Predicate: does a line belong to this product/collection selection?"""
    if (applies_to or "products") == "collections":
        wanted = {str(c) for c in collection_ids or [] if c}
        return lambda line: bool(wanted & line.get("collections", set()))
    wanted = {str(p) for p in product_ids or [] if p}
    return lambda line: line["productId"] in wanted


def _product_target(coupon: Coupon):
    return _target(coupon.appliesTo, coupon.productIds, coupon.collectionIds)


def _buy_target(coupon: Coupon):
    return _target(coupon.buyAppliesTo, coupon.buyProductIds or coupon.productIds, coupon.buyCollectionIds)


def _get_target(coupon: Coupon):
    if (coupon.getAppliesTo or "products") == "collections":
        return _target("collections", [], coupon.getCollectionIds)
    # Legacy: an empty "gets" list meant "same as the buy products".
    if not coupon.getProductIds and (coupon.buyAppliesTo or "products") == "products":
        return _target("products", coupon.buyProductIds or coupon.productIds, [])
    return _target("products", coupon.getProductIds, [])


def min_requirement(coupon: Coupon) -> str:
    """none | amount | quantity. Legacy coupons only had a minimum amount."""
    req = (coupon.minRequirement or "").lower()
    if req in ("none", "amount", "quantity"):
        return req
    return "amount" if float(coupon.minOrderAmount or 0) > 0 else "none"


# ─────────────────────────────────────────────────────────────── value


def _apply_value(coupon: Coupon, base: float) -> float:
    if base <= 0:
        return 0.0
    if (coupon.discountType or "percentage") == "percentage":
        discount = (base * float(coupon.discountValue or 0)) / 100.0
        if coupon.maxDiscount is not None:
            discount = min(discount, float(coupon.maxDiscount))
        return max(0.0, min(discount, base))
    return max(0.0, min(float(coupon.discountValue or 0), base))


def _product_discount(coupon: Coupon, eligible: list[dict]) -> float:
    base = sum(line["price"] * line["quantity"] for line in eligible)
    if (coupon.discountType or "percentage") == "fixed" and not coupon.oncePerOrder:
        # Shopify: a fixed amount comes off each eligible item.
        off = float(coupon.discountValue or 0)
        return max(0.0, sum(min(off, line["price"]) * line["quantity"] for line in eligible))
    return _apply_value(coupon, base)


def _bxgy_discount(coupon: Coupon, lines: list[dict]) -> float:
    """Buy X get Y the Shopify way: bought and discounted items are separate units.

    Each application takes the cheapest qualifying "get" units, then needs the
    "buy" condition met by other units (quantity, or amount spent on them).
    Repeats until the cart runs out or the per-order cap is reached.
    """
    is_buy, is_get = _buy_target(coupon), _get_target(coupon)
    units = []
    for line in lines:
        units.extend([{"price": line["price"], "buy": is_buy(line), "get": is_get(line)}] * line["quantity"])
    units = [dict(u) for u in units]
    by_amount = (coupon.buyRequirement or "quantity") == "amount"
    need_qty = max(1, int(coupon.buyQuantity or 1))
    need_amount = float(coupon.buyAmount or 0)
    if by_amount and need_amount <= 0:
        return 0.0
    get_qty = max(1, int(coupon.getQuantity or 1))
    cap = coupon.maxUsesPerOrder if coupon.maxUsesPerOrder else None

    value_type = (coupon.getValueType or "percentage").lower()
    pct = 100.0 if value_type == "free" else max(0.0, min(100.0, float(coupon.getDiscountPercent or 0)))
    amount_off = float(coupon.getAmountOff or 0)

    total = 0.0
    uses = 0
    used: set[int] = set()
    while cap is None or uses < cap:
        gets = [i for i in sorted(range(len(units)), key=lambda i: units[i]["price"])
                if i not in used and units[i]["get"]][:get_qty]
        if len(gets) < get_qty:
            break
        pool = [i for i in sorted(range(len(units)), key=lambda i: -units[i]["price"])
                if i not in used and i not in gets and units[i]["buy"]]
        buys: list[int] = []
        if by_amount:
            spent = 0.0
            for i in pool:
                if spent >= need_amount:
                    break
                buys.append(i)
                spent += units[i]["price"]
            if spent < need_amount:
                break
        else:
            buys = pool[:need_qty]
            if len(buys) < need_qty:
                break
        for i in gets:
            price = units[i]["price"]
            total += min(amount_off, price) if value_type == "amount" else price * pct / 100.0
        used.update(gets)
        used.update(buys)
        uses += 1
    return max(0.0, total)


async def compute_discount(coupon: Coupon, *, items: list[dict] | None = None, subtotal: float = 0) -> float:
    lines = await _with_collections(_norm_items(items))
    cart_total = sum(i["price"] * i["quantity"] for i in lines) if lines else float(subtotal or 0)
    kind = (coupon.kind or "order").lower()

    if kind == "products":
        if not lines:
            return 0.0
        is_target = _product_target(coupon)
        return _product_discount(coupon, [line for line in lines if is_target(line)])
    if kind == "bxgy":
        return _bxgy_discount(coupon, lines) if lines else 0.0
    return _apply_value(coupon, cart_total)


# ─────────────────────────────────────────────────────────────── availability


def is_live(coupon: Coupon, now: datetime | None = None) -> bool:
    """Active, started, not ended, not used up."""
    now = now or datetime.utcnow()
    if (coupon.status or "active") != "active":
        return False
    if coupon.startsAt and now < coupon.startsAt:
        return False
    if coupon.expiryDate and now > coupon.expiryDate:
        return False
    if coupon.usageLimit is not None and (coupon.usedCount or 0) >= coupon.usageLimit:
        return False
    return True


async def _shopper_is_eligible(coupon: Coupon, shopper: Shopper) -> bool:
    ids = [ObjectId(c) for c in coupon.customerIds or [] if ObjectId.is_valid(c)]
    if not ids or not shopper.known:
        return False
    if shopper.user_id and shopper.user_id in {str(i) for i in ids}:
        return True
    for user in await User.find({"_id": {"$in": ids}}).to_list():
        if shopper.phone and _ten_digits(user.phone) == shopper.phone:
            return True
        if shopper.email and str(user.email or "").strip().lower() == shopper.email:
            return True
    return False


async def _already_used_by(coupon: Coupon, shopper: Shopper, exclude_order_id: Any = None) -> bool:
    who: list[dict] = []
    if shopper.user_id and ObjectId.is_valid(shopper.user_id):
        who += [{"customerId": ObjectId(shopper.user_id)}, {"customerId": shopper.user_id}]
    if shopper.phone:
        who.append({"shippingAddress.phone": {"$regex": f"{shopper.phone}$"}})
    if shopper.email:
        who.append({"shippingAddress.email": {"$regex": f"^{re.escape(shopper.email)}$", "$options": "i"}})
    if not who:
        return False
    query: dict[str, Any] = {
        "couponCode": coupon.code,
        "paymentStatus": {"$in": list(PAID_STATUSES)},
        "$or": who,
    }
    if exclude_order_id is not None:
        query["_id"] = {"$ne": exclude_order_id}
    return await Order.find(query).count() > 0


async def validate_coupon(
    code: str,
    *,
    items: list[dict] | None = None,
    subtotal: float = 0,
    shopper: Shopper | None = None,
    exclude_order_id: Any = None,
) -> tuple[Coupon, float]:
    from fastapi import HTTPException

    shopper = shopper or Shopper()
    coupon = await Coupon.find_one(Coupon.code == str(code).upper().strip(), Coupon.status == "active")
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid discount code")
    now = datetime.utcnow()
    if coupon.startsAt and now < coupon.startsAt:
        raise HTTPException(status_code=400, detail="This discount isn't active yet")
    if coupon.expiryDate and now > coupon.expiryDate:
        raise HTTPException(status_code=400, detail="Discount expired")
    if coupon.usageLimit is not None and (coupon.usedCount or 0) >= coupon.usageLimit:
        raise HTTPException(status_code=400, detail="Discount usage limit reached")

    if (coupon.eligibility or "all") == "customers":
        if not shopper.known:
            raise HTTPException(status_code=400, detail="Sign in or add your phone number to use this discount")
        if not await _shopper_is_eligible(coupon, shopper):
            raise HTTPException(status_code=400, detail="This discount isn't available for your account")
    if coupon.oncePerCustomer:
        if not shopper.known:
            raise HTTPException(status_code=400, detail="Sign in or add your phone number to use this discount")
        if await _already_used_by(coupon, shopper, exclude_order_id):
            raise HTTPException(status_code=400, detail="You've already used this discount")

    lines = await _with_collections(_norm_items(items))
    kind = (coupon.kind or "order").lower()
    if kind in ("products", "bxgy") and not lines:
        raise HTTPException(status_code=400, detail="Add products to apply this discount")

    if kind != "bxgy":
        # Product discounts count only the items they apply to (as Shopify does).
        scope = [line for line in lines if _product_target(coupon)(line)] if kind == "products" else lines
        scope_total = (
            sum(i["price"] * i["quantity"] for i in scope) if lines else float(subtotal or 0)
        )
        scope_qty = sum(i["quantity"] for i in scope)
        req = min_requirement(coupon)
        if req == "amount" and scope_total < float(coupon.minOrderAmount or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order amount of ₹{int(coupon.minOrderAmount or 0)} required",
            )
        if req == "quantity" and scope_qty < int(coupon.minQuantity or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Minimum of {int(coupon.minQuantity or 0)} items required",
            )

    cart_total = sum(i["price"] * i["quantity"] for i in lines) if lines else float(subtotal or 0)
    discount = await compute_discount(coupon, items=lines, subtotal=cart_total)
    if discount <= 0:
        if kind == "bxgy":
            raise HTTPException(status_code=400, detail="Add the qualifying items to your cart to use this discount")
        raise HTTPException(status_code=400, detail="No eligible products for this discount")
    return coupon, round(discount, 2)


# ─────────────────────────────────────────────────────────────── usage slots


async def reserve_coupon_usage(code: str) -> bool:
    """Atomically consume one usage slot at checkout create. Returns False if limit hit."""
    coupon_col = Coupon.get_pymongo_collection()
    normalized = str(code or "").upper().strip()
    if not normalized:
        return False
    claimed = await coupon_col.find_one_and_update(
        {
            "code": normalized,
            "status": "active",
            "$expr": {
                "$or": [
                    {"$lte": [{"$ifNull": ["$usageLimit", 0]}, 0]},  # null/0 = unlimited
                    {
                        "$lt": [
                            {"$ifNull": ["$usedCount", 0]},
                            "$usageLimit",
                        ]
                    },
                ]
            },
        },
        {"$inc": {"usedCount": 1}},
    )
    return claimed is not None


async def release_coupon_usage(code: str) -> None:
    """Return a reserved usage slot when checkout is abandoned / unpaid."""
    normalized = str(code or "").upper().strip()
    if not normalized:
        return
    coupon_col = Coupon.get_pymongo_collection()
    await coupon_col.update_one(
        {"code": normalized, "usedCount": {"$gt": 0}},
        {"$inc": {"usedCount": -1}},
    )


# ─────────────────────────────────────────────────────────────── product page


async def shown_coupons() -> list[Coupon]:
    """Codes the admin featured on product pages that anyone can use right now."""
    now = datetime.utcnow()
    out = []
    for coupon in await Coupon.find(Coupon.status == "active", Coupon.showOnProduct == True).to_list():  # noqa: E712
        if not is_live(coupon, now):
            continue
        # A code for specific customers is never advertised to everyone.
        if (coupon.eligibility or "all") != "all":
            continue
        out.append(coupon)
    return out


def _applies_to_product_line(coupon: Coupon, line: dict) -> bool:
    kind = (coupon.kind or "order").lower()
    if kind == "order":
        return True
    if kind == "products":
        return _product_target(coupon)(line)
    if kind == "bxgy":
        return _buy_target(coupon)(line)
    return True


async def product_offers(product_id: str) -> list[Coupon]:
    """Featured coupons that apply to this product."""
    coupons = await shown_coupons()
    if not coupons:
        return []
    product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(str(product_id)) else None
    line = {
        "productId": str(product_id),
        "collections": {str(c) for c in (product.collections or [])} if product else set(),
    }
    return [c for c in coupons if _applies_to_product_line(c, line)]


async def eligible_product_ids(coupon: Coupon) -> set[str] | None:
    """Legacy helper: None means all products; product-id targets only (no collections)."""
    kind = (coupon.kind or "order").lower()
    if kind == "order":
        return None
    if kind == "products":
        return {str(x) for x in (coupon.productIds or []) if x}
    if kind == "bxgy":
        return {str(x) for x in (coupon.buyProductIds or coupon.productIds or []) if x}
    return None


# ─────────────────────────────────────────────────────────────── labels


def kind_label(kind: str | None) -> str:
    return {
        "order": "Amount off order",
        "products": "Amount off products",
        "bxgy": "Buy X get Y",
    }.get((kind or "order").lower(), "Discount")


def _money(value: float) -> str:
    return f"₹{float(value or 0):,.0f}" if float(value or 0) == int(float(value or 0)) else f"₹{float(value):,.2f}"


def summary_text(coupon: Coupon) -> str:
    kind = (coupon.kind or "order").lower()
    if kind == "bxgy":
        value_type = (coupon.getValueType or "percentage").lower()
        if value_type == "free" or (value_type == "percentage" and float(coupon.getDiscountPercent or 0) >= 100):
            off = "FREE"
        elif value_type == "amount":
            off = f"{_money(coupon.getAmountOff)} off each"
        else:
            off = f"{float(coupon.getDiscountPercent or 0):g}% off"
        if (coupon.buyRequirement or "quantity") == "amount":
            return f"Spend {_money(coupon.buyAmount)}, get {coupon.getQuantity or 1} {off}"
        return f"Buy {coupon.buyQuantity or 1} get {coupon.getQuantity or 1} {off}"
    if (coupon.discountType or "percentage") == "percentage":
        base = f"{float(coupon.discountValue or 0):g}% off"
    else:
        base = f"{_money(coupon.discountValue)} off"
        if kind == "products" and not coupon.oncePerOrder:
            base += " each"
    if kind == "products":
        target = "collections" if (coupon.appliesTo or "products") == "collections" else "products"
        return f"{base} on selected {target}"
    return f"{base} on order"
