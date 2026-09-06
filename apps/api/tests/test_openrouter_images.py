from __future__ import annotations

import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.deps import require_admin
from app.main import create_app
from app.routers import admin as admin_mod
from app.services.openrouter import (
    IMAGE_MODEL,
    OPENROUTER_IMAGES_URL,
    extract_images_from_image_api,
    generate_images,
)


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
)
PNG_B64 = base64.b64encode(PNG_1X1).decode("ascii")


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self.response

    async def get(self, url):
        raise AssertionError(f"unexpected GET {url}")


def test_extract_images_from_b64_json():
    payload = {
        "data": [{"b64_json": PNG_B64, "media_type": "image/png"}],
        "usage": {"cost": 0.04},
    }
    images = extract_images_from_image_api(payload)
    assert len(images) == 1
    raw, ext = images[0]
    assert raw == PNG_1X1
    assert ext == ".png"


def test_extract_images_rejects_empty_data():
    with pytest.raises(ValueError, match="No images"):
        extract_images_from_image_api({"data": []})


@pytest.mark.asyncio
async def test_generate_images_posts_image_api_body(monkeypatch):
    fake = FakeClient(
        FakeResponse(
            200,
            {"data": [{"b64_json": PNG_B64, "media_type": "image/png"}]},
        )
    )
    monkeypatch.setattr(
        "app.services.openrouter.httpx.AsyncClient",
        lambda *args, **kwargs: fake,
    )
    images, payload = await generate_images(
        api_key="sk-test",
        prompt="A storefront at dusk",
        aspect_ratio="16:9",
        quality="high",
        image_data_urls=["data:image/png;base64,abc"],
    )
    assert images[0][1] == ".png"
    assert payload["data"]
    call = fake.calls[0]
    assert call["url"] == OPENROUTER_IMAGES_URL
    assert call["headers"]["Authorization"] == "Bearer sk-test"
    body = call["json"]
    assert body["model"] == IMAGE_MODEL
    assert body["prompt"] == "A storefront at dusk"
    assert body["aspect_ratio"] == "16:9"
    assert body["quality"] == "high"
    assert body["n"] == 1
    assert body["input_references"][0]["image_url"]["url"].startswith("data:image/")


@pytest.mark.asyncio
async def test_generate_images_surfaces_openrouter_error(monkeypatch):
    fake = FakeClient(
        FakeResponse(402, {"error": {"code": 402, "message": "Insufficient credits"}})
    )
    monkeypatch.setattr(
        "app.services.openrouter.httpx.AsyncClient",
        lambda *args, **kwargs: fake,
    )
    with pytest.raises(ValueError, match="Insufficient credits"):
        await generate_images(api_key="sk-test", prompt="hello")


@pytest.fixture
async def admin_client(db, monkeypatch):
    async def fake_admin():
        return SimpleNamespace(id="507f1f77bcf86cd799439011", isAdmin=True)

    app = create_app(with_lifespan=False)
    app.dependency_overrides[require_admin] = fake_admin
    monkeypatch.setattr(
        admin_mod,
        "_ai_image_config",
        lambda: ("sk-test", IMAGE_MODEL, "openrouter"),
    )
    monkeypatch.setattr(
        "app.services.ai_media.run_studio_image_generation",
        AsyncMock(return_value=None),
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.usefixtures("db")
async def test_ai_media_status_reports_image_model(admin_client):
    res = await admin_client.get("/api/admin/ai-media/status")
    assert res.status_code == 200
    data = res.json()
    assert data["enabled"] is True
    assert data["provider"] == "openrouter"
    assert data["model"] == IMAGE_MODEL


@pytest.mark.usefixtures("db")
async def test_ai_media_images_creates_job(admin_client):
    res = await admin_client.post(
        "/api/admin/ai-media/images",
        data={
            "prompt": "Editorial photograph of a storefront",
            "aspect_ratio": "16:9",
            "quality": "high",
        },
    )
    assert res.status_code == 202
    data = res.json()
    assert data["status"] == "pending"
    assert data["prompt"] == "Editorial photograph of a storefront"
    assert data["aspectRatio"] == "16:9"
    assert data["quality"] == "high"
    assert data["model"] == IMAGE_MODEL
    assert data["_id"]


@pytest.mark.usefixtures("db")
async def test_ai_media_images_rejects_bad_aspect(admin_client):
    res = await admin_client.post(
        "/api/admin/ai-media/images",
        data={"prompt": "A cat", "aspect_ratio": "5:7"},
    )
    assert res.status_code == 400


@pytest.mark.usefixtures("db")
async def test_ai_media_images_requires_key(db, monkeypatch):
    async def fake_admin():
        return SimpleNamespace(id="507f1f77bcf86cd799439011", isAdmin=True)

    app = create_app(with_lifespan=False)
    app.dependency_overrides[require_admin] = fake_admin
    monkeypatch.setattr(
        admin_mod,
        "_ai_image_config",
        lambda: ("", IMAGE_MODEL, "openrouter"),
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post(
            "/api/admin/ai-media/images",
            data={"prompt": "A cat"},
        )
    assert res.status_code == 503
