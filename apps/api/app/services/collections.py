"""Storefront collections: named product groups at /collections/{slug}.

A collection is a ``Category`` document; membership lives on the product as
``Product.collections`` (a list of collection ids), so one product can sit in
several collections at once.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.documents import Category, Product
from app.serializers import doc_to_dict

_EDITABLE = ("name", "slug", "description", "image", "isActive", "metaTitle", "metaDescription")


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")[:80]


def _clean_text(value: Any) -> str | None:
    text = " ".join(str(value or "").split())
    return text or None


async def _get(collection_id: str) -> Category:
    doc = await Category.get(ObjectId(collection_id)) if ObjectId.is_valid(str(collection_id)) else None
    if not doc:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return doc


async def by_slug(slug: str, *, active_only: bool = True) -> Category | None:
    doc = await Category.find_one({"slug": slugify(slug)})
    if not doc or (active_only and not doc.isActive):
        return None
    return doc


async def _product_count(collection_id: str, *, live_only: bool = False) -> int:
    query: dict[str, Any] = {"collections": collection_id}
    if live_only:
        query["status"] = {"$ne": "draft"}
    return await Product.find(query).count()


async def collection_dict(doc: Category, *, live_only: bool = False) -> dict:
    data = doc_to_dict(doc)
    data["productCount"] = await _product_count(str(doc.id), live_only=live_only)
    return data


async def _product_counts(collection_ids: list[str], *, live_only: bool) -> dict[str, int]:
    """Products per collection in one aggregation (the public index hits this)."""
    if not collection_ids:
        return {}
    match: dict[str, Any] = {"collections": {"$in": collection_ids}}
    if live_only:
        match["status"] = {"$ne": "draft"}
    rows = await Product.get_pymongo_collection().aggregate(
        [
            {"$match": match},
            {"$unwind": "$collections"},
            {"$match": {"collections": {"$in": collection_ids}}},
            {"$group": {"_id": "$collections", "count": {"$sum": 1}}},
        ]
    ).to_list(length=None)
    return {str(row["_id"]): int(row["count"]) for row in rows}


async def list_collections(*, active_only: bool = False) -> list[dict]:
    query = {"isActive": True} if active_only else {}
    docs = await Category.find(query).sort([("name", 1)]).to_list()
    counts = await _product_counts([str(d.id) for d in docs], live_only=active_only)
    out = []
    for doc in docs:
        data = doc_to_dict(doc)
        data["productCount"] = counts.get(str(doc.id), 0)
        out.append(data)
    return out


async def _apply(doc: Category, body: dict) -> None:
    for key in _EDITABLE:
        if key not in body:
            continue
        value = body[key]
        if key == "isActive":
            doc.isActive = bool(value)
        elif key == "description":
            doc.description = str(value or "").strip() or None
        else:
            setattr(doc, key, _clean_text(value))
    if not doc.name:
        raise HTTPException(status_code=400, detail="Collection name is required.")
    doc.slug = slugify(doc.slug or doc.name)
    if not doc.slug:
        raise HTTPException(status_code=400, detail="Collection URL needs letters or numbers.")
    clash = await Category.find_one({"slug": doc.slug})
    if clash and clash.id != doc.id:
        raise HTTPException(status_code=409, detail=f"Another collection already uses /collections/{doc.slug}.")


async def create(body: dict) -> dict:
    doc = Category(name=_clean_text(body.get("name")) or "")
    await _apply(doc, body)
    await doc.insert()
    return await collection_dict(doc)


async def update(collection_id: str, body: dict) -> dict:
    doc = await _get(collection_id)
    await _apply(doc, body)
    doc.updatedAt = datetime.utcnow()
    await doc.save()
    return await collection_dict(doc)


async def delete(collection_id: str) -> None:
    doc = await _get(collection_id)
    await Product.find({"collections": str(doc.id)}).update({"$pull": {"collections": str(doc.id)}})
    await doc.delete()


async def links_for(product: Product) -> list[dict]:
    """The product's active collections as {name, slug}, for breadcrumbs."""
    ids = [ObjectId(c) for c in product.collections if ObjectId.is_valid(c)]
    if not ids:
        return []
    docs = await Category.find({"_id": {"$in": ids}, "isActive": True}).sort([("name", 1)]).to_list()
    return [{"name": d.name, "slug": d.slug} for d in docs if d.slug]


def _product_summary(product: Product) -> dict:
    pricing = product.pricing
    return {
        "_id": str(product.id),
        "productUrlId": product.productUrlId,
        "name": product.productName or product.name or product.product or "",
        "slug": product.slug,
        "image": (product.thumbnails or [None])[0],
        "status": product.status,
        "price": pricing.sellingPrice if pricing and pricing.sellingPrice is not None else product.price,
    }


async def detail(collection_id: str) -> dict:
    doc = await _get(collection_id)
    products = (
        await Product.find({"collections": str(doc.id)})
        .sort([("sortOrder", 1), ("createdAt", -1)])
        .to_list()
    )
    data = doc_to_dict(doc)
    data["productCount"] = len(products)
    data["products"] = [_product_summary(p) for p in products]
    return data


def _object_ids(product_ids: Any) -> list[ObjectId]:
    if not isinstance(product_ids, list):
        raise HTTPException(status_code=400, detail="productIds must be a list.")
    return [ObjectId(str(p)) for p in product_ids if ObjectId.is_valid(str(p))]


async def add_products(collection_id: str, product_ids: Any) -> dict:
    doc = await _get(collection_id)
    ids = _object_ids(product_ids)
    if ids:
        await Product.find({"_id": {"$in": ids}}).update({"$addToSet": {"collections": str(doc.id)}})
    return await detail(collection_id)


async def remove_products(collection_id: str, product_ids: Any) -> dict:
    doc = await _get(collection_id)
    ids = _object_ids(product_ids)
    if ids:
        await Product.find({"_id": {"$in": ids}}).update({"$pull": {"collections": str(doc.id)}})
    return await detail(collection_id)


async def file_new_product(product: Product) -> None:
    """A new product joins the collection named after its category, as the old category page implied."""
    slug = slugify(product.category or "")
    if not slug:
        return
    doc = await Category.find_one({"slug": slug})
    if doc and str(doc.id) not in product.collections:
        product.collections = [*product.collections, str(doc.id)]
        await product.save()


async def backfill_from_categories() -> dict:
    """One-off: give every legacy ``Product.category`` name a collection and file its products there."""
    # Legacy slugs like "T-Shirts " never match a lowercased URL lookup — fix them first.
    taken = {d.slug for d in await Category.find_all().to_list() if d.slug}
    for doc in await Category.find_all().to_list():
        wanted = slugify(doc.slug or doc.name)
        if wanted and wanted != doc.slug and wanted not in taken:
            taken.discard(doc.slug)
            taken.add(wanted)
            doc.slug = wanted
            await doc.save()

    names = sorted({c.strip() for c in await Product.distinct("category") if isinstance(c, str) and c.strip()})
    created = linked = 0
    for name in names:
        slug = slugify(name)
        if not slug:
            continue
        doc = await Category.find_one({"slug": slug}) or await Category.find_one(
            {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
        )
        if not doc:
            doc = Category(name=name, slug=slug)
            await doc.insert()
            created += 1
        elif not doc.slug:
            doc.slug = slug
            await doc.save()
        result = await Product.find(
            {"category": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "collections": {"$ne": str(doc.id)}}
        ).update({"$addToSet": {"collections": str(doc.id)}})
        linked += getattr(result, "modified_count", 0) or 0
    return {"categories": len(names), "collections_created": created, "products_linked": linked}
