from __future__ import annotations

import pytest

from app.documents import Setting
from app.services import store_theme


def test_normalize_drops_slides_without_a_url():
    slides = store_theme.normalize_slides(
        [
            {"url": "/banner/a.webp", "alt": "A"},
            {"alt": "no url"},
            {"url": "   "},
            "not a dict",
            None,
        ]
    )
    assert [s["url"] for s in slides] == ["/banner/a.webp"]


def test_normalize_defaults_visible_and_trims_text():
    slide = store_theme.normalize_slides([{"url": "/b.webp", "alt": "  hi  "}])[0]
    assert slide["visible"] is True
    assert slide["alt"] == "hi"
    assert slide["href"] is None


def test_normalize_keeps_hidden_slides():
    """Hiding must not delete the slide — it can be brought back without a re-upload."""
    slides = store_theme.normalize_slides([{"url": "/b.webp", "visible": False}])
    assert len(slides) == 1
    assert slides[0]["visible"] is False


def test_normalize_caps_the_list():
    many = [{"url": f"/b{i}.webp"} for i in range(25)]
    assert len(store_theme.normalize_slides(many)) == store_theme.MAX_HERO_SLIDES


def test_normalize_survives_garbage():
    assert store_theme.normalize_slides(None) == []
    assert store_theme.normalize_slides("nope") == []
    assert store_theme.normalize_slides({}) == []


@pytest.mark.usefixtures("db")
async def test_defaults_are_served_until_an_admin_saves():
    theme = await store_theme.get_theme()
    assert theme["usingDefaults"] is True
    assert len(theme["heroSlides"]) == len(store_theme.DEFAULT_HERO_SLIDES)


@pytest.mark.usefixtures("db")
async def test_saving_replaces_the_defaults():
    saved = await store_theme.save_hero_slides(
        [{"url": "/banner/new.webp", "alt": "New", "visible": True}]
    )
    assert saved["usingDefaults"] is False
    assert [s["url"] for s in saved["heroSlides"]] == ["/banner/new.webp"]

    again = await store_theme.get_theme()
    assert [s["url"] for s in again["heroSlides"]] == ["/banner/new.webp"]


@pytest.mark.usefixtures("db")
async def test_saving_preserves_other_theme_keys():
    await Setting(key=store_theme.SETTING_KEY, value={"somethingElse": 1}).insert()
    await store_theme.save_hero_slides([{"url": "/b.webp"}])
    setting = await Setting.find_one(Setting.key == store_theme.SETTING_KEY)
    assert setting.value["somethingElse"] == 1


@pytest.mark.usefixtures("db")
async def test_storefront_only_sees_visible_slides():
    await store_theme.save_hero_slides(
        [
            {"url": "/a.webp", "visible": True},
            {"url": "/b.webp", "visible": False},
            {"url": "/c.webp", "visible": True},
        ]
    )
    visible = await store_theme.visible_hero_slides()
    assert [s["url"] for s in visible] == ["/a.webp", "/c.webp"]


@pytest.mark.usefixtures("db")
async def test_clearing_every_slide_falls_back_to_defaults():
    """An empty hero would break the homepage, so defaults come back."""
    await store_theme.save_hero_slides([])
    theme = await store_theme.get_theme()
    assert theme["usingDefaults"] is True
    assert theme["heroSlides"]
