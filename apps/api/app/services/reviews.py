"""Product reviews from verified buyers.

Only a customer with a delivered order for the product can review it, so every
review on the site is from someone who actually received the item. Reviews
publish immediately; an admin can hide one, which takes it out of the
storefront and out of the rating.

The average and count are written onto the product so listings and the PDP's
structured data read them without a join.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.documents import Order, Product, Review, User

MAX_TITLE = 120
MAX_BODY = 2000
REVIEW_STATUSES = ("published", "hidden")
# Received the item — a return does not undo having worn it.
_RECEIVED_STATUSES = ("delivered", "returned")


def public_author_name(user: User | None) -> str:
    """First name and last initial: "Arjun M." Never the email."""
    parts = str(getattr(user, "name", "") or "").split()
    if not parts:
        return "Verified buyer"
    first = parts[0][:40]
    return f"{first} {parts[-1][0].upper()}." if len(parts) > 1 else first


def _ids(value: str) -> list[Any]:
    """Legacy rows store ids as either strings or ObjectIds."""
    out: list[Any] = [str(value)]
    if ObjectId.is_valid(str(value)):
        out.append(ObjectId(str(value)))
    return out


async def _product(product_id: str) -> Product:
    product = await Product.get(ObjectId(product_id)) if ObjectId.is_valid(str(product_id)) else None
    if not product or str(product.status or "").lower() == "draft":
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


async def received_order(product_id: str, user: User) -> Order | None:
    """The customer's most recent order that delivered this product."""
    orders = (
        await Order.find(
            {
                "customerId": {"$in": _ids(str(user.id))},
                "items.productId": {"$in": _ids(product_id)},
            }
        )
        .sort([("createdAt", -1)])
        .limit(20)
        .to_list()
    )
    for order in orders:
        status = str(order.status or "").strip().lower()
        if status in _RECEIVED_STATUSES or (order.isDelivered and status != "cancelled"):
            return order
    return None


def _size_on(order: Order, product_id: str) -> str:
    for line in order.items or []:
        if str(getattr(line, "productId", "") or "") == str(product_id):
            return str(getattr(line, "size", "") or "")
    return ""


def serialize_public(review: Review) -> dict[str, Any]:
    return {
        "_id": str(review.id),
        "rating": review.rating,
        "title": review.title,
        "body": review.body,
        "authorName": review.authorName,
        "size": review.size,
        "verified": True,
        "createdAt": review.createdAt,
        "updatedAt": review.updatedAt,
    }


def serialize_admin(review: Review, product: Product | None = None) -> dict[str, Any]:
    data = serialize_public(review)
    data.update(
        {
            "status": review.status,
            "productId": review.productId,
            "customerId": review.customerId,
            "orderId": review.orderId,
            "productName": (product.productName or product.name) if product else None,
            "productSlug": product.slug if product else None,
        }
    )
    return data


def _clean_rating(value: Any) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    if isinstance(value, bool) or not number.is_integer() or not 1 <= number <= 5:
        raise HTTPException(status_code=400, detail="Choose a rating from 1 to 5 stars.")
    return int(number)


def _clean_text(value: Any, limit: int, label: str) -> str:
    text = " ".join(str(value or "").split())
    if len(text) > limit:
        raise HTTPException(status_code=400, detail=f"{label} can be at most {limit} characters.")
    return text


async def recompute_rating(product_id: str) -> dict[str, Any]:
    """Refresh the product's average and count from published reviews."""
    rows = await Review.find(
        Review.productId == str(product_id), Review.status == "published"
    ).to_list()
    count = len(rows)
    average = round(sum(r.rating for r in rows) / count, 1) if count else 0
    if ObjectId.is_valid(str(product_id)):
        await Product.get_pymongo_collection().update_one(
            {"_id": ObjectId(str(product_id))},
            {"$set": {"ratingAverage": average, "ratingCount": count}},
        )
    return {"average": average, "count": count}


async def my_review_state(product_id: str, user: User) -> dict[str, Any]:
    await _product(product_id)
    existing = await Review.find_one(
        Review.productId == str(product_id), Review.customerId == str(user.id)
    )
    if existing:
        return {"canReview": True, "reason": None, "review": serialize_public(existing)}
    if not await received_order(product_id, user):
        return {
            "canReview": False,
            "reason": "Only customers who received this product can review it.",
            "review": None,
        }
    return {"canReview": True, "reason": None, "review": None}


async def submit_review(
    product_id: str,
    user: User,
    *,
    rating: Any,
    title: Any = "",
    body: Any = "",
) -> tuple[Review, bool]:
    """Create the customer's review, or edit the one they already wrote.

    Returns (review, created).
    """
    await _product(product_id)
    clean_rating = _clean_rating(rating)
    clean_title = _clean_text(title, MAX_TITLE, "Title")
    clean_body = str(body or "").replace("\r", "").strip()
    if len(clean_body) > MAX_BODY:
        raise HTTPException(status_code=400, detail=f"Review can be at most {MAX_BODY} characters.")

    existing = await Review.find_one(
        Review.productId == str(product_id), Review.customerId == str(user.id)
    )
    if existing:
        # Editing never un-hides a review an admin took down.
        existing.rating = clean_rating
        existing.title = clean_title
        existing.body = clean_body
        existing.updatedAt = datetime.utcnow()
        await existing.save()
        await recompute_rating(product_id)
        return existing, False

    order = await received_order(product_id, user)
    if not order:
        raise HTTPException(
            status_code=403,
            detail="Only customers who received this product can review it.",
        )

    review = Review(
        productId=str(product_id),
        customerId=str(user.id),
        orderId=str(order.id),
        rating=clean_rating,
        title=clean_title,
        body=clean_body,
        authorName=public_author_name(user),
        size=_size_on(order, product_id),
    )
    try:
        await review.insert()
    except DuplicateKeyError:
        # A double submit raced us; treat the second as an edit.
        return await submit_review(product_id, user, rating=rating, title=title, body=body)
    await recompute_rating(product_id)
    return review, True


async def list_published(
    product_id: str,
    *,
    page: int = 1,
    page_size: int = 10,
    sort: str = "newest",
) -> dict[str, Any]:
    await _product(product_id)
    query = {"productId": str(product_id), "status": "published"}
    ratings = [r.rating for r in await Review.find(query).to_list()]
    count = len(ratings)
    distribution = {str(star): ratings.count(star) for star in range(5, 0, -1)}

    order_by = {
        "highest": [("rating", -1), ("createdAt", -1)],
        "lowest": [("rating", 1), ("createdAt", -1)],
    }.get(sort, [("createdAt", -1)])
    rows = (
        await Review.find(query)
        .sort(order_by)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return {
        "reviews": [serialize_public(r) for r in rows],
        "summary": {
            "average": round(sum(ratings) / count, 1) if count else 0,
            "count": count,
            "distribution": distribution,
        },
        "page": page,
        "pageSize": page_size,
        "pages": max(1, -(-count // page_size)),
    }


async def set_status(review_id: str, status: str) -> Review:
    wanted = str(status or "").strip().lower()
    if wanted not in REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="Status must be published or hidden.")
    review = await Review.get(ObjectId(review_id)) if ObjectId.is_valid(review_id) else None
    if not review:
        raise HTTPException(status_code=404, detail="Review not found.")
    if review.status != wanted:
        review.status = wanted
        review.updatedAt = datetime.utcnow()
        await review.save()
        await recompute_rating(review.productId)
    return review
