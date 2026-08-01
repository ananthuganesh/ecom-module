"""Pagination helper + API harden smoke tests."""

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/urbanaana_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")

from app.config import get_settings
from app.db import close_db, init_db
from app.documents import User
from app.main import create_app
from app.security import create_access_token, hash_password
from app.services.pagination import parse_pagination
from app.services.rate_limit import _buckets, enforce_rate_limit
from fastapi import HTTPException


def test_parse_pagination_defaults():
    skip, limit, page = parse_pagination()
    assert skip == 0
    assert limit == 50
    assert page == 1


def test_parse_pagination_caps_limit():
    skip, limit, page = parse_pagination(page=2, limit=999)
    assert page == 2
    assert limit == 200
    assert skip == 200


def test_rate_limit_trips():
    _buckets.clear()
    for _ in range(3):
        enforce_rate_limit("t:ip", limit=3, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("t:ip", limit=3, window_seconds=60)
    assert exc.value.status_code == 429


@pytest_asyncio.fixture
async def app():
    get_settings.cache_clear()
    mock = AsyncMongoMockClient()
    await init_db(client=mock, db_name="urbanaana_harden_test")
    application = create_app(with_lifespan=False)
    yield application
    await close_db()
    get_settings.cache_clear()
    _buckets.clear()


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_abandoned_ignores_spoofed_userid_when_authed(client):
    owner = User(name="Owner", email="owner@example.com", password=hash_password("password123"))
    await owner.insert()
    victim = User(name="Victim", email="victim@example.com", password=hash_password("password123"))
    await victim.insert()

    r = await client.post(
        "/api/abandoned-checkout",
        headers={"Authorization": f"Bearer {create_access_token(owner.id)}"},
        json={"userId": str(victim.id), "items": [{"sku": "x"}], "totalAmount": 10},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert str(body.get("userId")) == str(owner.id)
    assert body.get("guestId") in (None, "")
    assert "recoveryToken" not in body


@pytest.mark.asyncio
async def test_abandoned_upsert_mints_token_and_recover_rehydrates(client):
    from app.documents import AbandonedCheckout

    r = await client.post(
        "/api/abandoned-checkout",
        json={
            "guestId": "guest_recover_1",
            "items": [
                {
                    "productId": "prod123",
                    "name": "Silk Scarf",
                    "price": 499,
                    "quantity": 2,
                    "color": "Red",
                    "size": "M",
                    "image": "/scarf.jpg",
                }
            ],
            "totalAmount": 998,
            "customerDetails": {
                "name": "Riya",
                "email": "riya@example.com",
                "phone": "9876543210",
                "city": "Mumbai",
            },
        },
    )
    assert r.status_code == 200, r.text
    assert "recoveryToken" not in r.json()

    checkout = await AbandonedCheckout.find_one(AbandonedCheckout.guestId == "guest_recover_1")
    assert checkout is not None
    assert checkout.recoveryToken
    assert len(checkout.recoveryToken) >= 32

    bad = await client.get("/api/abandoned-checkout/recover", params={"token": "not-a-real-token"})
    assert bad.status_code == 404

    # Must not accept Mongo id as token
    by_id = await client.get(
        "/api/abandoned-checkout/recover",
        params={"token": str(checkout.id)},
    )
    assert by_id.status_code == 404

    ok = await client.get(
        "/api/abandoned-checkout/recover",
        params={"token": checkout.recoveryToken},
    )
    assert ok.status_code == 200, ok.text
    data = ok.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["_id"] == "prod123"
    assert data["items"][0]["qty"] == 2
    assert data["items"][0]["price"] == 499
    assert data["shippingAddress"]["email"] == "riya@example.com"
    assert data["shippingAddress"]["name"] == "Riya"
    assert "recoveryToken" not in data


@pytest.mark.asyncio
async def test_recover_mints_session_for_passwordless_only(client):
    from app.documents import AbandonedCheckout, User
    from app.services import cart_recovery

    user = User(name="Guest Shopper", email="guestshop@example.com", password=None)
    await user.insert()

    checkout = AbandonedCheckout(
        userId=user.id,
        items=[{"productId": "abc", "name": "Tee", "price": 100, "quantity": 1}],
        totalAmount=100,
        customerDetails={"email": "guestshop@example.com", "name": "Guest Shopper"},
        status="abandoned",
    )
    await cart_recovery.ensure_recovery_token(checkout)
    await checkout.insert()

    r = await client.get(
        "/api/abandoned-checkout/recover",
        params={"token": checkout.recoveryToken},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["knownUser"]["hasPassword"] is False
    assert data["session"]["token"]
    assert data["session"]["email"] == "guestshop@example.com"


@pytest.mark.asyncio
async def test_recover_restores_known_user_without_password_bypass(client):
    from app.documents import AbandonedCheckout, User
    from app.services import cart_recovery

    user = User(
        name="Known Shopper",
        email="known@example.com",
        password=hash_password("password123"),
    )
    await user.insert()

    checkout = AbandonedCheckout(
        userId=user.id,
        items=[{"productId": "abc", "name": "Tee", "price": 100, "quantity": 1}],
        totalAmount=100,
        customerDetails={"email": "known@example.com", "name": "Known Shopper"},
        status="abandoned",
    )
    await cart_recovery.ensure_recovery_token(checkout)
    await checkout.insert()

    r = await client.get(
        "/api/abandoned-checkout/recover",
        params={"token": checkout.recoveryToken},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["knownUser"]["email"] == "known@example.com"
    assert data["knownUser"]["hasPassword"] is True
    # Passworded accounts: cart restored, but magic link must not bypass password login
    assert data.get("session") in (None, {})
