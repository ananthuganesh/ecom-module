"""Razorpay Magic Checkout: quoting endpoints, order payload, and the paid-order check."""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app.documents import Coupon, Order, OrderItem, PaymentTransaction, Setting, User
from app.routers import payments
from app.services import couriers, magic_checkout

KEY_SECRET = "rzp_test_secret"


@pytest.fixture
def deliverable(monkeypatch):
    """Every pincode deliverable unless a test says otherwise."""
    answers: dict[str, bool | None] = {}

    async def fake(pin):
        return {"pincode": pin, "deliverable": answers.get(pin, True)}

    monkeypatch.setattr(couriers, "deliverability", fake)
    return answers


async def _shipping_rates(local=0, rest=49, local_pins=("682001",)):
    await Setting(
        key="shipping_settings",
        value={
            "profiles": [
                {
                    "id": "default",
                    "zones": [
                        {"name": "Kochi", "countries": ["India"], "rate": local, "pincodes": list(local_pins)},
                        {"name": "Rest of India", "countries": ["India"], "rate": rest},
                    ],
                }
            ]
        },
    ).insert()


async def _magic_order(**overrides) -> Order:
    defaults = dict(
        status="order placed",
        paymentStatus="pending",
        total=2198.0,
        finalPrice=2198.0,
        deliveryAmount=0,
        items=[
            OrderItem(productId="p1", productName="Escape to Become", size="M", quantity=1, price=999),
            OrderItem(productId="p2", productName="Indian Elephant", size="XXXL", quantity=1, price=1199),
        ],
        shippingAddress={"email": "buyer@example.com"},
        transactionDetails={"checkout": "magic", "paymentStatus": "pending"},
    )
    order = Order(**{**defaults, **overrides})
    await order.insert()
    return order


async def _coupon(**overrides) -> Coupon:
    defaults = dict(code="SAVE10", name="10% off", discountType="percentage", discountValue=10)
    coupon = Coupon(**{**defaults, **overrides})
    await coupon.insert()
    return coupon


# ---------------------------------------------------------------- setting


@pytest.mark.usefixtures("db")
async def test_magic_is_off_until_switched_on():
    assert await magic_checkout.is_enabled() is False
    from app.services.store_settings import save_payment_methods

    await save_payment_methods({"razorpayMagic": True})
    assert await magic_checkout.is_enabled() is True
    # Turning online payments off turns Magic off with it.
    await save_payment_methods({"razorpay": False})
    assert await magic_checkout.is_enabled() is False


# ---------------------------------------------------------------- order payload


@pytest.mark.usefixtures("db")
async def test_order_payload_has_line_items_in_paise():
    order = await _magic_order()
    payload = await magic_checkout.order_payload(order, user_id="u1")

    assert payload["amount"] == 219800
    # Without line_items_total Razorpay silently falls back to Standard Checkout.
    assert payload["line_items_total"] == 219800
    assert payload["receipt"] == str(order.id)
    assert payload["notes"]["checkout"] == "magic"
    first = payload["line_items"][0]
    assert first["price"] == first["offer_price"] == 99900
    assert first["quantity"] == 1
    assert first["variant_id"] == "p1:M"
    assert first["name"] == "Escape to Become"
    assert first["product_url"].endswith("/product/p1")


# ---------------------------------------------------------------- shipping info


@pytest.mark.usefixtures("db")
async def test_shipping_info_quotes_our_rates_per_address(deliverable):
    await _shipping_rates(local=0, rest=49)
    body = {
        "order_id": "x",
        "addresses": [
            {"id": "0", "zipcode": "682001", "state_code": "KL", "country": "IN"},
            {"id": "1", "zipcode": "560060", "state_code": "KA", "country": "IN"},
        ],
    }
    out = await magic_checkout.shipping_info(body)
    kochi, bengaluru = out["addresses"]

    assert kochi["id"] == "0" and kochi["zipcode"] == "682001"
    assert kochi["shipping_methods"][0]["serviceable"] is True
    assert kochi["shipping_methods"][0]["shipping_fee"] == 0
    assert bengaluru["shipping_methods"][0]["shipping_fee"] == 4900
    for addr in out["addresses"]:
        method = addr["shipping_methods"][0]
        # Prepaid only.
        assert method["cod"] is False and method["cod_fee"] == 0


@pytest.mark.usefixtures("db")
async def test_shipping_info_refuses_undeliverable_and_bad_pincodes(deliverable):
    deliverable["110001"] = False
    out = await magic_checkout.shipping_info(
        {"addresses": [{"id": "0", "zipcode": "110001", "country": "IN"}, {"id": "1", "zipcode": "12", "country": "IN"}]}
    )
    for addr in out["addresses"]:
        assert addr["shipping_methods"][0]["serviceable"] is False
        assert addr["shipping_methods"][0]["shipping_fee"] == 0


@pytest.mark.usefixtures("db")
async def test_carrier_outage_does_not_block_delivery(monkeypatch):
    async def down(pin):
        raise RuntimeError("Delhivery timeout")

    monkeypatch.setattr(couriers, "deliverability", down)
    serviceable, _ = await magic_checkout.shipping_quote("682001")
    assert serviceable is True


# ---------------------------------------------------------------- promotions


@pytest.mark.usefixtures("db")
async def test_promotions_list_is_empty_so_private_codes_stay_private():
    await _coupon()
    assert await magic_checkout.get_promotions({"order_id": "x"}) == {"promotions": []}


@pytest.mark.usefixtures("db")
async def test_apply_promotion_uses_our_coupon_rules_and_remembers_the_quote():
    await _coupon()
    order = await _magic_order()
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "save10"})

    assert ok is True
    promo = body["promotion"]
    assert promo["code"] == "SAVE10" and promo["reference_id"] == "SAVE10"
    assert promo["value"] == 21980  # 10% of ₹2,198, in paise
    assert promo["value_type"] == "fixed_amount"
    stored = (await Order.get(order.id)).transactionDetails["magicPromotion"]
    assert stored == {"code": "SAVE10", "discount": 219.8}


@pytest.mark.usefixtures("db")
async def test_apply_promotion_failures():
    await _coupon(code="BIG", minOrderAmount=5000)
    await _coupon(code="OLD", expiryDate=datetime.utcnow() - timedelta(days=1))
    order = await _magic_order()

    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "NOPE"})
    assert not ok and body["failure_code"] == "INVALID_PROMOTION"
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "BIG"})
    assert not ok and body["failure_code"] == "REQUIREMENT_NOT_MET"
    ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "OLD"})
    assert not ok and body["failure_code"] == "INVALID_PROMOTION"


@pytest.mark.usefixtures("db")
async def test_apply_promotion_only_for_pending_magic_orders():
    await _coupon()
    standard = await _magic_order(transactionDetails={})
    paid = await _magic_order(paymentStatus="paid")
    for order in (standard, paid):
        ok, body = await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "SAVE10"})
        assert not ok and body["failure_code"] == "INVALID_PROMOTION"
    ok, _ = await magic_checkout.apply_promotion({"order_id": "not-an-id", "code": "SAVE10"})
    assert not ok


# ---------------------------------------------------------------- endpoints


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_endpoints_accept_get_and_post(deliverable, method):
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        res = await c.request(
            method,
            "/api/payments/magic/shipping-info",
            json={"addresses": [{"id": "0", "zipcode": "560060", "country": "IN"}]},
        )
        assert res.status_code == 200
        assert res.json()["addresses"][0]["shipping_methods"][0]["serviceable"] is True

        res = await c.request(method, "/api/payments/magic/apply-promotion", json={"order_id": "x", "code": "NOPE"})
        assert res.status_code == 400
        assert res.json()["failure_code"] == "INVALID_PROMOTION"

        res = await c.request(method, "/api/payments/magic/promotions", json={"order_id": "x"})
        assert res.json() == {"promotions": []}


# ---------------------------------------------------------------- after payment


def _rz_order(zipcode="560060", promotions=(), **extra):
    return {
        "id": "order_RZ1",
        "customer_details": {
            "email": "Buyer@Example.com",
            "contact": "+919876543210",
            "shipping_address": {
                "name": "Anu Thomas",
                "line1": "12 MG Road",
                "line2": "Near Metro",
                "city": "Bengaluru",
                "state": "Karnataka",
                "zipcode": zipcode,
                "country": "in",
                "contact": "+919876543210",
            },
        },
        "promotions": [{"code": c} for c in promotions],
        **extra,
    }


@pytest.mark.usefixtures("db")
async def test_prepare_copies_address_fee_and_coupon(deliverable):
    await _shipping_rates(rest=49)
    await _coupon()
    order = await _magic_order()
    await magic_checkout.apply_promotion({"order_id": str(order.id), "code": "SAVE10"})
    order = await Order.get(order.id)

    # 2198 + 49 delivery - 219.80 coupon
    await magic_checkout.prepare_paid_order(order, _rz_order(promotions=["SAVE10"]), 202720)
    saved = await Order.get(order.id)

    assert saved.shippingAddress["name"] == "Anu Thomas"
    assert saved.shippingAddress["firstName"] == "Anu" and saved.shippingAddress["lastName"] == "Thomas"
    assert saved.shippingAddress["phone"] == "9876543210"
    assert saved.shippingAddress["email"] == "buyer@example.com"
    assert saved.shippingAddress["address"] == "12 MG Road"
    assert saved.shippingAddress["pincode"] == saved.shippingAddress["postalCode"] == "560060"
    assert saved.deliveryAmount == 49
    assert saved.couponCode == "SAVE10"
    assert saved.discountAmount == 219.8
    assert saved.finalPrice == 2027.2


@pytest.mark.usefixtures("db")
async def test_prepare_refuses_an_underpayment(deliverable):
    await _shipping_rates(rest=49)
    order = await _magic_order()
    # Paid the item total only, without the ₹49 delivery we quote for this pincode.
    with pytest.raises(magic_checkout.MagicAmountMismatch):
        await magic_checkout.prepare_paid_order(order, _rz_order(), 219800)


@pytest.mark.usefixtures("db")
async def test_prepare_ignores_a_coupon_we_never_honoured(deliverable):
    await _shipping_rates(rest=0)
    order = await _magic_order()
    # Razorpay reports a code that isn't one of ours: no discount, so ₹2,198 is due.
    with pytest.raises(magic_checkout.MagicAmountMismatch):
        await magic_checkout.prepare_paid_order(order, _rz_order(promotions=["FAKE90"]), 21980)


@pytest.mark.usefixtures("db")
async def test_prepare_refuses_an_undeliverable_address(deliverable):
    deliverable["110001"] = False
    order = await _magic_order()
    with pytest.raises(magic_checkout.MagicAmountMismatch):
        await magic_checkout.prepare_paid_order(order, _rz_order(zipcode="110001"), 219800)


# ---------------------------------------------------------------- verify flow


class _FakeRazorpay:
    def __init__(self, *, rz_order, payment):
        rz = self

        class _Orders:
            def fetch(self, _id):
                return rz.rz_order

        class _Payments:
            def fetch(self, _id):
                return rz.payment

        self.rz_order = rz_order
        self.payment = payment
        self.order = _Orders()
        self.payment_api = _Payments()

    def client(self, auth=None):
        fake = self

        class _Client:
            order = fake.order
            payment = fake.payment_api

        return _Client()


@pytest.fixture
def verify_env(monkeypatch, deliverable):
    """Fake Razorpay plus no-op side effects after finalisation."""
    import razorpay

    async def creds():
        return "rzp_test_key", KEY_SECRET

    monkeypatch.setattr(payments, "_get_razorpay_creds", creds)
    finalized: list[str] = []
    refunds: list[str] = []

    async def fake_finalize(order, *, rz_payment_id, payment, user=None):
        finalized.append(rz_payment_id)

    async def fake_refund(payment_id, *, reason):
        refunds.append(reason)
        return {"ok": True, "amount_refunded": 1}

    monkeypatch.setattr(payments, "_finalize_paid_order", fake_finalize)
    monkeypatch.setattr(payments, "_auto_refund_razorpay_payment", fake_refund)

    def install(rz_order, payment):
        fake = _FakeRazorpay(rz_order=rz_order, payment=payment)
        monkeypatch.setattr(razorpay, "Client", fake.client)

    return install, finalized, refunds


async def _verify(order: Order, user: User, amount_paise: int):
    await PaymentTransaction(
        orderId=order.id, userId=user.id, razorpayOrderId="order_RZ1", amountInPaise=219800, status="created"
    ).insert()
    signature = hmac.new(KEY_SECRET.encode(), b"order_RZ1|pay_1", hashlib.sha256).hexdigest()
    body = {
        "razorpay_order_id": "order_RZ1",
        "razorpay_payment_id": "pay_1",
        "razorpay_signature": signature,
        "localOrderId": str(order.id),
    }
    return await payments.verify_payment(body, user, None)


@pytest.mark.usefixtures("db")
async def test_verify_accepts_the_amount_including_delivery(verify_env):
    install, finalized, refunds = verify_env
    await _shipping_rates(rest=49)
    user = User(name="Buyer", email="buyer@example.com")
    await user.insert()
    order = await _magic_order(customerId=user.id)
    install(_rz_order(), {"id": "pay_1", "status": "captured", "amount": 224700, "order_id": "order_RZ1"})

    result = await _verify(order, user, 224700)

    assert result["success"] is True
    assert finalized == ["pay_1"] and refunds == []
    txn = await PaymentTransaction.find_one(PaymentTransaction.razorpayOrderId == "order_RZ1")
    assert txn.amountInPaise == 224700 and txn.status == "paid"
    assert (await Order.get(order.id)).finalPrice == 2247.0


@pytest.mark.usefixtures("db")
async def test_verify_refunds_an_underpaid_magic_order(verify_env):
    install, finalized, refunds = verify_env
    await _shipping_rates(rest=49)
    user = User(name="Buyer", email="buyer@example.com")
    await user.insert()
    order = await _magic_order(customerId=user.id)
    install(_rz_order(), {"id": "pay_1", "status": "captured", "amount": 219800, "order_id": "order_RZ1"})

    with pytest.raises(HTTPException) as exc:
        await _verify(order, user, 219800)

    assert exc.value.status_code == 400
    assert finalized == [] and refunds == ["magic_amount_mismatch"]
    saved = await Order.get(order.id)
    assert saved.paymentStatus == "refunded"
    assert "expected" in saved.transactionDetails["magicMismatch"]


@pytest.mark.usefixtures("db")
async def test_standard_orders_still_require_the_exact_amount(verify_env):
    install, finalized, _ = verify_env
    user = User(name="Buyer", email="buyer@example.com")
    await user.insert()
    order = await _magic_order(customerId=user.id, transactionDetails={})
    install(_rz_order(), {"id": "pay_1", "status": "captured", "amount": 224700, "order_id": "order_RZ1"})

    with pytest.raises(HTTPException) as exc:
        await _verify(order, user, 224700)
    assert exc.value.detail == "Payment amount does not match order"
    assert finalized == []


# ---------------------------------------------------------------- order creation


async def _create(monkeypatch, body):
    from starlette.requests import Request

    from app.documents import Pricing, Product
    from app.routers import orders

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(orders, "reserve_order_stock", noop)
    product = Product(productName="Escape to Become", totalStock=5, pricing=Pricing(sellingPrice=999))
    await product.insert()
    user = User(name="Buyer", email="Buyer@Example.com")
    await user.insert()
    request = Request({"type": "http", "method": "POST", "path": "/api/orders", "headers": [], "client": None})
    body = {"orderItems": [{"product": str(product.id), "qty": 2}], **body}
    return await orders.create_order(body, user, request, None)


@pytest.mark.usefixtures("db")
async def test_magic_order_needs_no_address(monkeypatch):
    from app.services.store_settings import save_payment_methods

    await save_payment_methods({"razorpayMagic": True})
    created = await _create(monkeypatch, {"checkoutMode": "magic", "couponCode": "IGNORED", "isGift": True})
    order = await Order.find_one(Order.orderUrlId == created["orderUrlId"])

    assert order.transactionDetails["checkout"] == "magic"
    assert order.shippingAddress == {"email": "buyer@example.com"}
    assert order.deliveryAmount == 0
    # Coupons and delivery are added in the popup; gift wrap isn't offered there.
    assert order.couponCode is None and order.giftFee == 0
    assert order.finalPrice == 1998
    assert order.paymentMethod == "razorpay"


@pytest.mark.usefixtures("db")
async def test_magic_order_refused_while_switched_off(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        await _create(monkeypatch, {"checkoutMode": "magic"})
    assert exc.value.status_code == 400


# ---------------------------------------------------------------- webhook


async def _webhook(amount_paise: int):
    import json

    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    payload = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_1", "order_id": "order_RZ1", "amount": amount_paise}}},
    }
    body = json.dumps(payload).encode()
    signature = hmac.new(b"whsec_test_secret", body, hashlib.sha256).hexdigest()
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        return await c.post(
            "/api/payments/webhook",
            content=body,
            headers={"x-razorpay-signature": signature, "content-type": "application/json"},
        )


@pytest.mark.usefixtures("db")
async def test_webhook_finalises_a_magic_order_when_the_tab_was_closed(verify_env, monkeypatch):
    """No browser verify call: the webhook alone must copy the address and accept the amount."""
    install, finalized, refunds = verify_env

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(payments, "apply_order_commitments", noop)
    await _shipping_rates(rest=49)
    order = await _magic_order()
    await PaymentTransaction(orderId=order.id, userId=order.id, razorpayOrderId="order_RZ1", amountInPaise=219800, status="created").insert()
    install(_rz_order(), {})

    res = await _webhook(224700)

    assert res.status_code == 200
    assert finalized == ["pay_1"] and refunds == []
    assert (await Order.get(order.id)).shippingAddress["city"] == "Bengaluru"


@pytest.mark.usefixtures("db")
async def test_webhook_refunds_a_mismatch_and_still_acknowledges(verify_env, monkeypatch):
    install, finalized, refunds = verify_env

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(payments, "apply_order_commitments", noop)
    await _shipping_rates(rest=49)
    order = await _magic_order()
    await PaymentTransaction(orderId=order.id, userId=order.id, razorpayOrderId="order_RZ1", amountInPaise=219800, status="created").insert()
    install(_rz_order(), {})

    first = await _webhook(219800)
    # Razorpay retries anything that isn't 2xx; a refused payment must not loop.
    assert first.status_code == 200
    assert finalized == [] and refunds == ["magic_amount_mismatch"]
    second = await _webhook(219800)
    assert second.status_code == 200
    assert refunds == ["magic_amount_mismatch"]


# ---------------------------------------------------------------- one-click: accounts


@pytest.mark.usefixtures("db")
async def test_link_customer_matches_the_verified_phone_first():
    by_email = User(name="Email Match", email="buyer@example.com")
    by_phone = User(name="Phone Match", email="other@example.com", phone="9876543210")
    await by_email.insert()
    await by_phone.insert()
    order = await _magic_order(shippingAddress={"phone": "9876543210", "email": "buyer@example.com"})

    user = await magic_checkout.link_customer(order)

    assert user.id == by_phone.id
    assert (await Order.get(order.id)).customerId == by_phone.id


@pytest.mark.usefixtures("db")
async def test_link_customer_prefers_the_phone_match_with_the_same_email():
    await User(name="Old", phone="+919876543210", email="old@example.com").insert()
    same = User(name="Same", phone="9876543210", email="buyer@example.com")
    await same.insert()
    order = await _magic_order(shippingAddress={"phone": "9876543210", "email": "buyer@example.com"})
    assert (await magic_checkout.link_customer(order)).id == same.id


@pytest.mark.usefixtures("db")
async def test_link_customer_falls_back_to_email_then_creates():
    existing = User(name="Email", email="buyer@example.com")
    await existing.insert()
    order = await _magic_order(shippingAddress={"phone": "9000000001", "email": "buyer@example.com"})
    assert (await magic_checkout.link_customer(order)).id == existing.id

    fresh = await _magic_order(
        shippingAddress={"name": "Anu Thomas", "firstName": "Anu", "lastName": "Thomas", "phone": "9000000002", "email": "new@example.com"}
    )
    created = await magic_checkout.link_customer(fresh)
    assert created.email == "new@example.com" and created.phone == "9000000002"
    assert created.name == "Anu Thomas" and created.customerUrlId
    assert created.password is None


@pytest.mark.usefixtures("db")
async def test_link_customer_leaves_signed_in_orders_alone():
    owner = User(name="Owner", email="owner@example.com")
    await owner.insert()
    order = await _magic_order(customerId=owner.id, shippingAddress={"phone": "9876543210"})
    assert await magic_checkout.link_customer(order) is None
    assert (await Order.get(order.id)).customerId == owner.id


# ---------------------------------------------------------------- one-click: start


@pytest.fixture
def start_env(monkeypatch):
    from app.routers import orders
    from app.routers import payments as payments_router
    from app.services.store_settings import save_payment_methods

    async def noop(*args, **kwargs):
        return None

    async def fake_open(order, *, user_id=None):
        return {"keyId": "rzp_test_key", "razorpayOrderId": f"order_{order.id}", "amount": 1998 * 100}

    monkeypatch.setattr(orders, "reserve_order_stock", noop)
    monkeypatch.setattr(payments_router, "open_razorpay_order", fake_open)
    return save_payment_methods


async def _product():
    from app.documents import Pricing, Product

    product = Product(productName="Escape to Become", totalStock=5, pricing=Pricing(sellingPrice=999))
    await product.insert()
    return product


async def _start(body):
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        return await c.post("/api/payments/magic/start", json=body)


@pytest.mark.usefixtures("db")
async def test_start_works_without_login_and_reuses_the_pending_order(start_env):
    await start_env({"razorpayMagic": True})
    product = await _product()
    body = {"orderItems": [{"product": str(product.id), "qty": 2}], "guestId": "guest_abc"}

    first = await _start(body)
    assert first.status_code == 200, first.text
    data = first.json()
    order = await Order.get(data["localOrderId"])
    assert order.customerId is None
    assert order.transactionDetails["checkout"] == "magic"
    assert order.transactionDetails["guestId"] == "guest_abc"
    assert data["prefill"] == {}

    again = await _start({**body, "localOrderId": data["localOrderId"]})
    assert again.json()["localOrderId"] == data["localOrderId"]
    # Another browser can't take over this pending order by naming it.
    other = await _start({**body, "guestId": "guest_other", "localOrderId": data["localOrderId"]})
    assert other.json()["localOrderId"] != data["localOrderId"]


@pytest.mark.usefixtures("db")
async def test_start_refused_while_switched_off(start_env):
    product = await _product()
    res = await _start({"orderItems": [{"product": str(product.id), "qty": 1}], "guestId": "g"})
    assert res.status_code == 400


@pytest.mark.usefixtures("db")
async def test_standard_orders_still_need_a_login():
    from starlette.requests import Request

    from app.routers.orders import place_pending_order

    request = Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": None})
    with pytest.raises(HTTPException) as exc:
        await place_pending_order({"orderItems": [{"product": "x"}]}, None, request)
    assert exc.value.status_code == 401


# ---------------------------------------------------------------- one-click: verify


async def _magic_verify(order: Order, *, signature_secret=KEY_SECRET, rz_order_id="order_RZ1"):
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    signature = hmac.new(signature_secret.encode(), f"{rz_order_id}|pay_1".encode(), hashlib.sha256).hexdigest()
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        return await c.post(
            "/api/payments/magic/verify",
            json={
                "razorpay_order_id": rz_order_id,
                "razorpay_payment_id": "pay_1",
                "razorpay_signature": signature,
                "localOrderId": str(order.id),
            },
        )


@pytest.mark.usefixtures("db")
async def test_guest_verify_links_an_account_and_finalises(verify_env):
    install, finalized, refunds = verify_env
    await _shipping_rates(rest=49)
    order = await _magic_order(razorpayOrderId="order_RZ1")
    await PaymentTransaction(orderId=order.id, userId=None, razorpayOrderId="order_RZ1", amountInPaise=219800).insert()
    install(_rz_order(), {"id": "pay_1", "status": "captured", "amount": 224700, "order_id": "order_RZ1"})

    res = await _magic_verify(order)

    assert res.status_code == 200, res.text
    assert res.json()["order"]["finalPrice"] == 2247.0
    # Only what the success page needs; no address in the reply.
    assert "shippingAddress" not in res.json()["order"]
    assert finalized == ["pay_1"] and refunds == []
    saved = await Order.get(order.id)
    user = await User.get(saved.customerId)
    assert user.phone == "9876543210" and user.email == "buyer@example.com"
    txn = await PaymentTransaction.find_one(PaymentTransaction.razorpayOrderId == "order_RZ1")
    assert txn.status == "paid" and txn.userId == user.id


@pytest.mark.usefixtures("db")
async def test_guest_verify_rejects_a_bad_signature_or_wrong_order(verify_env):
    install, finalized, _ = verify_env
    order = await _magic_order(razorpayOrderId="order_RZ1")
    await PaymentTransaction(orderId=order.id, userId=None, razorpayOrderId="order_RZ1", amountInPaise=219800).insert()
    install(_rz_order(), {"id": "pay_1", "status": "captured", "amount": 219800, "order_id": "order_RZ1"})

    bad_sig = await _magic_verify(order, signature_secret="not-the-secret")
    assert bad_sig.status_code == 400
    other_order = await _magic_verify(order, rz_order_id="order_SOMEONE_ELSE")
    assert other_order.status_code == 400
    assert finalized == []


# ---------------------------------------------------------------- abandoned webhook


async def _abandoned(body):
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as c:
        return await c.post("/api/payments/magic/abandoned", json=body)


@pytest.mark.usefixtures("db")
async def test_abandoned_webhook_adds_contact_to_the_guest_cart():
    from app.documents import AbandonedCheckout

    order = await _magic_order(transactionDetails={"checkout": "magic", "guestId": "guest_abc"})
    row = AbandonedCheckout(guestId="guest_abc", items=[{"productId": "p1"}], status="abandoned")
    await row.insert()

    res = await _abandoned({"receipt": str(order.id), "phone": "+919876543210", "email": "Buyer@Example.com"})

    assert res.status_code == 200
    saved = await AbandonedCheckout.get(row.id)
    assert saved.customerDetails["phone"] == "9876543210"
    assert saved.customerDetails["email"] == "buyer@example.com"
    assert saved.orderId == order.id


@pytest.mark.usefixtures("db")
async def test_abandoned_webhook_creates_a_row_from_the_order_if_none():
    from app.documents import AbandonedCheckout

    order = await _magic_order(razorpayOrderId="order_RZ9", transactionDetails={"checkout": "magic"})
    await _abandoned({"razorpay_order_id": "RZ9", "customer": {"contact": "9876543210"}})
    row = await AbandonedCheckout.find_one(AbandonedCheckout.orderId == order.id)
    assert row and row.customerDetails["phone"] == "9876543210"
    assert row.items[0]["name"] == "Escape to Become"


@pytest.mark.usefixtures("db")
async def test_abandoned_webhook_never_touches_an_accounts_cart():
    """Public endpoint + recovery links that sign in = only guest carts may be written."""
    from app.documents import AbandonedCheckout

    owner = User(name="Owner", email="owner@example.com")
    await owner.insert()
    order = await _magic_order(customerId=owner.id, transactionDetails={"checkout": "magic", "guestId": "g1"})
    row = AbandonedCheckout(userId=owner.id, guestId="g1", status="abandoned")
    await row.insert()

    await _abandoned({"receipt": str(order.id), "phone": "9000000009"})

    assert (await AbandonedCheckout.get(row.id)).customerDetails == {}
    assert await AbandonedCheckout.find(AbandonedCheckout.orderId == order.id).count() == 0


@pytest.mark.usefixtures("db")
async def test_abandoned_webhook_keeps_samples_of_unknown_payloads():
    res = await _abandoned({"something": "unexpected"})
    assert res.status_code == 200
    sample = await Setting.find_one(Setting.key == magic_checkout.ABANDONED_SAMPLE_KEY)
    assert sample.value["samples"][0]["body"] == {"something": "unexpected"}
