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
    """Offers shown on a product page. Only coupons marked showOnProduct are listed."""
    return [
        {
            "code": c.code,
            "badge": (c.badge or "").strip() or None,
            "kind": c.kind or "order",
            "discountType": c.discountType,
            "discountValue": c.discountValue,
            "buyQuantity": c.buyQuantity,
            "getQuantity": c.getQuantity,
            "getDiscountPercent": c.getDiscountPercent,
            "summary": discount_svc.summary_text(c),
        }
        for c in await discount_svc.product_offers(product_id)
    ]


@router.post("/validate")
async def validate(
    body: ValidateBody,
    user: OptionalUser,
    _: None = Depends(rate_limit_dependency("coupon-validate", limit=40)),
):
    lines = await _server_priced_items(body.items)
    if not lines:
        raise HTTPException(status_code=400, detail="Add products to validate this discount")
    subtotal = sum(i["price"] * i["quantity"] for i in lines)
    coupon, discount = await discount_svc.validate_coupon(
        body.code,
        items=lines,
        subtotal=subtotal,
        shopper=discount_svc.Shopper.of(user, phone=body.phone, email=body.email),
    )
    return {
        "valid": True,
        "discount": discount,
        "discountAmount": discount,
        "code": coupon.code,
        "kind": coupon.kind or "order",
        "coupon": _public_coupon(coupon),
        "summary": discount_svc.summary_text(coupon),
    }
