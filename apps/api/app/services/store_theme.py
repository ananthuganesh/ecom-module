"""Store Theme — storefront presentation the admin can change without a deploy.

Currently the homepage hero slides. Kept in a Setting rather than a collection
because it is a short ordered list edited as a whole, the same shape as the
other store settings.
"""

from __future__ import annotations

from typing import Any

from app.documents import Setting

SETTING_KEY = "store_theme"

MAX_HERO_SLIDES = 5

# Shipped with the app; used until an admin saves their own. Keeping a default
# means the homepage never renders an empty hero.
DEFAULT_HERO_SLIDES = [
    {"url": "/banner/hero-image-01.webp", "alt": "Urban Aana hero 1", "visible": True},
    {"url": "/banner/hero-image-02.webp", "alt": "Urban Aana hero 2", "visible": True},
    {"url": "/banner/hero-image-03.webp", "alt": "Urban Aana hero 3", "visible": True},
    {"url": "/banner/hero-image-04.webp", "alt": "Urban Aana hero 4", "visible": True},
]


def _clean_slide(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    url = str(raw.get("url") or "").strip()
    if not url:
        return None
    return {
        "url": url,
        "alt": str(raw.get("alt") or "").strip()[:200],
        # A hidden slide stays in the list so it can be brought back without
        # re-uploading the image.
        "visible": bool(raw.get("visible", True)),
        "href": str(raw.get("href") or "").strip()[:500] or None,
    }


def normalize_slides(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        slide = _clean_slide(item)
        if slide:
            out.append(slide)
    return out[:MAX_HERO_SLIDES]


async def get_theme() -> dict[str, Any]:
    setting = await Setting.find_one(Setting.key == SETTING_KEY)
    value = setting.value if setting and isinstance(setting.value, dict) else {}
    slides = normalize_slides(value.get("heroSlides"))
    return {
        "heroSlides": slides or [dict(s) for s in DEFAULT_HERO_SLIDES],
        # Tells the admin whether it is looking at saved data or the shipped
        # defaults, so "no banners yet" is distinguishable from "four banners".
        "usingDefaults": not slides,
    }


async def save_hero_slides(raw: Any) -> dict[str, Any]:
    slides = normalize_slides(raw)
    setting = await Setting.find_one(Setting.key == SETTING_KEY)
    value = dict(setting.value) if setting and isinstance(setting.value, dict) else {}
    value["heroSlides"] = slides

    if setting:
        setting.value = value
        await setting.save()
    else:
        await Setting(key=SETTING_KEY, value=value).insert()
    return await get_theme()


async def visible_hero_slides() -> list[dict[str, Any]]:
    """What the storefront should render, hidden slides removed."""
    theme = await get_theme()
    return [s for s in theme["heroSlides"] if s.get("visible", True)]
