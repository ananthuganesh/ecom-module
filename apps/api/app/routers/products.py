import math
import re
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.documents import Product
from app.serializers import product_dict
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("")
async def list_products(
    pageSize: int = Query(default=40, ge=1, le=100),
    pageNum: int = Query(default=1, ge=1),
    keyword: str | None = None,
    category: str | None = None,
    stone: str | None = None,
    gender: str | None = None,
    brand: str | None = None,
    color: str | None = None,
    product: str | None = None,
    minPrice: float | None = None,
    maxPrice: float | None = None,
    priceRange: str | None = None,
    sort: str | None = None,
    _: None = Depends(rate_limit_dependency("products", limit=120)),
):
    query: dict[str, Any] = {}
    if keyword:
        safe = re.escape(keyword.strip())[:120]
        rx = {"$regex": safe, "$options": "i"}
        query["$or"] = [{"productName": rx}, {"product": rx}, {"description": rx}]
    if category:
        query["category"] = category
    if stone:
        query["stone"] = stone
    if gender:
        query["gender"] = gender
    if brand:
        brands = [b.strip() for b in brand.split(",")]
        query["brand"] = {"$in": brands}
    if color:
        colors = [c.strip() for c in color.split(",")]
        query["variants.color"] = {"$in": [re.compile(f"^{re.escape(c)}$", re.I) for c in colors]}
    if product:
        p = re.escape(product.strip())
        query["product"] = {"$regex": f"^{p}$", "$options": "i"}

    final_min, final_max = minPrice, maxPrice
    if priceRange:
        parts = priceRange.split("-")
        if parts and parts[0]:
            final_min = float(parts[0])
        if len(parts) > 1 and parts[1]:
            final_max = float(parts[1])
    if final_min is not None or final_max is not None:
        price_q: dict[str, float] = {}
        if final_min is not None:
            price_q["$gte"] = final_min
        if final_max is not None:
            price_q["$lte"] = final_max
        query["pricing.sellingPrice"] = price_q

    sort_spec = [("createdAt", -1)]
    if sort == "price_asc":
        sort_spec = [("pricing.sellingPrice", 1)]
    elif sort == "price_desc":
        sort_spec = [("pricing.sellingPrice", -1)]

    total = await Product.find(query).count()
    products = await Product.find(query).sort(sort_spec).skip(pageSize * (pageNum - 1)).limit(pageSize).to_list()
    return {
        "products": [product_dict(p) for p in products],
        "page": pageNum,
        "pages": math.ceil(total / pageSize) if pageSize else 1,
        "total": total,
    }


@router.get("/featured")
async def featured(limit: int = Query(default=4, le=12)):
    products = await Product.find_all().sort([("createdAt", -1)]).limit(limit).to_list()
    return [product_dict(p) for p in products]


@router.get("/brands")
async def brands():
    values = await Product.distinct("brand")
    return [v for v in values if v]


@router.get("/colors")
async def colors():
    values = await Product.distinct("variants.color")
    seen = set()
    out = []
    for c in values:
        c = (c or "").strip()
        if c and c.lower() not in seen:
            seen.add(c.lower())
            out.append(c)
    return out


@router.get("/search/suggestions")
async def suggestions(
    q: str = "",
    _: None = Depends(rate_limit_dependency("product-search", limit=60)),
):
    if not q:
        return []
    safe = re.escape(q.strip())[:80]
    rx = {"$regex": safe, "$options": "i"}
    products = await Product.find({"$or": [{"productName": rx}, {"product": rx}]}).limit(8).to_list()
    return [{"_id": str(p.id), "productName": p.productName or p.name, "slug": p.slug} for p in products]


@router.get("/slug/{slug}")
async def by_slug(slug: str):
    product = await Product.find_one(Product.slug == slug)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_dict(product)


@router.get("/{product_id}")
async def by_id(product_id: str):
    if not ObjectId.is_valid(product_id):
        raise HTTPException(status_code=404, detail="Product not found")
    product = await Product.get(ObjectId(product_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_dict(product)

