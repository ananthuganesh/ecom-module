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


def _spread(total: float, weights: list[float]) -> list[float]:
    """Split `total` across lines by weight (unrounded; callers round at the edge)."""
    whole = sum(w for w in weights if w > 0)
    if total <= 0 or whole <= 0:
        return [0.0] * len(weights)
    return [total * w / whole if w > 0 else 0.0 for w in weights]


def _line_value(line: dict) -> float:
    return line["price"] * line["quantity"]


def _product_alloc(coupon: Coupon, lines: list[dict]) -> list[float]:
    """Amount off products, per cart line."""
    is_target = _product_target(coupon)
    eligible = [_line_value(line) if is_target(line) else 0.0 for line in lines]
    if (coupon.discountType or "percentage") == "fixed" and not coupon.oncePerOrder:
        # Shopify: a fixed amount comes off each eligible item.
        off = float(coupon.discountValue or 0)
        return [
            min(off, line["price"]) * line["quantity"] if is_target(line) else 0.0 for line in lines
        ]
    return _spread(_apply_value(coupon, sum(eligible)), eligible)


def _bxgy_alloc(coupon: Coupon, lines: list[dict]) -> list[float]:
    """Buy X get Y the Shopify way: bought and discounted items are separate units.

    Each application takes the cheapest qualifying "get" units, then needs the
    "buy" condition met by other units (quantity, or amount spent on them).
    Repeats until the cart runs out or the per-order cap is reached.
    """
    is_buy, is_get = _buy_target(coupon), _get_target(coupon)
    units = []
    for idx, line in enumerate(lines):
        for _ in range(line["quantity"]):
            units.append({"line": idx, "price": line["price"], "buy": is_buy(line), "get": is_get(line)})
    out = [0.0] * len(lines)
    by_amount = (coupon.buyRequirement or "quantity") == "amount"
    need_qty = max(1, int(coupon.buyQuantity or 1))
    need_amount = float(coupon.buyAmount or 0)
    if by_amount and need_amount <= 0:
        return out
    get_qty = max(1, int(coupon.getQuantity or 1))
    cap = coupon.maxUsesPerOrder if coupon.maxUsesPerOrder else None

    value_type = (coupon.getValueType or "percentage").lower()
    pct = 100.0 if value_type == "free" else max(0.0, min(100.0, float(coupon.getDiscountPercent or 0)))
    amount_off = float(coupon.getAmountOff or 0)

    cheapest = sorted(range(len(units)), key=lambda i: units[i]["price"])
    dearest = sorted(range(len(units)), key=lambda i: -units[i]["price"])
    uses = 0
    used: set[int] = set()
    while cap is None or uses < cap:
        gets = [i for i in cheapest if i not in used and units[i]["get"]][:get_qty]
        if len(gets) < get_qty:
            break
        pool = [i for i in dearest if i not in used and i not in gets and units[i]["buy"]]
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
            out[units[i]["line"]] += min(amount_off, price) if value_type == "amount" else price * pct / 100.0
        used.update(gets)
        used.update(buys)
        uses += 1
    return out


def _order_alloc(coupon: Coupon, bases: list[float]) -> list[float]:
    """Amount off order, spread over what is left of each line."""
    return _spread(_apply_value(coupon, sum(bases)), bases)


def discount_class(coupon: Coupon) -> str:
    """Shopify's three classes: product | order | shipping."""
    kind = (coupon.kind or "order").lower()
    if kind == "shipping":
        return "shipping"
    if kind in ("products", "bxgy"):
        return "product"
    return "order"


def _allows(coupon: Coupon, cls: str) -> bool:
    return {
        "product": bool(coupon.combinesWithProduct),
        "order": bool(coupon.combinesWithOrder),
        "shipping": bool(coupon.combinesWithShipping),
    }[cls]


def combines(a: Coupon, b: Coupon) -> bool:
    """Two discounts stack only when each allows the other's class."""
    return _allows(a, discount_class(b)) and _allows(b, discount_class(a))


def _shipping_value(coupon: Coupon, fee: float | None) -> float:
    if fee is None or fee <= 0:
        return 0.0
    if coupon.maxShippingRate is not None and fee > float(coupon.maxShippingRate):
        return 0.0
    return float(fee)


async def compute_discount(coupon: Coupon, *, items: list[dict] | None = None, subtotal: float = 0) -> float:
    """Goods discount of one coupon on its own (shipping discounts are 0 here)."""
    lines = await _with_collections(_norm_items(items))
    kind = (coupon.kind or "order").lower()
    if kind == "shipping":
        return 0.0
    if kind == "products":
        return sum(_product_alloc(coupon, lines)) if lines else 0.0
    if kind == "bxgy":
        return sum(_bxgy_alloc(coupon, lines)) if lines else 0.0
    if not lines:
        return _apply_value(coupon, float(subtotal or 0))
    return sum(_order_alloc(coupon, [_line_value(line) for line in lines]))


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
        "$and": [
            {"$or": [{"couponCode": coupon.code}, {"transactionDetails.discounts.code": coupon.code}]},
            {"$or": who},
        ],
        "paymentStatus": {"$in": list(PAID_STATUSES)},
    }
    if exclude_order_id is not None:
        query["_id"] = {"$ne": exclude_order_id}
    return await Order.find(query).count() > 0


class DiscountRejected(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


async def _check_rules(
    coupon: Coupon, lines: list[dict], subtotal: float, shopper: Shopper, exclude_order_id: Any = None
) -> None:
    """Raise DiscountRejected when this cart/shopper can't use the coupon (value aside)."""
    now = datetime.utcnow()
    if coupon.startsAt and now < coupon.startsAt:
        raise DiscountRejected(400, "This discount isn't active yet")
    if coupon.expiryDate and now > coupon.expiryDate:
        raise DiscountRejected(400, "Discount expired")
    if coupon.usageLimit is not None and (coupon.usedCount or 0) >= coupon.usageLimit:
        raise DiscountRejected(400, "Discount usage limit reached")

    if (coupon.eligibility or "all") == "customers":
        if not shopper.known:
            raise DiscountRejected(400, "Sign in or add your phone number to use this discount")
        if not await _shopper_is_eligible(coupon, shopper):
            raise DiscountRejected(400, "This discount isn't available for your account")
    if coupon.oncePerCustomer:
        if not shopper.known:
            raise DiscountRejected(400, "Sign in or add your phone number to use this discount")
        if await _already_used_by(coupon, shopper, exclude_order_id):
            raise DiscountRejected(400, "You've already used this discount")

    kind = (coupon.kind or "order").lower()
    if kind in ("products", "bxgy") and not lines:
        raise DiscountRejected(400, "Add products to apply this discount")

    if kind != "bxgy":
        # Product discounts count only the items they apply to (as Shopify does).
        scope = [line for line in lines if _product_target(coupon)(line)] if kind == "products" else lines
        scope_total = sum(_line_value(i) for i in scope) if lines else float(subtotal or 0)
        scope_qty = sum(i["quantity"] for i in scope)
        req = min_requirement(coupon)
        if req == "amount" and scope_total < float(coupon.minOrderAmount or 0):
            raise DiscountRejected(400, f"Minimum order amount of ₹{int(coupon.minOrderAmount or 0)} required")
        if req == "quantity" and scope_qty < int(coupon.minQuantity or 0):
            raise DiscountRejected(400, f"Minimum of {int(coupon.minQuantity or 0)} items required")


async def _code_coupon(code: str) -> Coupon:
    coupon = await Coupon.find_one(
        Coupon.code == str(code).upper().strip(), Coupon.status == "active"
    )
    # Automatic discounts apply by themselves; their internal id is not a code.
    if not coupon or (coupon.method or "code") == "automatic":
        raise DiscountRejected(404, "Invalid discount code")
    return coupon


async def validate_coupon(
    code: str,
    *,
    items: list[dict] | None = None,
    subtotal: float = 0,
    shopper: Shopper | None = None,
    exclude_order_id: Any = None,
) -> tuple[Coupon, float]:
    """One code on its own: rules plus its goods value (free shipping is 0 here)."""
    from fastapi import HTTPException

    shopper = shopper or Shopper()
    lines = await _with_collections(_norm_items(items))
    try:
        coupon = await _code_coupon(code)
        await _check_rules(coupon, lines, subtotal, shopper, exclude_order_id)
    except DiscountRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from None

    kind = (coupon.kind or "order").lower()
    if kind == "shipping":
        return coupon, 0.0
    cart_total = sum(_line_value(i) for i in lines) if lines else float(subtotal or 0)
    discount = await compute_discount(coupon, items=lines, subtotal=cart_total)
    if discount <= 0:
        if kind == "bxgy":
            raise HTTPException(status_code=400, detail="Add the qualifying items to your cart to use this discount")
        raise HTTPException(status_code=400, detail="No eligible products for this discount")
    return coupon, round(discount, 2)


async def check_rules(
    coupon: Coupon, items: list[dict] | None, shopper: Shopper | None = None, *, exclude_order_id: Any = None
) -> None:
    """Public rule check on raw cart items; raises DiscountRejected."""
    lines = await _with_collections(_norm_items(items))
    await _check_rules(coupon, lines, sum(_line_value(i) for i in lines), shopper or Shopper(), exclude_order_id)


async def passes_rules(
    coupon: Coupon, items: list[dict] | None, shopper: Shopper | None = None, *, exclude_order_id: Any = None
) -> bool:
    try:
        await check_rules(coupon, items, shopper, exclude_order_id=exclude_order_id)
    except DiscountRejected:
        return False
    return True


async def find_code_coupon(code: str) -> Coupon:
    """The active code-method coupon for `code`; raises DiscountRejected(404)."""
    return await _code_coupon(code)


def shipping_value(coupon: Coupon, fee: float | None) -> float:
    return _shipping_value(coupon, fee)


# ─────────────────────────────────────────────────────────────── resolver


@dataclass
class AppliedDiscount:
    coupon: Coupon
    lines: list[float]
    shipping: float = 0.0

    @property
    def amount(self) -> float:
        return round(sum(self.lines), 2)

    def as_dict(self) -> dict[str, Any]:
        c = self.coupon
        automatic = (c.method or "code") == "automatic"
        return {
            "id": str(c.id),
            "code": None if automatic else c.code,
            "title": (c.name or "").strip() or (None if not automatic else "Discount"),
            "kind": c.kind or "order",
            "method": "automatic" if automatic else "code",
            "amount": self.amount,
            "shipping": round(self.shipping, 2),
        }


@dataclass
class Resolution:
    applied: list[AppliedDiscount]
    line_discounts: list[float]
    shipping: float
    code_error: str | None = None
    code_status: int = 400

    @property
    def goods(self) -> float:
        return round(sum(self.line_discounts), 2)

    @property
    def total(self) -> float:
        return round(self.goods + self.shipping, 2)

    @property
    def code_applied(self) -> AppliedDiscount | None:
        return next((a for a in self.applied if (a.coupon.method or "code") != "automatic"), None)

    def as_dict(self) -> dict[str, Any]:
        return {
            "discounts": [a.as_dict() for a in self.applied],
            "goodsDiscount": self.goods,
            "shippingDiscount": round(self.shipping, 2),
            "totalDiscount": self.total,
            "lineDiscounts": [round(x, 2) for x in self.line_discounts],
            "codeError": self.code_error,
        }


async def live_automatic_discounts() -> list[Coupon]:
    now = datetime.utcnow()
    return [
        c
        for c in await Coupon.find(Coupon.method == "automatic", Coupon.status == "active").to_list()
        if is_live(c, now)
    ]


def _evaluate(subset: list[Coupon], lines: list[dict], shipping_fee: float | None) -> tuple[float, list[AppliedDiscount]]:
    """Savings of a set of mutually combinable discounts on this cart.

    Shopify order: product discounts on line prices, then order discounts on
    what is left, then shipping on the delivery fee.
    """
    remaining = [_line_value(line) for line in lines]
    applied: list[AppliedDiscount] = []
    for coupon in sorted(subset, key=lambda c: {"product": 0, "order": 1, "shipping": 2}[discount_class(c)]):
        cls = discount_class(coupon)
        if cls == "shipping":
            already = sum(a.shipping for a in applied)
            value = min(_shipping_value(coupon, shipping_fee), max(0.0, float(shipping_fee or 0) - already))
            applied.append(AppliedDiscount(coupon, [0.0] * len(lines), value))
            continue
        if cls == "product":
            raw = _bxgy_alloc(coupon, lines) if (coupon.kind or "").lower() == "bxgy" else _product_alloc(coupon, lines)
        else:
            raw = _order_alloc(coupon, remaining)
        taken = [min(r, rem) for r, rem in zip(raw, remaining)]
        remaining = [rem - t for rem, t in zip(remaining, taken)]
        applied.append(AppliedDiscount(coupon, taken))
    savings = sum(sum(a.lines) + a.shipping for a in applied)
    return savings, applied


async def resolve(
    items: list[dict] | None,
    *,
    shopper: Shopper | None = None,
    code: str | None = None,
    shipping_fee: float | None = None,
    include_automatic: bool = True,
    only: list[Coupon] | None = None,
    exclude_order_id: Any = None,
) -> Resolution:
    """The best set of discounts for this cart: live automatic ones plus one code.

    Every pair in the set must combine. The set with the largest saving wins;
    a code that loses to the automatic discounts is reported in code_error.
    `shipping_fee=None` means the fee isn't known yet (shipping discounts wait).
    `only` limits automatic candidates (Magic Checkout: what is already priced in).
    """
    shopper = shopper or Shopper()
    lines = await _with_collections(_norm_items(items))
    subtotal = sum(_line_value(line) for line in lines)

    def worth(c: Coupon) -> bool:
        return discount_class(c) != "shipping" or shipping_fee is not None

    candidates: list[Coupon] = []
    pool = only if only is not None else (await live_automatic_discounts() if include_automatic else [])
    for coupon in pool:
        if not worth(coupon):
            continue
        try:
            await _check_rules(coupon, lines, subtotal, shopper, exclude_order_id)
        except DiscountRejected:
            continue
        candidates.append(coupon)

    code_coupon: Coupon | None = None
    code_error: str | None = None
    code_status = 400
    if code:
        try:
            code_coupon = await _code_coupon(code)
            await _check_rules(code_coupon, lines, subtotal, shopper, exclude_order_id)
            if discount_class(code_coupon) == "shipping" and shipping_fee is None:
                raise DiscountRejected(400, "Choose your delivery address first, then apply this code")
        except DiscountRejected as exc:
            code_coupon, code_error, code_status = None, exc.detail, exc.status_code

    # Keep the search small: the strongest automatic candidates on their own.
    if len(candidates) > 8:
        scored = [(_evaluate([c], lines, shipping_fee)[0], c) for c in candidates]
        candidates = [c for _, c in sorted(scored, key=lambda x: -x[0])[:8]]
    pool = candidates + ([code_coupon] if code_coupon else [])

    best: tuple[float, int, int, list[AppliedDiscount]] = (0.0, 0, 0, [])
    for mask in range(1, 1 << len(pool)):
        subset = [pool[i] for i in range(len(pool)) if mask >> i & 1]
        if any(not combines(a, b) for i, a in enumerate(subset) for b in subset[i + 1:]):
            continue
        savings, applied = _evaluate(subset, lines, shipping_fee)
        applied = [a for a in applied if a.amount > 0 or a.shipping > 0]
        if not applied:
            continue
        has_code = int(code_coupon is not None and any(a.coupon is code_coupon for a in applied))
        key = (round(savings, 2), has_code, -len(applied))
        if key > (round(best[0], 2), best[1], best[2]):
            best = (savings, has_code, -len(applied), applied)

    applied = best[3]
    line_discounts = [0.0] * len(lines)
    shipping = 0.0
    for a in applied:
        line_discounts = [x + y for x, y in zip(line_discounts, a.lines)]
        shipping += a.shipping
    if code_coupon is not None and not any(a.coupon is code_coupon for a in applied):
        alone, _ = _evaluate([code_coupon], lines, shipping_fee)
        if alone <= 0:
            kind = (code_coupon.kind or "order").lower()
            code_error = (
                "Add the qualifying items to your cart to use this discount"
                if kind == "bxgy"
                else "Free shipping doesn't apply to this delivery"
                if kind == "shipping"
                else "No eligible products for this discount"
            )
        else:
            code_error = "Your cart already has a better discount"
    return Resolution(applied, line_discounts, shipping, code_error, code_status)


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


async def shown_coupons(*, include_automatic: bool = False) -> list[Coupon]:
    """Discounts the admin featured on product pages that anyone can use right now.

    Codes by default (Magic Checkout lists these to type); the product page also
    shows featured automatic discounts, which need no code.
    """
    now = datetime.utcnow()
    out = []
    for coupon in await Coupon.find(Coupon.status == "active", Coupon.showOnProduct == True).to_list():  # noqa: E712
        if not is_live(coupon, now):
            continue
        # A discount for specific customers is never advertised to everyone.
        if (coupon.eligibility or "all") != "all":
            continue
        if (coupon.method or "code") == "automatic" and not include_automatic:
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
    coupons = await shown_coupons(include_automatic=True)
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
        "shipping": "Free shipping",
    }.get((kind or "order").lower(), "Discount")


def _money(value: float) -> str:
    return f"₹{float(value or 0):,.0f}" if float(value or 0) == int(float(value or 0)) else f"₹{float(value):,.2f}"


def summary_text(coupon: Coupon) -> str:
    kind = (coupon.kind or "order").lower()
    if kind == "shipping":
        if coupon.maxShippingRate is not None:
            return f"Free shipping on delivery up to {_money(coupon.maxShippingRate)}"
        return "Free shipping"
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
