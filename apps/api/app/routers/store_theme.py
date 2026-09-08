"""Store Theme: homepage hero banners the admin manages."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.deps import AdminUser
from app.services import store_theme as theme_svc

router = APIRouter(prefix="/api/store-theme", tags=["store-theme"])
admin_router = APIRouter(prefix="/api/admin/store-theme", tags=["admin-store-theme"])


@router.get("/banners")
async def public_banners():
    """Slides for the storefront hero. Public — the homepage renders these."""
    return {"heroSlides": await theme_svc.visible_hero_slides()}


@admin_router.get("/banners")
async def get_banners(_: AdminUser):
    return await theme_svc.get_theme()


@admin_router.put("/banners")
async def save_banners(body: dict, _: AdminUser):
    slides = (body or {}).get("heroSlides")
    if not isinstance(slides, list):
        raise HTTPException(status_code=400, detail="heroSlides must be a list")
    if len(slides) > theme_svc.MAX_HERO_SLIDES:
        raise HTTPException(
            status_code=400,
            detail=f"At most {theme_svc.MAX_HERO_SLIDES} banners",
        )
    return await theme_svc.save_hero_slides(slides)
