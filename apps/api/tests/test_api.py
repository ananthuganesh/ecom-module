import hashlib
import hmac
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/urbanaana_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("RAZORPAY_KEY_ID", "rzp_test_key")
os.environ.setdefault("RAZORPAY_KEY_SECRET", "rzp_test_secret")

from app.config import get_settings
from app.db import close_db, init_db
from app.documents import Order, OrderItem, PaymentTransaction, Pricing, Product, User
from app.main import create_app
from app.security import create_access_token, hash_password


@pytest_asyncio.fixture
async def app():
    get_settings.cache_clear()
    mock = AsyncMongoMockClient()
    await init_db(client=mock, db_name="urbanaana_test")
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
async def user(app):
    u = User(name="Alice", email="alice@example.com", password=hash_password("password123"), isAdmin=False)
    await u.insert()
    return u


@pytest_asyncio.fixture
async def admin(app):
    u = User(name="Admin", email="admin@example.com", password=hash_password("password123"), isAdmin=True)
    await u.insert()
    return u


def auth_header(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["backend"] == "fastapi"


@pytest.mark.asyncio
async def test_checkout_email_creates_passwordless_customer(client):
    r = await client.post(
        "/api/users/checkout-email",
        json={"email": "new@example.com", "name": "New Shopper"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "new@example.com"
    assert data["hasPassword"] is False
    assert data["created"] is True
    assert data["token"]

    # Cold re-entry (no session): no JWT — first checkout stays OTP-free, ATO blocked
    r2 = await client.post(
        "/api/users/checkout-email",
        json={"email": "new@example.com"},
    )
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["created"] is False
    assert data2.get("requiresExistingSession") is True
    assert data2.get("requiresLogin") is False
    assert "token" not in data2 or data2.get("token") in (None, "")

    # Same browser / existing session can renew
    r3 = await client.post(
        "/api/users/checkout-email",
        json={"email": "new@example.com"},
        headers={"Authorization": f"Bearer {data['token']}"},
    )
    assert r3.status_code == 200
    assert r3.json().get("token")
    assert r3.json().get("requiresExistingSession") is False


@pytest.mark.asyncio
async def test_checkout_email_existing_account_has_password(client, user):
    r = await client.post(
        "/api/users/checkout-email",
        json={"email": "alice@example.com"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["created"] is False
    assert data.get("requiresLogin") is True
    assert "token" not in data or data.get("token") in (None, "")
    # Must not leak profile/admin fields without authentication
    assert "addresses" not in data
    assert "isAdmin" not in data
    assert "hasPassword" not in data


@pytest.mark.asyncio
async def test_checkout_email_blocks_admin_account(client, admin):
    r = await client.post(
        "/api/users/checkout-email",
        json={"email": admin.email},
    )
    # Staff emails get the same continue shape as passworded accounts (no 403 oracle).
    assert r.status_code == 200
    data = r.json()
    assert data.get("requiresLogin") is True
    assert "token" not in data or data.get("token") in (None, "")
    assert "isAdmin" not in data

@pytest.mark.asyncio
async def test_update_user_rejects_is_admin_escalation(client, admin, user):
    r = await client.put(
        f"/api/users/{user.id}",
        json={"isAdmin": True},
        headers=auth_header(admin),
    )
    assert r.status_code == 400
    refreshed = await User.get(user.id)
    assert refreshed.isAdmin is False

@pytest.mark.asyncio
async def test_set_password_on_passwordless_account(client):
    r = await client.post(
        "/api/users/checkout-email",
        json={"email": "track@example.com", "name": "Tracker"},
    )
    token = r.json()["token"]

    r2 = await client.post(
        "/api/users/set-password",
        json={"password": "secret123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["hasPassword"] is True

    r3 = await client.post(
        "/api/users/login",
        json={"email": "track@example.com", "password": "secret123"},
    )
    assert r3.status_code == 200

    r4 = await client.post(
        "/api/users/set-password",
        json={"password": "another123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r4.status_code == 400


@pytest.mark.asyncio
async def test_register_login_profile(client):
    r = await client.post(
        "/api/users",
        json={"name": "Bob", "email": "bob@example.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    assert token

    r2 = await client.post("/api/users/login", json={"email": "bob@example.com", "password": "password123"})
    assert r2.status_code == 200
    assert r2.json()["email"] == "bob@example.com"

    r3 = await client.get("/api/users/profile", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["name"] == "Bob"


@pytest.mark.asyncio
async def test_profile_requires_auth(client):
    r = await client.get("/api/users/profile")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_requires_admin(client, user):
    r = await client.get("/api/admin/products", headers=auth_header(user))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_payment_method_settings_default_save_and_disable_razorpay(client, user, admin):
    headers = auth_header(admin)
    defaults = await client.get("/api/admin/payment-methods", headers=headers)
    assert defaults.status_code == 200
    assert defaults.json() == {"razorpay": True}

    saved = await client.put("/api/admin/payment-methods", headers=headers, json={"razorpay": False})
    assert saved.status_code == 200
    assert saved.json() == {"razorpay": False}

    product = Product(productName="Razorpay-disabled item", pricing=Pricing(sellingPrice=100, offerPrice=100), totalStock=2)
    await product.insert()
    create = await client.post(
        "/api/orders",
        headers=auth_header(user),
        json={
            "orderItems": [{"product": str(product.id), "qty": 1}],
            "shippingAddress": {"pincode": "682001", "country": "India"},
            "paymentMethod": "razorpay",
        },
    )
    assert create.status_code == 400
    assert create.json()["detail"] == "Online payments are currently unavailable"


@pytest.mark.asyncio
async def test_notification_preferences_default_and_save(client, admin):
    headers = auth_header(admin)
    defaults = await client.get("/api/admin/notification-prefs", headers=headers)
    assert defaults.status_code == 200
    assert defaults.json() == {
        "adminNewOrderAlert": True,
    }

    saved = await client.put(
        "/api/admin/notification-prefs",
        headers=headers,
        json={"adminNewOrderAlert": False},
    )
    assert saved.status_code == 200
    assert saved.json() == {
        "adminNewOrderAlert": False,
    }


@pytest.mark.asyncio
async def test_admin_create_and_list_products(client, admin):
    r = await client.post(
        "/api/admin/products",
        headers=auth_header(admin),
        json={
            "productName": "Silk Hijab",
            "product": "Hijabs",
            "pricing": {"sellingPrice": 499, "offerPrice": 399},
            "totalStock": 10,
            "status": "active",
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["_id"]

    public = await client.get("/api/products")
    assert public.status_code == 200
    assert public.json()["total"] >= 1
    assert any(p["_id"] == pid for p in public.json()["products"])


@pytest.mark.asyncio
async def test_order_ownership(client, user, admin):
    other = User(name="Eve", email="eve@example.com", password=hash_password("password123"))
    await other.insert()
    product = Product(
        productName="Test Item",
        pricing=Pricing(sellingPrice=100, offerPrice=100),
        totalStock=5,
    )
    await product.insert()

    create = await client.post(
        "/api/orders",
        headers=auth_header(user),
        json={
            "orderItems": [{"product": str(product.id), "qty": 1, "price": 100}],
            "shippingAddress": {
                "name": "Alice",
                "phone": "999",
                "house": "1",
                "city": "Kochi",
                "state": "KL",
                "pincode": "682001",
                "country": "India",
            },
            "paymentMethod": "razorpay",
            "shippingPrice": 0,
            "totalPrice": 100,
        },
    )
    assert create.status_code == 201, create.text
    order_id = create.json()["_id"]

    forbidden = await client.get(f"/api/orders/{order_id}", headers=auth_header(other))
    assert forbidden.status_code == 403

    allowed = await client.get(f"/api/orders/{order_id}", headers=auth_header(user))
    assert allowed.status_code == 200

    admin_ok = await client.get(f"/api/orders/{order_id}", headers=auth_header(admin))
    assert admin_ok.status_code == 200


@pytest.mark.asyncio
async def test_payment_verify_rejects_mismatched_order(client, user):
    product = Product(productName="Pay Item", pricing=Pricing(sellingPrice=50, offerPrice=50), totalStock=3)
    await product.insert()
    order_a = Order(
        customerId=user.id,
        items=[OrderItem(productId=product.id, quantity=1, price=50)],
        finalPrice=50,
        paymentMethod="razorpay",
        paymentStatus="pending",
    )
    await order_a.insert()
    order_b = Order(
        customerId=user.id,
        items=[OrderItem(productId=product.id, quantity=1, price=50)],
        finalPrice=50,
        paymentMethod="razorpay",
        paymentStatus="pending",
    )
    await order_b.insert()

    await PaymentTransaction(
        orderId=order_a.id,
        userId=user.id,
        razorpayOrderId="order_AAA",
        amountInPaise=5000,
        status="created",
    ).insert()

    secret = os.environ["RAZORPAY_KEY_SECRET"]
    payment_id = "pay_AAA"
    signature = hmac.new(secret.encode(), f"order_AAA|{payment_id}".encode(), hashlib.sha256).hexdigest()

    r = await client.post(
        "/api/payments/verify",
        headers=auth_header(user),
        json={
            "razorpay_order_id": "order_AAA",
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
            "localOrderId": str(order_b.id),
        },
    )
    assert r.status_code == 400
    assert "match" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_manual_pay_forbidden_for_customer(client, user):
    order = Order(customerId=user.id, items=[], finalPrice=10, paymentMethod="cod", paymentStatus="pending")
    await order.insert()
    r = await client.put(f"/api/orders/{order.id}/pay", headers=auth_header(user), json={})
    assert r.status_code == 403
