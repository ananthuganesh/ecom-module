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

    # 24-char hex → Mongo ObjectId
    if ObjectId.is_valid(cleaned) and len(cleaned) == 24:
        try:
            product = await Product.get(ObjectId(cleaned))
            if product:
                return product
        except (InvalidId, TypeError):
            pass

    # Public URL id (normally 12-digit). Match string + int forms because
    # older docs may have stored productUrlId as a number.
    if cleaned.isdigit():
        candidates: list[str | int] = [cleaned]
        padded = cleaned.zfill(12)
        if padded != cleaned and len(padded) == 12:
            candidates.append(padded)
        try:
            as_int = int(cleaned)
            candidates.append(as_int)
        except ValueError:
            pass

        # Prefer Beanie typed query for the canonical string form
        for value in candidates:
            if isinstance(value, str) and len(value) == 12:
                product = await Product.find_one(Product.productUrlId == value)
                if product:
                    return product

        col = Product.get_pymongo_collection()
        doc = await col.find_one({"productUrlId": {"$in": candidates}})
        if doc and doc.get("_id") is not None:
            product = await Product.get(doc["_id"])
            if product:
                return product

    # Legacy / convenience: internal productId or slug
    product = await Product.find_one(Product.productId == cleaned)
    if product:
        return product

    product = await Product.find_one(Product.slug == cleaned)
    if product:
        return product

    return None
