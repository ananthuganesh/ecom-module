from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from pymongo.errors import NetworkTimeout

from app.main import create_app
from app.routers import media as media_mod


@pytest.fixture
async def client(db):
    app = create_app(with_lifespan=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.usefixtures("db")
async def test_public_reels_returns_503_on_mongo_timeout(client, monkeypatch):
    monkeypatch.setattr(
        media_mod,
        "_list_folder_files",
        AsyncMock(side_effect=NetworkTimeout("SSL handshake failed")),
    )
    res = await client.get("/api/reels")
    assert res.status_code == 503
    assert res.json()["detail"] == "Database temporarily unavailable"
