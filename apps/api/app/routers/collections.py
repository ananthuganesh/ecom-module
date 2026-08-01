from fastapi import APIRouter, HTTPException

from app.documents import CollectionDoc
from app.serializers import doc_to_dict

router = APIRouter(prefix="/api/collections", tags=["collections"])


@router.get("")
async def list_collections():
    cols = await CollectionDoc.find_all().to_list()
    return [doc_to_dict(c) for c in cols]


@router.get("/category/{slug}")
async def by_category(slug: str):
    cols = await CollectionDoc.find(CollectionDoc.category == slug).to_list()
    return [doc_to_dict(c) for c in cols]


@router.get("/{slug}")
async def by_slug(slug: str):
    col = await CollectionDoc.find_one(CollectionDoc.slug == slug)
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return doc_to_dict(col)
