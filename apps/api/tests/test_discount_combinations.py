"""Automatic discounts, combinations and free shipping — standard and Magic Checkout."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.documents import AdminAccount, Coupon, Order, Pricing, Product, Role, Setting, User
from app.services import couriers, discounts, erp_ops, magic_checkout
from app.services.discounts import Shopper


@pytest.fixture
def deliverable(monkeypatch):
    async def fake(pin):
        return {"pincode": pin, "deliverable": True}

    monkeypatch.setattr(couriers, "deliverability", fake)


@pytest.fixture
def no_stock(monkeypatch):
    from app.routers import orders

    async def noop(*a, **k):
        return None

    monkeypatch.setattr(orders, "reserve_order_stock", noop)


async def _rates(fee=60):
    await Setting(
        key="shipping_settings",
        value={"profiles": [{"id": "d", "zones": [{"name": "India", "countries": ["India"], "rate": fee}]}]},
    ).insert()


async def _product(name="Tee", price=1000):
    p = Product(productName=name, totalStock=20, pricing=Pricing(sellingPrice=price))
    await p.insert()
    return p


def _line(p, qty=1):
    return {"productId": str(p.id), "price": float(p.pricing.sellingPrice), "quantity": qty}


async def _auto(name, **fields):
    c = Coupon(code=f"AUTO-{name.upper()}", name=name, method="automatic", **fields)
    await c.insert()
    return c


async def _code(code, **fields):
    c = Coupon(code=code, name=code, **{"discountType": "percentage", "discountValue": 10, **fields})
    await c.insert()
    return c


# ───────────────────────────────────────── resolver


@pytest.mark.usefixtures("db")
async def test_automatic_discount_applies_without_a_code():
    tee = await _product()
    await _auto("Diwali 10", kind="order", discountValue=10)
    res = await discounts.resolve([_line(tee, 2)])
    assert res.goods == 200.0
    assert [d["title"] for d in [a.as_dict() for a in res.applied]] == ["Diwali 10"]
    assert res.code_applied is None


@pytest.mark.usefixtures("db")
async def test_combinable_discounts_stack_product_then_order():
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20,
                combinesWithOrder=True)
    await _code("EXTRA10", kind="order", discountValue=10, combinesWithProduct=True)

    res = await discounts.resolve([_line(tee)], code="EXTRA10")
    # 20% off ₹1,000 = 200, then 10% off the remaining ₹800 = 80.
    assert res.goods == 280.0
    assert {a.coupon.code for a in res.applied} == {"AUTO-TEE 20", "EXTRA10"}


@pytest.mark.usefixtures("db")
async def test_both_sides_must_allow_the_combination():
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20,
                combinesWithOrder=True)
    await _code("SMALL5", kind="order", discountValue=5)  # doesn't allow product discounts
    await _code("BIG50", kind="order", discountValue=50)

    small = await discounts.resolve([_line(tee)], code="SMALL5")
    assert small.goods == 200.0 and small.code_error == "Your cart already has a better discount"
    big = await discounts.resolve([_line(tee)], code="BIG50")
    # The code saves more on its own, so it replaces the automatic discount.
    assert big.goods == 500.0 and big.code_error is None
    assert [a.coupon.code for a in big.applied] == ["BIG50"]


@pytest.mark.usefixtures("db")
async def test_automatic_free_shipping_respects_max_rate_and_minimum():
    tee = await _product()
    await _auto("Free over 999", kind="shipping", minRequirement="amount", minOrderAmount=999,
                maxShippingRate=100)
    assert (await discounts.resolve([_line(tee)], shipping_fee=60)).shipping == 60.0
    assert (await discounts.resolve([_line(tee)], shipping_fee=150)).shipping == 0.0
    cheap = await _product("Socks", 300)
    assert (await discounts.resolve([_line(cheap)], shipping_fee=60)).shipping == 0.0


@pytest.mark.usefixtures("db")
async def test_automatic_discounts_are_not_codes():
    tee = await _product()
    await _auto("Secret", kind="order", discountValue=50)
    res = await discounts.resolve([_line(tee)], code="AUTO-SECRET")
    assert res.code_error == "Invalid discount code"


# ───────────────────────────────────────── standard checkout


async def _place(body, user=None):
    from app.routers import orders

    user = user or User(name="Buyer", email="buyer@example.com", phone="9876543210")
    if user.id is None:
        await user.insert()
    request = Request({"type": "http", "method": "POST", "path": "/api/orders", "headers": [], "client": None})
    created = await orders.create_order(body, user, request, None)
    return await Order.find_one(Order.orderUrlId == created["orderUrlId"])


def _address(pin="560060"):
    return {"name": "Anu", "phone": "9876543210", "email": "buyer@example.com", "address": "12 MG Road",
            "city": "Bengaluru", "state": "Karnataka", "pincode": pin, "country": "India"}


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_standard_checkout_prices_automatic_code_and_free_shipping():
    await _rates(60)
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20,
                combinesWithOrder=True, combinesWithShipping=True)
    await _auto("Ship free", kind="shipping", combinesWithProduct=True, combinesWithOrder=True)
    await _code("EXTRA10", kind="order", discountValue=10, combinesWithProduct=True, combinesWithShipping=True)

    order = await _place({"orderItems": [{"product": str(tee.id), "qty": 2}], "shippingAddress": _address(),
                          "couponCode": "EXTRA10"})
    # ₹2,000 − 400 (20%) − 160 (10% of 1,600) + ₹0 delivery (60 free).
    assert order.discountAmount == 560.0
    assert order.deliveryAmount == 0.0
    assert order.finalPrice == 1440.0
    assert order.couponCode == "EXTRA10"
    details = order.transactionDetails
    assert details["shippingDiscount"] == 60.0 and details["deliveryFee"] == 60.0
    assert {d["title"] for d in details["discounts"]} == {"Tee 20", "Ship free", "EXTRA10"}
    assert (await Coupon.find_one(Coupon.code == "EXTRA10")).usedCount == 1  # reserved


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_standard_checkout_refuses_a_code_that_loses():
    from fastapi import HTTPException

    await _rates(60)
    tee = await _product()
    await _auto("Big", kind="order", discountValue=30)
    await _code("TINY", kind="order", discountValue=5)
    with pytest.raises(HTTPException) as err:
        await _place({"orderItems": [{"product": str(tee.id)}], "shippingAddress": _address(), "couponCode": "TINY"})
    assert err.value.detail == "Your cart already has a better discount"


# ───────────────────────────────────────── Magic Checkout


async def _magic_place(tee, qty=1):
    from app.services.store_settings import save_payment_methods

    await save_payment_methods({"razorpayMagic": True})
    return await _place({"orderItems": [{"product": str(tee.id), "qty": qty}], "checkoutMode": "magic"})


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_magic_prices_automatic_discounts_into_line_items():
    tee = await _product("Tee", 999)
    await _auto("Third off", kind="order", discountValue=33.333)
    order = await _magic_place(tee, qty=3)

    payload = await magic_checkout.order_payload(order, user_id="u")
    [item] = payload["line_items"]
    assert item["price"] == 99900
    assert item["offer_price"] * 3 == payload["line_items_total"] == payload["amount"]
    # The order records exactly what Razorpay will charge.
    assert order.finalPrice * 100 == pytest.approx(payload["amount"])
    assert order.discountAmount == pytest.approx(2997 - payload["amount"] / 100)


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_magic_shipping_info_gives_automatic_free_shipping_and_remembers_it():
    await _rates(60)
    tee = await _product()
    await _auto("Ship free", kind="shipping")
    order = await _magic_place(tee)

    res = await magic_checkout.shipping_info(
        {"order_id": str(order.id), "contact": "+919876543210", "addresses": [{"id": "1", "zipcode": "560060", "country": "IN"}]}
    )
    assert res["addresses"][0]["shipping_methods"][0]["shipping_fee"] == 0
    quotes = (await Order.get(order.id)).transactionDetails["magicShippingQuotes"]
    assert quotes["560060"]["fee"] == 60 and quotes["560060"]["discount"] == 60


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_magic_code_value_is_the_extra_saving_on_top_of_automatic():
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20, combinesWithOrder=True)
    await _code("EXTRA10", kind="order", discountValue=10, combinesWithProduct=True)
    await _code("BIG50", kind="order", discountValue=50)
    await _code("SMALL5", kind="order", discountValue=5)
    order = await _magic_place(tee)
    assert order.discountAmount == 200.0

    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "EXTRA10"})
    assert ok and body["promotion"]["value"] == 8000  # 10% of the ₹800 left
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "BIG50"})
    assert ok and body["promotion"]["value"] == 30000  # replaces the ₹200 automatic: 500 − 200
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "SMALL5"})
    assert not ok and body["failure_code"] == "REQUIREMENT_NOT_MET"


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_magic_free_shipping_code_uses_the_quoted_fee():
    await _rates(60)
    tee = await _product()
    await _code("SHIPFREE", kind="shipping")
    order = await _magic_place(tee)

    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "SHIPFREE"})
    assert not ok and "delivery address" in body["failure_reason"]
    await magic_checkout.shipping_info(
        {"order_id": str(order.id), "addresses": [{"id": "1", "zipcode": "560060", "country": "IN"}]}
    )
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "SHIPFREE"})
    assert ok and body["promotion"]["value"] == 6000


def _rz(promotions=(), zipcode="560060"):
    return {
        "id": "order_RZ1",
        "customer_details": {
            "email": "buyer@example.com",
            "contact": "+919876543210",
            "shipping_address": {"name": "Anu Thomas", "line1": "12 MG Road", "city": "Bengaluru",
                                 "state": "Karnataka", "zipcode": zipcode, "country": "in"},
        },
        "promotions": [{"code": c} for c in promotions],
    }


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_magic_payment_check_and_final_order_fields():
    await _rates(60)
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20,
                combinesWithOrder=True, combinesWithShipping=True)
    await _auto("Ship free", kind="shipping", combinesWithProduct=True, combinesWithOrder=True)
    await _code("EXTRA10", kind="order", discountValue=10, combinesWithProduct=True, combinesWithShipping=True)
    order = await _magic_place(tee, qty=2)
    await magic_checkout.shipping_info(
        {"order_id": str(order.id), "addresses": [{"id": "1", "zipcode": "560060", "country": "IN"}]}
    )
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "EXTRA10"})
    assert ok and body["promotion"]["value"] == 16000
    order = await Order.get(order.id)

    # Razorpay charges: ₹1,600 line items + ₹0 delivery − ₹160 code = ₹1,440.
    with pytest.raises(magic_checkout.MagicAmountMismatch):
        await magic_checkout.prepare_paid_order(order, _rz(["EXTRA10"]), 143000)
    await magic_checkout.prepare_paid_order(order, _rz(["EXTRA10"]), 144000)
    saved = await Order.get(order.id)
    assert saved.discountAmount == 560.0
    assert saved.deliveryAmount == 0.0
    assert saved.couponCode == "EXTRA10"
    assert saved.transactionDetails["shippingDiscount"] == 60.0
    assert {d["title"] for d in saved.transactionDetails["discounts"]} == {"Tee 20", "Ship free", "EXTRA10"}


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_magic_payment_without_code_keeps_automatic_prices():
    await _rates(60)
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20)
    order = await _magic_place(tee)
    await magic_checkout.prepare_paid_order(order, _rz(), 86000)  # ₹800 + ₹60 delivery
    saved = await Order.get(order.id)
    assert saved.discountAmount == 200.0 and saved.deliveryAmount == 60.0 and saved.couponCode is None


# ───────────────────────────────────────── usage, invoices, admin


@pytest.mark.usefixtures("db", "deliverable", "no_stock")
async def test_automatic_usage_is_counted_once_on_commit():
    from app.services import stock

    tee = await _product()
    auto = await _auto("Diwali", kind="order", discountValue=10)
    order = await _place({"orderItems": [{"product": str(tee.id)}], "shippingAddress": _address()})
    order.paymentStatus = "paid"
    await order.save()

    async def no_sale(**kw):
        return None

    stock_apply = stock.apply_sale
    try:
        stock.apply_sale = no_sale
        await stock.apply_order_commitments(order)
        await stock.apply_order_commitments(await Order.get(order.id))
    finally:
        stock.apply_sale = stock_apply
    assert (await Coupon.get(auto.id)).usedCount == 1


@pytest.mark.usefixtures("db")
async def test_invoice_uses_each_lines_own_discount():
    from app.documents import OrderItem

    order = Order(
        items=[OrderItem(productName="Tee", quantity=1, price=1000), OrderItem(productName="Cap", quantity=1, price=1000)],
        discountAmount=200,
        transactionDetails={"lineDiscounts": [200.0, 0.0]},
    )
    assert erp_ops.allocate_order_discount(order) == [200.0, 0.0]
    order.transactionDetails = {}
    assert erp_ops.allocate_order_discount(order) == [100.0, 100.0]


async def _admin():
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
async def test_admin_automatic_discount_gets_an_internal_code_and_needs_a_title():
    async with await _admin() as client:
        untitled = await client.post("/api/admin/coupons", json={"method": "automatic", "kind": "order", "discountValue": 10})
        assert untitled.status_code == 400 and "title" in untitled.json()["detail"]
        made = await client.post("/api/admin/coupons", json={
            "method": "automatic", "name": "Diwali 10", "kind": "shipping", "maxShippingRate": "100",
            "combinesWithProduct": True,
        })
        assert made.status_code == 201, made.text
        assert made.json()["code"].startswith("AUTO-")
        assert made.json()["maxShippingRate"] == 100.0
        again = await client.put(f"/api/admin/coupons/{made.json()['_id']}", json={"method": "automatic", "name": "Diwali"})
        assert again.json()["code"] == made.json()["code"]


@pytest.mark.usefixtures("db")
async def test_preview_shows_automatic_discounts_for_the_cart():
    await _rates(60)
    tee = await _product()
    await _auto("Tee 20", kind="products", productIds=[str(tee.id)], discountValue=20, combinesWithShipping=True)
    await _auto("Ship free", kind="shipping", combinesWithProduct=True)
    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        res = (await c.post("/api/coupons/preview", json={"items": [{"product": str(tee.id), "qty": 1}], "pincode": "560060"})).json()
    assert res["goodsDiscount"] == 200.0
    assert res["shippingDiscount"] == 60.0
    assert res["total"] == 800.0
    assert [d["title"] for d in res["discounts"]] == ["Tee 20", "Ship free"]
    assert all(d["code"] is None for d in res["discounts"])


@pytest.mark.usefixtures("db")
async def test_product_page_lists_featured_automatic_discounts_without_their_id():
    from app.documents import Category
    from app.main import create_app

    tees = Category(name="Tees")
    await tees.insert()
    tee = Product(productName="Tee", totalStock=5, pricing=Pricing(sellingPrice=1000), collections=[str(tees.id)])
    await tee.insert()
    await _auto("Tee week 20%", kind="products", appliesTo="collections", collectionIds=[str(tees.id)],
                discountValue=20, showOnProduct=True)
    await _auto("Hidden auto", kind="order", discountValue=5)  # not featured
    await _code("SAVE10", showOnProduct=True)

    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        offers = (await c.get(f"/api/coupons/product/{tee.id}")).json()
    by_title = {o["title"] or o["code"]: o for o in offers}
    assert set(by_title) == {"Tee week 20%", "SAVE10"}
    auto = by_title["Tee week 20%"]
    assert auto["automatic"] is True and auto["code"] is None
    assert "AUTO-" not in str(offers)
    # Magic Checkout's list of codes to type still has only real codes.
    assert [c.code for c in await discounts.shown_coupons()] == ["SAVE10"]
