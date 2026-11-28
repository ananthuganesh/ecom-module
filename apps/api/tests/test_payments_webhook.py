from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import PaymentTransaction
from app.main import create_app
from bson import ObjectId


WEBHOOK_SECRET = "whsec_test_secret"


def _sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()


@pytest.fixture
async def client(db):
    app = create_app(with_lifespan=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.usefixtures("db")
async def test_webhook_rejects_bad_signature(client):
    body = json.dumps({"event": "payment.captured"}).encode("utf-8")
    res = await client.post(
        "/api/payments/webhook",
        content=body,
        headers={"x-razorpay-signature": "deadbeef", "content-type": "application/json"},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid webhook signature"


@pytest.mark.usefixtures("db")
async def test_webhook_unknown_order(client):
    payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test",
                    "order_id": "order_missing",
                    "amount": 10000,
                    "status": "captured",
                }
            }
        },
    }
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    res = await client.post(
        "/api/payments/webhook",
        content=body,
        headers={"x-razorpay-signature": _sign(body), "content-type": "application/json"},
    )
    assert res.status_code == 400
    assert "Unknown Razorpay order" in res.json()["detail"]


@pytest.mark.usefixtures("db")
async def test_webhook_amount_mismatch(client):
    await PaymentTransaction(
        orderId=ObjectId(),
        userId=ObjectId(),
        razorpayOrderId="order_amt",
        amountInPaise=50000,
        currency="INR",
        status="created",
    ).insert()

    payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_amt",
                    "order_id": "order_amt",
                    "amount": 100,
                    "status": "captured",
                }
            }
        },
    }
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    res = await client.post(
        "/api/payments/webhook",
        content=body,
        headers={"x-razorpay-signature": _sign(body), "content-type": "application/json"},
    )
    assert res.status_code == 400
    assert "amount does not match" in res.json()["detail"]
