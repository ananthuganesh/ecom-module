"""Discount / coupon calculation for order, product, and Buy X Get Y kinds."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId

from app.documents import CollectionDoc, Coupon


def _norm_items(items: list[dict] | None) -> list[dict]:
    out = []
    for raw in items or []:
        pid = str(raw.get("productId") or raw.get("product") or raw.get("_id") or "")
        if not pid:
            continue
        qty = int(raw.get("quantity") or raw.get("qty") or 1)
        price = float(raw.get("price") or 0)
        if qty <= 0:
            continue
        out.append({"productId": pid, "quantity": qty, "price": price})
    return out


async def _product_ids_in_collections(collection_ids: list[str]) -> set[str]:
    ids: set[str] = set()
    for cid in collection_ids or []:
        if not cid or not ObjectId.is_valid(str(cid)):
            continue
        col = await CollectionDoc.get(ObjectId(str(cid)))
        if not col:
            continue
        for p in col.products or []:
            if isinstance(p, dict):
                pid = p.get("_id") or p.get("id") or p.get("productId")
            else:
                pid = p
            if pid:
                ids.add(str(pid))
    return ids


async def eligible_product_ids(coupon: Coupon) -> set[str] | None:
    """None means all products (order-level). Empty set means nothing eligible."""
    kind = (coupon.kind or "order").lower()
    if kind == "order":
        return None
    if kind == "products":
        ids = {str(x) for x in (coupon.productIds or []) if x}
        ids |= await _product_ids_in_collections(coupon.collectionIds or [])
        return ids
    if kind == "bxgy":
        buy = {str(x) for x in (coupon.buyProductIds or coupon.productIds or []) if x}
        buy |= await _product_ids_in_collections(coupon.collectionIds or [])
        return buy
    return None


def _apply_value(coupon: Coupon, base: float) -> float:
    if base <= 0:
        return 0.0
    if (coupon.discountType or "percentage") == "percentage":
        discount = (base * float(coupon.discountValue or 0)) / 100.0
        if coupon.maxDiscount is not None:
            discount = min(discount, float(coupon.maxDiscount))
        return max(0.0, discount)
    return max(0.0, min(float(coupon.discountValue or 0), base))


async def compute_discount(coupon: Coupon, *, items: list[dict] | None = None, subtotal: float = 0) -> float:
    lines = _norm_items(items)
    cart_total = sum(i["price"] * i["quantity"] for i in lines) if lines else float(subtotal or 0)
    kind = (coupon.kind or "order").lower()

    if kind == "order":
        return _apply_value(coupon, cart_total)

    if kind == "products":
        eligible = await eligible_product_ids(coupon)
        if not eligible:
            return 0.0
        base = sum(
            i["price"] * i["quantity"] for i in lines if i["productId"] in eligible
        )
        if not lines and cart_total:
            # No line items provided — cannot safely apply product discount
            return 0.0
        return _apply_value(coupon, base)

    if kind == "bxgy":
        buy_ids = {str(x) for x in (coupon.buyProductIds or coupon.productIds or []) if x}
        buy_ids |= await _product_ids_in_collections(coupon.collectionIds or [])
        get_ids = {str(x) for x in (coupon.getProductIds or []) if x} or set(buy_ids)
        if not buy_ids or not lines:
            return 0.0

        buy_qty = sum(i["quantity"] for i in lines if i["productId"] in buy_ids)
        need = max(1, int(coupon.buyQuantity or 1))
        get_each = max(1, int(coupon.getQuantity or 1))
        times = buy_qty // need
        if times <= 0:
            return 0.0
        free_units = times * get_each
        pct = float(coupon.getDiscountPercent if coupon.getDiscountPercent is not None else 100)
        pct = max(0.0, min(100.0, pct))

        # Discount cheapest get-eligible units first
        unit_prices: list[float] = []
        for i in lines:
            if i["productId"] not in get_ids:
                continue
            unit_prices.extend([i["price"]] * i["quantity"])
        unit_prices.sort()
        take = unit_prices[:free_units]
        return max(0.0, sum(take) * (pct / 100.0))

    return _apply_value(coupon, cart_total)


async def validate_coupon(
    code: str,
    *,
    items: list[dict] | None = None,
    subtotal: float = 0,
) -> tuple[Coupon, float]:
    from fastapi import HTTPException

    coupon = await Coupon.find_one(Coupon.code == str(code).upper().strip(), Coupon.status == "active")
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid discount code")
    if coupon.expiryDate and datetime.utcnow() > coupon.expiryDate:
        raise HTTPException(status_code=400, detail="Discount expired")
    if coupon.usageLimit is not None and (coupon.usedCount or 0) >= coupon.usageLimit:
        raise HTTPException(status_code=400, detail="Discount usage limit reached")

    lines = _norm_items(items)
    cart_total = sum(i["price"] * i["quantity"] for i in lines) if lines else float(subtotal or 0)
    if cart_total < float(coupon.minOrderAmount or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Minimum order amount of ₹{int(coupon.minOrderAmount or 0)} required",
        )

    kind = (coupon.kind or "order").lower()
    if kind in ("products", "bxgy") and not lines:
        raise HTTPException(status_code=400, detail="Add products to apply this discount")

    discount = await compute_discount(coupon, items=lines, subtotal=cart_total)
    if discount <= 0:
        raise HTTPException(status_code=400, detail="No eligible products for this discount")
    return coupon, discount


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
                    {"$eq": [{"$ifNull": ["$usageLimit", None]}, None]},
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


def kind_label(kind: str | None) -> str:
    return {
        "order": "Amount off order",
        "products": "Amount off products",
        "bxgy": "Buy X get Y",
    }.get((kind or "order").lower(), "Discount")


def summary_text(coupon: Coupon) -> str:
    kind = (coupon.kind or "order").lower()
    if kind == "bxgy":
        pct = int(coupon.getDiscountPercent or 100)
        off = "FREE" if pct >= 100 else f"{pct}% off"
        return f"Buy {coupon.buyQuantity or 1} get {coupon.getQuantity or 1} {off}"
    if (coupon.discountType or "percentage") == "percentage":
        base = f"{coupon.discountValue}% off"
    else:
        base = f"₹{int(coupon.discountValue or 0)} off"
    if kind == "products":
        return f"{base} on selected products"
    return f"{base} on order"
