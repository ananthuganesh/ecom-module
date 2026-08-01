from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId

from app.documents import Product
from app.services import discounts as discount_svc

router = APIRouter(prefix="/api/coupons", tags=["coupons"])


class ValidateBody(BaseModel):
    code: str
    subtotal: float = 0
    items: list[dict] = Field(default_factory=list)


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
async def list_public():
    from app.documents import Coupon

    coupons = await Coupon.find(Coupon.status == "active").to_list()
    return [_public_coupon(c) for c in coupons]


@router.post("/validate")
async def validate(body: ValidateBody):
    lines = await _server_priced_items(body.items)
    subtotal = sum(i["price"] * i["quantity"] for i in lines) if lines else float(body.subtotal or 0)
    coupon, discount = await discount_svc.validate_coupon(
        body.code,
        items=lines or None,
        subtotal=subtotal,
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
