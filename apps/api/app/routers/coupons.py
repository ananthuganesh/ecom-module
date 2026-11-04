from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId

from app.deps import OptionalUser
from app.documents import Product
from app.services import discounts as discount_svc
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/coupons", tags=["coupons"])


class ValidateBody(BaseModel):
    code: str
    subtotal: float = 0
    items: list[dict] = Field(default_factory=list)
    # Optional, for specific-customer / once-per-customer codes before sign-in.
    phone: str | None = None
    email: str | None = None
    # Optional delivery pincode, for free-shipping codes.
    pincode: str | None = None


def _public_coupon(coupon) -> dict:
    """Marketing-safe coupon payload — no usage limits / product ID lists."""
    return {
        "code": coupon.code,
        "kind": coupon.kind or "order",
        "summary": discount_svc.summary_text(coupon),
        "discountType": coupon.discountType,
        "discountValue": coupon.discountValue,
        "minOrderAmount": coupon.minOrderAmount,
        "expiryDate": coupon.expiryDate,
        "status": coupon.status,
    }


def _anon_promo(coupon) -> dict:
    """Public teaser without redeemable code (anti-scraping)."""
    return {
        "kind": coupon.kind or "order",
        "summary": discount_svc.summary_text(coupon),
        "discountType": coupon.discountType,
        "discountValue": coupon.discountValue,
        "minOrderAmount": coupon.minOrderAmount,
        "expiryDate": coupon.expiryDate,
        "status": coupon.status,
    }


async def _server_priced_items(raw_items: list[dict]) -> list[dict]:
    """Recompute line prices from catalog so clients cannot inflate discounts."""
    out = []
    for raw in raw_items or []:
        pid = str(raw.get("productId") or raw.get("product") or raw.get("_id") or "")
        if not pid or not ObjectId.is_valid(pid):
            continue
        product = await Product.get(ObjectId(pid))
        if not product:
            continue
        qty = int(raw.get("quantity") or raw.get("qty") or 1)
        if qty <= 0:
            continue
        price = 0.0
        if product.pricing:
            price = float(product.pricing.sellingPrice or 0)
        if price <= 0:
            continue
        out.append({"productId": pid, "quantity": qty, "price": price})
    return out


@router.get("")
async def list_public(user: OptionalUser):
    """Authenticated shoppers may see codes; anonymous callers get teasers only."""
    from app.documents import Coupon

    coupons = await Coupon.find(Coupon.status == "active").to_list()
    if user is None:
        return [_anon_promo(c) for c in coupons]
    return [_public_coupon(c) for c in coupons]


@router.get("/product/{product_id}")
async def product_offers(
    product_id: str,
    _: None = Depends(rate_limit_dependency("coupon-offers", limit=120)),
):
    """Offers shown on a product page: featured codes and featured automatic discounts.

    Automatic discounts have no code to copy (their internal id is never sent);
    `automatic` tells the page to say they apply at checkout.
    """
    out = []
    for c in await discount_svc.product_offers(product_id):
        automatic = (c.method or "code") == "automatic"
        out.append(
            {
                "id": str(c.id),
                "code": None if automatic else c.code,
                "automatic": automatic,
                "title": ((c.name or "").strip() or "Discount") if automatic else None,
                "badge": (c.badge or "").strip() or None,
                "kind": c.kind or "order",
                "discountType": c.discountType,
                "discountValue": c.discountValue,
                "appliesTo": c.appliesTo,
                "oncePerOrder": c.oncePerOrder,
                "buyRequirement": c.buyRequirement,
                "buyQuantity": c.buyQuantity,
                "buyAmount": c.buyAmount,
                "getQuantity": c.getQuantity,
                "getValueType": c.getValueType,
                "getDiscountPercent": c.getDiscountPercent,
                "getAmountOff": c.getAmountOff,
                "maxShippingRate": c.maxShippingRate,
                "summary": discount_svc.summary_text(c),
            }
        )
    return out


class PreviewBody(BaseModel):
    items: list[dict] = Field(default_factory=list)
    code: str | None = None
    pincode: str | None = None
    phone: str | None = None
    email: str | None = None


async def _shipping_fee_for(pincode: str | None) -> float | None:
    from app.services.shipping_settings import get_shipping_settings, rate_for_zip

    pin = "".join(ch for ch in str(pincode or "") if ch.isdigit())
    if len(pin) != 6:
        return None
    serviceable, fee = rate_for_zip(await get_shipping_settings(), pin, "IN")
    return float(fee or 0) if serviceable else None


def _resolution_payload(res, subtotal: float, fee: float | None) -> dict:
    payload = res.as_dict()
    payload["subtotal"] = round(subtotal, 2)
    payload["shippingFee"] = fee
    payload["total"] = round(max(0.0, subtotal - res.goods + max(0.0, (fee or 0) - res.shipping)), 2)
    return payload


@router.post("/preview")
async def preview(
    body: PreviewBody,
    user: OptionalUser,
    _: None = Depends(rate_limit_dependency("coupon-preview", limit=120)),
):
    """Discounts this cart gets right now: automatic ones, plus `code` if given.

    For showing the cart/checkout summary; order placement recomputes all of it.
    """
    lines = await _server_priced_items(body.items)
    subtotal = sum(i["price"] * i["quantity"] for i in lines)
    fee = await _shipping_fee_for(body.pincode)
    res = await discount_svc.resolve(
        lines,
        shopper=discount_svc.Shopper.of(user, phone=body.phone, email=body.email),
        code=(body.code or "").strip() or None,
        shipping_fee=fee,
    )
    return _resolution_payload(res, subtotal, fee)


@router.post("/validate")
async def validate(
    body: ValidateBody,
    user: OptionalUser,
    _: None = Depends(rate_limit_dependency("coupon-validate", limit=40)),
):
    """Apply a code on top of this cart's automatic discounts (standard checkout box)."""
    lines = await _server_priced_items(body.items)
    if not lines:
        raise HTTPException(status_code=400, detail="Add products to validate this discount")
    subtotal = sum(i["price"] * i["quantity"] for i in lines)
    fee = await _shipping_fee_for(body.pincode)
    res = await discount_svc.resolve(
        lines,
        shopper=discount_svc.Shopper.of(user, phone=body.phone, email=body.email),
        code=body.code,
        shipping_fee=fee if fee is not None else 0.0,
    )
    if res.code_error:
        raise HTTPException(status_code=res.code_status, detail=res.code_error)
    code_part = res.code_applied
    coupon = code_part.coupon
    return {
        "valid": True,
        # Total off the items (automatic + code), as the checkout subtracts it.
        "discount": res.goods,
        "discountAmount": res.goods,
        "codeDiscount": round(code_part.amount + code_part.shipping, 2),
        "shippingDiscount": round(res.shipping, 2),
        "discounts": [a.as_dict() for a in res.applied],
        "code": coupon.code,
        "kind": coupon.kind or "order",
        "coupon": _public_coupon(coupon),
        "summary": discount_svc.summary_text(coupon),
    }
