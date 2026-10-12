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
