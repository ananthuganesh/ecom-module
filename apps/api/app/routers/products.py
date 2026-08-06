import math
import re
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.documents import Product
from app.serializers import product_dict
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/products", tags=["products"])

_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL", "5XL"]
_BADGE_LABELS = {
    "new_arrival": "New Arrival",
    "trending": "Trending",
    "best_seller": "Best Seller",
}


def _csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def _ci_values(values: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(f"^{re.escape(v)}$", re.I) for v in values]


def _product_price(product: Product) -> float | None:
    if product.pricing and product.pricing.sellingPrice is not None:
        return float(product.pricing.sellingPrice)
    if product.price is not None:
        return float(product.price)
    return None


def _build_product_query(
    *,
    keyword: str | None = None,
    category: str | None = None,
    stone: str | None = None,
    gender: str | None = None,
    brand: str | None = None,
    color: str | None = None,
    size: str | None = None,
    fit: str | None = None,
    fabric: str | None = None,
    badge: str | None = None,
    product: str | None = None,
    minPrice: float | None = None,
    maxPrice: float | None = None,
    priceRange: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    ands: list[dict[str, Any]] = []

    if keyword:
        safe = re.escape(keyword.strip())[:120]
        rx = {"$regex": safe, "$options": "i"}
        ands.append({"$or": [{"productName": rx}, {"product": rx}, {"description": rx}]})
    if category:
        cats = _csv(category)
        if len(cats) == 1:
            query["category"] = {"$regex": f"^{re.escape(cats[0])}$", "$options": "i"}
        elif cats:
            query["category"] = {"$in": _ci_values(cats)}
    if stone:
        query["stone"] = stone
    if gender:
        query["gender"] = {"$regex": f"^{re.escape(gender.strip())}$", "$options": "i"}
    if brand:
        brands = _csv(brand)
        query["brand"] = {"$in": brands}
    if color:
        colors = _csv(color)
        color_rx = _ci_values(colors)
        ands.append(
            {
                "$or": [
                    {"variants.color": {"$in": color_rx}},
                    {"colors": {"$in": color_rx}},
                    {"color": {"$in": color_rx}},
                ]
            }
        )
    if size:
        sizes = _csv(size)
        query["variants.size"] = {"$in": _ci_values(sizes)}
    if fit:
        fits = _csv(fit)
        query["fit"] = {"$in": _ci_values(fits)}
    if fabric:
        fabrics = _csv(fabric)
        query["fabric"] = {"$in": _ci_values(fabrics)}
    if badge:
        badges = _csv(badge)
        query["badge"] = {"$in": badges}
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

    if ands:
        if query:
            query = {"$and": [query, *ands]}
        elif len(ands) == 1:
            query = ands[0]
        else:
            query = {"$and": ands}
    return query


def _price_ranges(min_price: float, max_price: float) -> list[dict[str, str]]:
    """Apparel-friendly buckets clipped to the live catalog range."""
    candidates = [
        ("Under ₹1,000", 0, 999),
        ("₹1,000 – ₹1,499", 1000, 1499),
        ("₹1,500 – ₹1,999", 1500, 1999),
        ("₹2,000 & above", 2000, 100000),
    ]
    out: list[dict[str, str]] = []
    for label, lo, hi in candidates:
        if hi < min_price or lo > max_price:
            continue
        out.append({"label": label, "value": f"{lo}-{hi}"})
    return out or [{"label": f"₹{int(min_price)} – ₹{int(max_price)}", "value": f"{int(min_price)}-{int(max_price)}"}]


def _unique_sorted(values: list[str], *, size_order: bool = False) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in values:
        text = str(raw or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    if size_order:
        rank = {s.lower(): i for i, s in enumerate(_SIZE_ORDER)}
        out.sort(key=lambda s: (rank.get(s.lower(), 100 + len(s)), s.upper()))
    else:
        out.sort(key=lambda s: s.lower())
    return out


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
    size: str | None = None,
    fit: str | None = None,
    fabric: str | None = None,
    badge: str | None = None,
    product: str | None = None,
    minPrice: float | None = None,
    maxPrice: float | None = None,
    priceRange: str | None = None,
    sort: str | None = None,
    _: None = Depends(rate_limit_dependency("products", limit=120)),
):
    query = _build_product_query(
        keyword=keyword,
        category=category,
        stone=stone,
        gender=gender,
        brand=brand,
        color=color,
        size=size,
        fit=fit,
        fabric=fabric,
        badge=badge,
        product=product,
        minPrice=minPrice,
        maxPrice=maxPrice,
        priceRange=priceRange,
    )

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


@router.get("/filters")
async def product_filters():
    """Facet values derived from live catalog data."""
    products = await Product.find({"status": {"$ne": "draft"}}).to_list()
    sizes: list[str] = []
    colors: list[str] = []
    categories: list[str] = []
    fits: list[str] = []
    fabrics: list[str] = []
    badges: list[str] = []
    prices: list[float] = []

    for product in products:
        if product.category:
            categories.append(str(product.category))
        if product.fit:
            fits.append(str(product.fit))
        if product.fabric:
            fabrics.append(str(product.fabric))
        if product.badge:
            badges.append(str(product.badge))
        if product.color:
            colors.append(str(product.color))
        for col in product.colors or []:
            if col:
                colors.append(str(col))
        for variant in product.variants or []:
            if variant.color:
                colors.append(str(variant.color))
            if variant.size:
                sizes.append(str(variant.size))
        price = _product_price(product)
        if price is not None:
            prices.append(price)

    unique_sizes = _unique_sorted(sizes, size_order=True)
    unique_colors = _unique_sorted(colors)
    unique_categories = _unique_sorted(categories)
    unique_fits = _unique_sorted(fits)
    unique_fabrics = _unique_sorted(fabrics)
    unique_badges = _unique_sorted(badges)

    min_price = min(prices) if prices else 0
    max_price = max(prices) if prices else 0

    return {
        "sizes": unique_sizes,
        "colors": unique_colors,
        # Only expose multi-value facets so a single shared category/fit doesn't clutter UI.
        "categories": unique_categories if len(unique_categories) > 1 else [],
        "fits": unique_fits if len(unique_fits) > 1 else [],
        "fabrics": unique_fabrics if len(unique_fabrics) > 1 else [],
        "badges": [
            {"value": b, "label": _BADGE_LABELS.get(b, b.replace("_", " ").title())}
            for b in unique_badges
        ],
        "priceRanges": _price_ranges(min_price, max_price) if prices else [],
        "price": {"min": min_price, "max": max_price},
    }


@router.get("/brands")
async def brands():
    values = await Product.distinct("brand")
    return [v for v in values if v]


@router.get("/colors")
async def colors():
    payload = await product_filters()
    return payload["colors"]


@router.get("/search/suggestions")
async def suggestions(
    q: str = "",
    _: None = Depends(rate_limit_dependency("product-search", limit=60)),
):
    needle = (q or "").strip()
    if len(needle) < 1:
        return []
    safe = re.escape(needle)[:80]
    rx = {"$regex": safe, "$options": "i"}
    products = (
        await Product.find(
            {
                "status": {"$ne": "draft"},
                "$or": [
                    {"productName": rx},
                    {"name": rx},
                    {"product": rx},
                    {"slug": rx},
                ],
            }
        )
        .limit(8)
        .to_list()
    )
    out = []
    for p in products:
        thumbs = list(p.thumbnails or [])
        if not thumbs and p.variants:
            for v in p.variants:
                imgs = list(getattr(v, "images", None) or [])
                if imgs:
                    thumbs = [imgs[0]]
                    break
        price = None
        if p.pricing and p.pricing.sellingPrice is not None:
            price = float(p.pricing.sellingPrice)
        elif p.price is not None:
            price = float(p.price)
        out.append(
            {
                "_id": str(p.id),
                "productName": p.productName or p.name or p.product or "Product",
                "slug": p.slug,
                "thumbnails": thumbs[:1],
                "price": price,
            }
        )
    return out


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

