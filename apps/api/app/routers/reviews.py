"""Product reviews: public listing, verified-buyer writes, admin moderation."""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from app.deps import AdminUser, CurrentUser
from app.documents import Product, Review
from app.services import reviews as reviews_svc
from app.services.rate_limit import rate_limit_dependency

router = APIRouter(prefix="/api/products", tags=["reviews"])
admin_router = APIRouter(prefix="/api/admin/reviews", tags=["admin-reviews"])


# ---------------------------------------------------------------- storefront


@router.get("/{product_id}/reviews")
async def product_reviews(
    product_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=50),
    sort: str = Query("newest"),
    _: None = Depends(rate_limit_dependency("reviews", limit=120)),
):
    return await reviews_svc.list_published(product_id, page=page, page_size=pageSize, sort=sort)


@router.get("/{product_id}/reviews/me")
async def my_review(product_id: str, user: CurrentUser):
    """Whether the signed-in shopper may review this product, and their review."""
    return await reviews_svc.my_review_state(product_id, user)


@router.put("/{product_id}/reviews/me")
async def write_review(
    product_id: str,
    body: dict,
    user: CurrentUser,
    _: None = Depends(rate_limit_dependency("review-write", limit=10)),
):
    review, created = await reviews_svc.submit_review(
        product_id,
        user,
        rating=(body or {}).get("rating"),
        title=(body or {}).get("title"),
        body=(body or {}).get("body"),
    )
    return {"created": created, "review": reviews_svc.serialize_public(review)}


# ---------------------------------------------------------------- admin


@admin_router.get("")
async def list_reviews(
    _: AdminUser,
    status: str | None = None,
    rating: int | None = Query(None, ge=1, le=5),
    q: str | None = None,
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
):
    query: dict[str, Any] = {}
    if status and status.lower() != "all":
        query["status"] = status.strip().lower()
    if rating:
        query["rating"] = rating
    if q and q.strip():
        needle = q.strip()
        query["$or"] = [
            {"title": {"$regex": needle, "$options": "i"}},
            {"body": {"$regex": needle, "$options": "i"}},
            {"authorName": {"$regex": needle, "$options": "i"}},
        ]

    total = await Review.find(query).count()
    rows = (
        await Review.find(query)
        .sort([("createdAt", -1)])
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .to_list()
    )
    product_ids = {r.productId for r in rows if ObjectId.is_valid(r.productId)}
    products = {
        str(p.id): p
        for p in await Product.find({"_id": {"$in": [ObjectId(i) for i in product_ids]}}).to_list()
    }
    return {
        "reviews": [reviews_svc.serialize_admin(r, products.get(r.productId)) for r in rows],
        "total": total,
        "page": page,
        "pageSize": pageSize,
        "pages": max(1, -(-total // pageSize)),
        "hiddenCount": await Review.find({"status": "hidden"}).count(),
    }


@admin_router.post("/{review_id}/hide")
async def hide_review(review_id: str, _: AdminUser):
    review = await reviews_svc.set_status(review_id, "hidden")
    return reviews_svc.serialize_admin(review)


@admin_router.post("/{review_id}/publish")
async def publish_review(review_id: str, _: AdminUser):
    review = await reviews_svc.set_status(review_id, "published")
    return reviews_svc.serialize_admin(review)
