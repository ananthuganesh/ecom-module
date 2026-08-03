"""Payment verify amount/status checks."""

import hashlib
import hmac
import os
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/urbanaana_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("RAZORPAY_LIVE_API_KEY", "rzp_test_key")
os.environ.setdefault("RAZORPAY_LIVE_KEY_SECRET", "rzp_test_secret")

from app.config import get_settings
from app.db import close_db, init_db
from app.documents import Order, OrderItem, PaymentTransaction, Pricing, Product, User
from app.main import create_app
from app.security import create_access_token, hash_password


@pytest_asyncio.fixture
async def app():
    get_settings.cache_clear()
    mock = AsyncMongoMockClient()
    await init_db(client=mock, db_name="urbanaana_pay_test")
    application = create_app(with_lifespan=False)
    yield application
    await close_db()
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def setup_order(app):
    user = User(name="Pay", email="pay@example.com", password=hash_password("password123"))
    await user.insert()
    product = Product(
        productName="Item",
        pricing=Pricing(sellingPrice=50, offerPrice=50),
        totalStock=3,
    )
    await product.insert()
    order = Order(
        customerId=user.id,
        items=[OrderItem(productId=product.id, quantity=1, price=50)],
        finalPrice=50,
        paymentMethod="razorpay",
        paymentStatus="pending",
        status="order placed",
        transactionDetails={"stockReserved": True},
    )
    await order.insert()
    txn = PaymentTransaction(
        orderId=order.id,
        userId=user.id,
        razorpayOrderId="order_test_1",
        amountInPaise=5000,
        status="created",
    )
    await txn.insert()
    return user, order, txn


def _sign(order_id: str, payment_id: str) -> str:
    return hmac.new(
        b"rzp_test_secret",
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()


@pytest.mark.asyncio
async def test_verify_rejects_amount_mismatch(client, setup_order):
    user, order, txn = setup_order
    payment_id = "pay_bad_amt"
    signature = _sign(txn.razorpayOrderId, payment_id)

    mock_client = MagicMock()
    mock_client.payment.fetch.return_value = {
        "id": payment_id,
        "status": "captured",
        "amount": 9999,
        "order_id": txn.razorpayOrderId,
    }

    with patch("razorpay.Client", return_value=mock_client):
        r = await client.post(
            "/api/payments/verify",
            headers={"Authorization": f"Bearer {create_access_token(user.id)}"},
            json={
                "razorpay_order_id": txn.razorpayOrderId,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
                "localOrderId": str(order.id),
            },
        )
    assert r.status_code == 400
    assert "amount" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_rejects_non_captured(client, setup_order):
    user, order, txn = setup_order
    payment_id = "pay_failed"
    signature = _sign(txn.razorpayOrderId, payment_id)

    mock_client = MagicMock()
    mock_client.payment.fetch.return_value = {
        "id": payment_id,
        "status": "failed",
        "amount": 5000,
        "order_id": txn.razorpayOrderId,
    }

    with patch("razorpay.Client", return_value=mock_client):
        r = await client.post(
            "/api/payments/verify",
            headers={"Authorization": f"Bearer {create_access_token(user.id)}"},
            json={
                "razorpay_order_id": txn.razorpayOrderId,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
                "localOrderId": str(order.id),
            },
        )
    assert r.status_code == 400
    assert "captured" in r.json()["detail"].lower()
