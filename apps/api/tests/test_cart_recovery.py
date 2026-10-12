"""Recovery links restore a cart; only a cart saved by an account's own session signs it in."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import AbandonedCheckout, User
from app.main import create_app


async def _recover(token: str):
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        return await c.post("/api/abandoned-checkout/recover", json={"token": token})


async def _row(**fields) -> AbandonedCheckout:
    from app.services import cart_recovery

    row = AbandonedCheckout(items=[{"productId": "p1", "quantity": 1}], status="abandoned", **fields)
    await cart_recovery.ensure_recovery_token(row)
    await row.insert()
    return row


@pytest.mark.usefixtures("db")
async def test_guest_cart_with_someone_elses_email_does_not_sign_them_in():
    """Anyone can save a guest cart with any email and their own phone, then get the WhatsApp link."""
    victim = User(name="Victim", email="victim@example.com")
    await victim.insert()
    row = await _row(guestId="g1", customerDetails={"email": "victim@example.com", "phone": "9000000009"})

    res = await _recover(row.recoveryToken)

    assert res.status_code == 200
    assert res.json()["session"] is None
    assert res.json()["knownUser"] is None
    assert "ua_session" not in res.headers.get("set-cookie", "")
    assert res.json()["items"]


@pytest.mark.usefixtures("db")
async def test_account_cart_signs_its_owner_in():
    owner = User(name="Owner", email="owner@example.com")
    await owner.insert()
    row = await _row(userId=owner.id)

    res = await _recover(row.recoveryToken)

    assert res.json()["session"]["email"] == "owner@example.com"
    assert "ua_session" in res.headers.get("set-cookie", "")
