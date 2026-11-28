"""Shopify-style discount rules: collections, minimums, schedule, customers, Buy X get Y."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.documents import AdminAccount, Category, Coupon, Order, OrderItem, Pricing, Product, Role, User
from app.services import discounts, magic_checkout
from app.services.discounts import Shopper


async def _product(name="Tee", price=1000, collections=()):
    p = Product(productName=name, pricing=Pricing(sellingPrice=price), collections=list(collections))
    await p.insert()
    return p


def _line(product, qty=1):
    return {"productId": str(product.id), "price": float(product.pricing.sellingPrice), "quantity": qty}


async def _coupon(**fields):
    coupon = Coupon(**{"code": "SAVE", "discountType": "percentage", "discountValue": 10, **fields})
    await coupon.insert()
    return coupon


async def _reason(code, items, **kw):
    with pytest.raises(HTTPException) as err:
        await discounts.validate_coupon(code, items=items, **kw)
    return err.value.detail


# ───────────────────────────────────────── amount off products


@pytest.mark.usefixtures("db")
async def test_collection_discount_only_counts_items_in_the_collection():
    tees = Category(name="Tees")
    await tees.insert()
    tee = await _product("Tee", 1000, [str(tees.id)])
    cap = await _product("Cap", 500)
    await _coupon(kind="products", appliesTo="collections", collectionIds=[str(tees.id)], discountValue=20)

    _, discount = await discounts.validate_coupon("SAVE", items=[_line(tee), _line(cap)])
    assert discount == 200.0
    assert await _reason("SAVE", [_line(cap)]) == "No eligible products for this discount"


@pytest.mark.usefixtures("db")
async def test_fixed_amount_each_item_versus_once_per_order():
    tee = await _product()
    await _coupon(code="EACH", kind="products", productIds=[str(tee.id)], discountType="fixed",
                  discountValue=100, oncePerOrder=False)
    await _coupon(code="ONCE", kind="products", productIds=[str(tee.id)], discountType="fixed",
                  discountValue=100, oncePerOrder=True)

    assert (await discounts.validate_coupon("EACH", items=[_line(tee, 3)]))[1] == 300.0
    assert (await discounts.validate_coupon("ONCE", items=[_line(tee, 3)]))[1] == 100.0


@pytest.mark.usefixtures("db")
async def test_minimums_count_only_the_items_the_discount_applies_to():
    tee = await _product("Tee", 1000)
    cap = await _product("Cap", 2000)
    await _coupon(code="MINAMT", kind="products", productIds=[str(tee.id)], minRequirement="amount",
                  minOrderAmount=1500)
    await _coupon(code="MINQTY", kind="order", minRequirement="quantity", minQuantity=3)

    # ₹3,000 cart, but only ₹1,000 of it is eligible.
    assert "Minimum order amount" in await _reason("MINAMT", [_line(tee), _line(cap)])
    assert (await discounts.validate_coupon("MINAMT", items=[_line(tee, 2)]))[1] == 200.0
    assert await _reason("MINQTY", [_line(tee, 2)]) == "Minimum of 3 items required"
    assert (await discounts.validate_coupon("MINQTY", items=[_line(tee, 3)]))[1] == 300.0


@pytest.mark.usefixtures("db")
async def test_legacy_coupon_minimum_amount_still_applies():
    tee = await _product()
    await Coupon.get_pymongo_collection().insert_one(
        {"code": "OLD", "discountType": "percentage", "discountValue": 10, "status": "active", "minOrderAmount": 5000}
    )
    assert "Minimum order amount" in await _reason("OLD", [_line(tee)])


# ───────────────────────────────────────── schedule


@pytest.mark.usefixtures("db")
async def test_schedule_start_and_end():
    tee = await _product()
    now = datetime.utcnow()
    await _coupon(code="SOON", startsAt=now + timedelta(hours=2))
    await _coupon(code="DONE", startsAt=now - timedelta(days=2), expiryDate=now - timedelta(minutes=1))
    await _coupon(code="LIVE", startsAt=now - timedelta(minutes=1), expiryDate=None)

    assert await _reason("SOON", [_line(tee)]) == "This discount isn't active yet"
    assert await _reason("DONE", [_line(tee)]) == "Discount expired"
    assert (await discounts.validate_coupon("LIVE", items=[_line(tee)]))[1] == 100.0


# ───────────────────────────────────────── customers


@pytest.mark.usefixtures("db")
async def test_specific_customers_match_account_or_guest_phone_and_email():
    tee = await _product()
    vip = User(name="Vip", email="vip@example.com", phone="9876543210")
    await vip.insert()
    await _coupon(code="VIP", eligibility="customers", customerIds=[str(vip.id)])

    assert (await discounts.validate_coupon("VIP", items=[_line(tee)], shopper=Shopper.of(vip)))[1] == 100.0
    guest_phone = Shopper.of(phone="+91 98765 43210")
    assert (await discounts.validate_coupon("VIP", items=[_line(tee)], shopper=guest_phone))[1] == 100.0
    guest_email = Shopper.of(email="VIP@example.com")
    assert (await discounts.validate_coupon("VIP", items=[_line(tee)], shopper=guest_email))[1] == 100.0

    assert "Sign in" in await _reason("VIP", [_line(tee)])
    other = Shopper.of(phone="9000000000")
    assert await _reason("VIP", [_line(tee)], shopper=other) == "This discount isn't available for your account"


@pytest.mark.usefixtures("db")
async def test_once_per_customer_counts_paid_orders_by_phone_or_email():
    tee = await _product()
    await _coupon(code="ONE", oncePerCustomer=True)
    await Order(
        items=[OrderItem(productName="Tee", quantity=1, price=1000)],
        couponCode="ONE",
        paymentStatus="paid",
        shippingAddress={"phone": "9876543210", "email": "a@example.com"},
    ).insert()
    # An abandoned attempt doesn't count as a use.
    await Order(couponCode="ONE", paymentStatus="pending", shippingAddress={"phone": "9111111111"}).insert()

    assert await _reason("ONE", [_line(tee)], shopper=Shopper.of(phone="9876543210")) == "You've already used this discount"
    assert await _reason("ONE", [_line(tee)], shopper=Shopper.of(email="A@example.com")) == "You've already used this discount"
    assert (await discounts.validate_coupon("ONE", items=[_line(tee)], shopper=Shopper.of(phone="9111111111")))[1] == 100.0
    assert "Sign in" in await _reason("ONE", [_line(tee)])


# ───────────────────────────────────────── Buy X get Y


@pytest.mark.usefixtures("db")
async def test_bxgy_needs_separate_buy_and_get_items():
    tee = await _product("Tee", 1000)
    await _coupon(code="B1G1", kind="bxgy", buyProductIds=[str(tee.id)], buyQuantity=1, getQuantity=1,
                  getValueType="free")

    # One tee used to come out free on its own.
    assert "qualifying items" in await _reason("B1G1", [_line(tee, 1)])
    assert (await discounts.validate_coupon("B1G1", items=[_line(tee, 2)]))[1] == 1000.0
    assert (await discounts.validate_coupon("B1G1", items=[_line(tee, 5)]))[1] == 2000.0


@pytest.mark.usefixtures("db")
async def test_bxgy_value_types_caps_and_amount_requirement():
    tee = await _product("Tee", 1000)
    sock = await _product("Socks", 200)
    await _coupon(code="HALF", kind="bxgy", buyProductIds=[str(tee.id)], getProductIds=[str(sock.id)],
                  buyQuantity=1, getQuantity=1, getValueType="percentage", getDiscountPercent=50)
    await _coupon(code="OFF", kind="bxgy", buyProductIds=[str(tee.id)], getProductIds=[str(sock.id)],
                  buyQuantity=1, getQuantity=1, getValueType="amount", getAmountOff=150, maxUsesPerOrder=2)
    await _coupon(code="SPEND", kind="bxgy", buyRequirement="amount", buyAmount=2000,
                  buyProductIds=[str(tee.id)], getProductIds=[str(sock.id)], getQuantity=1, getValueType="free")

    assert (await discounts.validate_coupon("HALF", items=[_line(tee), _line(sock)]))[1] == 100.0
    # 3 tees + 3 socks, capped at 2 uses, ₹150 off each sock.
    assert (await discounts.validate_coupon("OFF", items=[_line(tee, 3), _line(sock, 3)]))[1] == 300.0
    assert "qualifying items" in await _reason("SPEND", [_line(tee, 1), _line(sock)])
    assert (await discounts.validate_coupon("SPEND", items=[_line(tee, 2), _line(sock)]))[1] == 200.0


@pytest.mark.usefixtures("db")
async def test_bxgy_get_from_a_collection():
    socks = Category(name="Socks")
    await socks.insert()
    tee = await _product("Tee", 1000)
    sock = await _product("Socks", 300, [str(socks.id)])
    await _coupon(code="SOCK", kind="bxgy", buyProductIds=[str(tee.id)], getAppliesTo="collections",
                  getCollectionIds=[str(socks.id)], getValueType="free")
    assert (await discounts.validate_coupon("SOCK", items=[_line(tee), _line(sock)]))[1] == 300.0


# ───────────────────────────────────────── product page + Magic


@pytest.mark.usefixtures("db")
async def test_product_page_offers_skip_scheduled_and_private_codes():
    tees = Category(name="Tees")
    await tees.insert()
    tee = await _product("Tee", 1000, [str(tees.id)])
    await _coupon(code="PUBLIC", showOnProduct=True, kind="products", appliesTo="collections",
                  collectionIds=[str(tees.id)])
    await _coupon(code="LATER", showOnProduct=True, startsAt=datetime.utcnow() + timedelta(days=1))
    await _coupon(code="PRIVATE", showOnProduct=True, eligibility="customers", customerIds=["x"])

    assert [c.code for c in await discounts.product_offers(str(tee.id))] == ["PUBLIC"]


@pytest.mark.usefixtures("db")
async def test_magic_apply_promotion_uses_razorpay_contact_for_customer_rules():
    vip = User(name="Vip", phone="9876543210")
    await vip.insert()
    product = await _product("Tee", 1000)
    await _coupon(code="VIP", eligibility="customers", customerIds=[str(vip.id)])
    order = Order(
        items=[OrderItem(productId=product.id, productName="Tee", quantity=1, price=1000)],
        total=1000,
        paymentStatus="pending",
        transactionDetails={"checkout": "magic"},
    )
    await order.insert()

    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "VIP"})
    assert not ok and body["failure_code"] == "REQUIREMENT_NOT_MET"
    ok, body = await magic_checkout.apply_promotion(
        {"order_id": str(order.id), "code": "VIP", "contact": "+919876543210"}
    )
    assert ok and body["promotion"]["value"] == 10000


# ───────────────────────────────────────── admin


async def _admin() -> AsyncClient:
    role = Role(name="Owner", permissions=["*"])
    await role.insert()
    admin = AdminAccount(email="owner@example.com", name="Owner", roleId=str(role.id))
    await admin.insert()
    from app.main import create_app
    from app.security import create_access_token

    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
    return client


@pytest.mark.usefixtures("db")
async def test_admin_saves_new_rules_and_rejects_impossible_ones():
    async with await _admin() as client:
        ok = await client.post("/api/admin/coupons", json={
            "code": " vip 10 ", "kind": "order", "discountType": "percentage", "discountValue": 10,
            "eligibility": "all", "minRequirement": "quantity", "minQuantity": 2, "oncePerCustomer": True,
            "startsAt": "2026-11-05T00:00:00", "expiryDate": "2026-12-01T00:00:00", "tags": ["Diwali", "diwali", " VIP "],
        })
        assert ok.status_code == 201, ok.text
        saved = ok.json()
        assert saved["code"] == "VIP10"
        assert saved["tags"] == ["Diwali", "VIP"]
        assert saved["minQuantity"] == 2 and saved["oncePerCustomer"] is True

        dup = await client.post("/api/admin/coupons", json={"code": "VIP10"})
        assert dup.status_code == 400 and "already exists" in dup.json()["detail"]
        bad_pct = await client.post("/api/admin/coupons", json={"code": "X1", "discountValue": 150})
        assert bad_pct.status_code == 400
        backwards = await client.post("/api/admin/coupons", json={
            "code": "X2", "startsAt": "2026-12-01T00:00:00", "expiryDate": "2026-11-01T00:00:00"})
        assert backwards.status_code == 400 and "after the start" in backwards.json()["detail"]

        updated = await client.put(f"/api/admin/coupons/{saved['_id']}", json={"usedCount": 99, "minQuantity": 5})
        assert updated.status_code == 200
        assert updated.json()["minQuantity"] == 5 and updated.json()["usedCount"] == 0


@pytest.mark.usefixtures("db")
async def test_admin_customer_search_and_resolve():
    a = User(name="Asha Menon", email="asha@example.com", phone="9876543210")
    b = User(name="Ravi", email="ravi@example.com", phone="9000000000")
    await a.insert()
    await b.insert()
    async with await _admin() as client:
        found = (await client.get("/api/admin/coupons/customers", params={"q": "asha"})).json()
        by_phone = (await client.get("/api/admin/coupons/customers", params={"q": "90000"})).json()
        resolved = (await client.get("/api/admin/coupons/customers", params={"ids": f"{a.id},{b.id}"})).json()
    assert [c["name"] for c in found] == ["Asha Menon"]
    assert [c["name"] for c in by_phone] == ["Ravi"]
    assert {c["_id"] for c in resolved} == {str(a.id), str(b.id)}


def test_dates_are_stored_as_plain_utc():
    c = Coupon(code="TZ", startsAt="2026-11-04T18:30:00.000Z", expiryDate="2026-11-05T09:00:00+05:30")
    assert c.startsAt == datetime(2026, 11, 4, 18, 30)
    assert c.expiryDate == datetime(2026, 11, 5, 3, 30)
    assert Coupon(code="D", expiryDate="2026-12-01").expiryDate == datetime(2026, 12, 1)
    assert Coupon(code="N", startsAt="").startsAt is None
