"""Resolve a product by Mongo ObjectId or productUrlId (12-digit)."""

from __future__ import annotations

from bson import ObjectId
from bson.errors import InvalidId

from app.documents import Product


async def resolve_product(product_ref: str | None) -> Product | None:
    raw = str(product_ref or "").strip()
    if not raw:
        return None
    cleaned = raw.lstrip("#").strip()
    if not cleaned:
        return None

    if len(cleaned) == 24:
        try:
            product = await Product.get(ObjectId(cleaned))
            if product:
                return product
        except (InvalidId, TypeError):
            pass

    if cleaned.isdigit() and len(cleaned) == 12:
        product = await Product.find_one(Product.productUrlId == cleaned)
        if product:
            return product

    # Slug fallback for convenience
    product = await Product.find_one(Product.slug == cleaned)
    if product:
        return product

    return None
