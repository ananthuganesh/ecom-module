from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.deps import AdminUser
from app.serializers import doc_to_dict
from app.services import collections as collections_svc

router = APIRouter(prefix="/api/collections", tags=["collections"])
admin_router = APIRouter(prefix="/api/admin/collections", tags=["admin-collections"])


@router.get("")
async def list_public():
    return await collections_svc.list_collections(active_only=True)


@router.get("/{slug}")
async def by_slug(slug: str):
    doc = await collections_svc.by_slug(slug)
    if not doc:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return doc_to_dict(doc)


@admin_router.get("")
async def admin_list(_: AdminUser):
    return await collections_svc.list_collections()


@admin_router.post("", status_code=201)
async def admin_create(body: dict, _: AdminUser):
    return await collections_svc.create(body or {})


@admin_router.get("/{collection_id}")
async def admin_detail(collection_id: str, _: AdminUser):
    return await collections_svc.detail(collection_id)


@admin_router.put("/{collection_id}")
async def admin_update(collection_id: str, body: dict, _: AdminUser):
    return await collections_svc.update(collection_id, body or {})


@admin_router.delete("/{collection_id}")
async def admin_delete(collection_id: str, _: AdminUser):
    await collections_svc.delete(collection_id)
    return {"message": "Collection deleted."}


@admin_router.post("/{collection_id}/products")
async def admin_add_products(collection_id: str, body: dict, _: AdminUser):
    return await collections_svc.add_products(collection_id, (body or {}).get("productIds"))


@admin_router.post("/{collection_id}/products/remove")
async def admin_remove_products(collection_id: str, body: dict, _: AdminUser):
    return await collections_svc.remove_products(collection_id, (body or {}).get("productIds"))
