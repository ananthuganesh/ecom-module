from __future__ import annotations

import hashlib
import json

import httpx
import pytest

from app.config import get_settings
from app.documents import Order, OrderItem, User
from app.services import conversions


@pytest.fixture
def configured(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "ga4_measurement_id", "G-TEST123", raising=False)
    monkeypatch.setattr(s, "ga4_api_secret", "secret", raising=False)
    monkeypatch.setattr(s, "meta_pixel_id", "999", raising=False)
    monkeypatch.setattr(s, "meta_capi_access_token", "tok", raising=False)
    monkeypatch.setattr(s, "meta_capi_test_event_code", "", raising=False)
    monkeypatch.setattr(s, "meta_graph_version", "v23.0", raising=False)
    yield s


@pytest.fixture
def unconfigured(monkeypatch):
    s = get_settings()
    for field in ("ga4_measurement_id", "ga4_api_secret", "meta_pixel_id", "meta_capi_access_token"):
        monkeypatch.setattr(s, field, "", raising=False)
    yield s


@pytest.fixture
def capture(monkeypatch):
    """Record outbound requests instead of hitting Google or Meta."""
    calls: list[httpx.Request] = []
    responses: dict[str, httpx.Response] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        host = request.url.host
        if host in responses:
            return responses[host]
        if "facebook" in host:
            return httpx.Response(200, json={"events_received": 1})
        return httpx.Response(204)

    original = httpx.AsyncClient.__init__

    def patched(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        original(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched)
    return calls, responses


async def _order(**overrides) -> Order:
    defaults = dict(
        orderNumber="UA5001",
        paymentStatus="paid",
        finalPrice=1199.0,
        deliveryAmount=0,
        couponCode="DROP10",
        items=[OrderItem(productId="p1", productName="Indian Elephant", size="M", quantity=1, price=1199)],
        shippingAddress={"name": "Test", "phone": "9876543210", "email": "Buyer@Example.com"},
        transactionDetails={
            "browserContext": {
                "gaClientId": "123456.7890",
                "fbp": "fb.1.123.456",
                "fbc": "fb.1.123.abc",
                "ip": "203.0.113.9",
                "userAgent": "Mozilla/5.0",
            }
        },
    )
    order = Order(**{**defaults, **overrides})
    await order.insert()
    return order


def _body(request: httpx.Request) -> dict:
    return json.loads(request.content)


# ---------------------------------------------------------------- browser context


def test_ga_client_id_takes_the_last_two_parts():
    assert conversions.ga_client_id_from_cookie("GA1.1.123456.7890") == "123456.7890"
    assert conversions.ga_client_id_from_cookie("GA1.2.99.88") == "99.88"


@pytest.mark.parametrize("bad", [None, "", "garbage", "GA1.1.abc.def", "GA1.1"])
def test_ga_client_id_rejects_malformed_cookies(bad):
    assert conversions.ga_client_id_from_cookie(bad) is None


def test_browser_context_reads_cookies_ip_and_user_agent():
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/orders",
        "headers": [
            (b"cookie", b"_ga=GA1.1.555.666; _fbp=fb.1.1.2; _fbc=fb.1.1.click"),
            (b"x-forwarded-for", b"198.51.100.4, 10.0.0.1"),
            (b"user-agent", b"TestAgent/1.0"),
        ],
        "client": ("10.0.0.1", 1234),
    }
    ctx = conversions.browser_context_from_request(Request(scope))
    assert ctx == {
        "gaClientId": "555.666",
        "fbp": "fb.1.1.2",
        "fbc": "fb.1.1.click",
        # The first forwarded hop is the shopper, not the proxy.
        "ip": "198.51.100.4",
        "userAgent": "TestAgent/1.0",
    }


def test_browser_context_omits_missing_values():
    from starlette.requests import Request

    scope = {"type": "http", "method": "POST", "path": "/", "headers": [], "client": None}
    assert conversions.browser_context_from_request(Request(scope)) == {}
    assert conversions.browser_context_from_request(None) == {}


# ---------------------------------------------------------------- dedup ids


@pytest.mark.usefixtures("db")
async def test_event_id_matches_the_browser_transaction_id():
    """The browser sends order._id as transaction_id; the server must match it."""
    order = await _order()
    assert conversions.event_id_for(order) == str(order.id)


# ---------------------------------------------------------------- GA4 purchase


@pytest.mark.usefixtures("db")
async def test_ga4_purchase_payload(configured):
    order = await _order()
    user = User(name="Buyer", email="buyer@example.com")
    await user.insert()

    payload = await conversions.build_ga4_purchase(order, user)
    event = payload["events"][0]

    assert payload["client_id"] == "123456.7890"
    assert payload["user_id"] == str(user.id)
    assert event["name"] == "purchase"
    assert event["params"]["transaction_id"] == str(order.id)
    assert event["params"]["value"] == 1199.0
    assert event["params"]["currency"] == "INR"
    assert event["params"]["coupon"] == "DROP10"
    assert event["params"]["items"][0]["item_name"] == "Indian Elephant"
    assert event["params"]["items"][0]["item_variant"] == "M"


@pytest.mark.usefixtures("db")
async def test_ga4_falls_back_to_a_stable_client_id_without_the_cookie(configured):
    order = await _order(transactionDetails={})
    payload = await conversions.build_ga4_purchase(order, None)
    assert payload["client_id"].startswith("server.")
    assert "user_id" not in payload
    # Stable: building it again gives the same id.
    assert (await conversions.build_ga4_purchase(order, None))["client_id"] == payload["client_id"]


# ---------------------------------------------------------------- Meta purchase


@pytest.mark.usefixtures("db")
async def test_meta_purchase_hashes_personal_data(configured):
    order = await _order()
    payload = await conversions.build_meta_purchase(order, None)
    event = payload["data"][0]
    user_data = event["user_data"]

    assert event["event_name"] == "Purchase"
    assert event["event_id"] == str(order.id)
    assert event["action_source"] == "website"

    # Lower-cased and trimmed before hashing, as Meta requires.
    assert user_data["em"] == [hashlib.sha256(b"buyer@example.com").hexdigest()]
    # Indian mobile gains its 91 country code.
    assert user_data["ph"] == [hashlib.sha256(b"919876543210").hexdigest()]
    # Raw email and phone never leave the server.
    serialized = json.dumps(payload)
    assert "Buyer@Example.com" not in serialized
    assert "9876543210" not in serialized.replace(hashlib.sha256(b"919876543210").hexdigest(), "")

    assert user_data["fbp"] == "fb.1.123.456"
    assert user_data["client_ip_address"] == "203.0.113.9"
    assert event["custom_data"]["value"] == 1199.0
    assert event["custom_data"]["contents"][0]["quantity"] == 1


@pytest.mark.usefixtures("db")
async def test_meta_purchase_carries_address_match_keys_and_catalogue_ids(configured, monkeypatch):
    monkeypatch.setenv("PUBLIC_WEB_URL", "https://urbanaana.com/")
    order = await _order(
        shippingAddress={
            "fullName": "Anu  Thomas",
            "phone": "9876543210",
            "city": "Kochi",
            "state": "Kerala",
            "pincode": "682 001",
        },
        items=[
            OrderItem(productId="p1", productName="Tee", quantity=2, price=999),
            OrderItem(productId="p2", productName="Tee 2", quantity=1, price=1199),
        ],
    )
    event = (await conversions.build_meta_purchase(order, None))["data"][0]
    sha = lambda v: [hashlib.sha256(v.encode()).hexdigest()]  # noqa: E731

    assert event["user_data"]["fn"] == sha("anu")
    assert event["user_data"]["ln"] == sha("thomas")
    assert event["user_data"]["ct"] == sha("kochi")
    assert event["user_data"]["st"] == sha("kerala")
    assert event["user_data"]["zp"] == sha("682001")
    assert event["user_data"]["country"] == sha("in")
    # Website events must name the page; this is where the browser copy fires.
    assert event["event_source_url"] == f"https://urbanaana.com/checkout/success?orderId={order.id}"
    assert event["custom_data"]["content_ids"] == ["p1", "p2"]
    assert event["custom_data"]["num_items"] == 3


# ---------------------------------------------------------------- browser mirror


def _mirror_body(**overrides):
    body = {
        "event_name": "AddToCart",
        "event_id": "addtocart_6f1c2b9e-1111-2222-3333-444455556666",
        "event_source_url": "https://urbanaana.com/product/escape-to-become",
        "custom_data": {
            "content_ids": ["p1"],
            "contents": [{"id": "p1", "quantity": 1, "item_price": 999}],
            "value": 999,
        },
    }
    body.update(overrides)
    return body


async def _post_mirror(body):
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    async with AsyncClient(
        transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test"
    ) as client:
        return await client.post(
            "/api/tracking/meta",
            json=body,
            headers={"user-agent": "TestAgent/1.0", "cookie": "_fbp=fb.1.1.2"},
        )


@pytest.fixture
def mirrored(monkeypatch):
    monkeypatch.setenv("PUBLIC_WEB_URL", "https://urbanaana.com")
    sent: list[dict] = []

    async def fake_send(**kwargs):
        sent.append(kwargs)
        return {"ok": True}

    monkeypatch.setattr(conversions, "send_browser_event", fake_send)
    return sent


@pytest.mark.usefixtures("db")
async def test_mirror_endpoint_forwards_the_event_with_its_id(mirrored):
    res = await _post_mirror(_mirror_body())
    assert res.status_code == 204
    assert len(mirrored) == 1
    sent = mirrored[0]
    assert sent["event_name"] == "AddToCart"
    assert sent["event_id"] == "addtocart_6f1c2b9e-1111-2222-3333-444455556666"
    assert sent["custom_data"]["value"] == 999
    assert sent["user"] is None


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    "overrides",
    [
        # Purchase only comes from the verified payment path.
        {"event_name": "Purchase"},
        {"event_id": "x"},
        {"event_source_url": "https://evil.example/product/1"},
        {"event_source_url": "javascript:alert(1)"},
        {"custom_data": {"content_ids": [], "contents": [], "value": 1}},
        {"custom_data": {"content_ids": ["p1"], "contents": [{"id": "p1", "quantity": 1, "item_price": 1}], "value": -5}},
    ],
)
async def test_mirror_endpoint_rejects_bad_events(mirrored, overrides):
    res = await _post_mirror(_mirror_body(**overrides))
    assert res.status_code in (400, 422)
    assert mirrored == []


@pytest.mark.usefixtures("db")
async def test_mirror_accepts_www_host(mirrored):
    res = await _post_mirror(_mirror_body(event_source_url="https://www.urbanaana.com/cart"))
    assert res.status_code == 204


async def test_browser_event_payload(configured, capture):
    from starlette.requests import Request

    calls, _ = capture
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/tracking/meta",
        "headers": [(b"cookie", b"_fbp=fb.1.1.2"), (b"user-agent", b"TestAgent/1.0")],
        "client": ("203.0.113.7", 1234),
    }
    user = User(email="Buyer@Example.com", phone="9876543210", name="Buyer")
    result = await conversions.send_browser_event(
        event_name="InitiateCheckout",
        event_id="initiatecheckout_abc12345",
        event_source_url="https://urbanaana.com/checkout",
        custom_data={"content_ids": ["p1"], "contents": [{"id": "p1", "quantity": 2, "item_price": 999}], "value": 1998, "num_items": 2},
        request=Request(scope),
        user=user,
    )
    assert result["ok"] is True
    event = _body(calls[0])["data"][0]
    assert event["event_id"] == "initiatecheckout_abc12345"
    assert event["event_source_url"] == "https://urbanaana.com/checkout"
    assert event["custom_data"]["currency"] == "INR"
    assert event["custom_data"]["content_type"] == "product"
    assert event["user_data"]["em"] == [hashlib.sha256(b"buyer@example.com").hexdigest()]
    assert event["user_data"]["fbp"] == "fb.1.1.2"
    assert event["user_data"]["client_ip_address"] == "203.0.113.7"
    # No shipping address on a browsing event, so no country claim either.
    assert "country" not in event["user_data"]


async def test_browser_event_never_sends_purchase(configured, capture):
    calls, _ = capture
    result = await conversions.send_browser_event(
        event_name="Purchase",
        event_id="purchase_abc12345",
        event_source_url="https://urbanaana.com/",
        custom_data={"value": 1},
        request=None,
    )
    assert result == {}
    assert calls == []


async def test_browser_event_skipped_when_unconfigured(unconfigured, capture):
    calls, _ = capture
    result = await conversions.send_browser_event(
        event_name="AddToCart",
        event_id="addtocart_abc12345",
        event_source_url="https://urbanaana.com/",
        custom_data={"value": 1},
        request=None,
    )
    assert result == {}
    assert calls == []


# ---------------------------------------------------------------- sending


@pytest.mark.usefixtures("db")
async def test_send_purchase_hits_both_platforms(configured, capture):
    calls, _ = capture
    order = await _order()
    result = await conversions.send_purchase(order, None)

    assert result["ga4"]["ok"] is True
    assert result["meta"]["ok"] is True
    hosts = sorted(r.url.host for r in calls)
    assert hosts == ["graph.facebook.com", "www.google-analytics.com"]

    ga = next(r for r in calls if "google" in r.url.host)
    assert ga.url.params["measurement_id"] == "G-TEST123"
    meta = next(r for r in calls if "facebook" in r.url.host)
    assert meta.url.path == "/v23.0/999/events"


@pytest.mark.usefixtures("db")
async def test_send_purchase_is_idempotent(configured, capture):
    """A webhook retry must not report the same sale twice."""
    calls, _ = capture
    order = await _order()

    await conversions.send_purchase(order, None)
    refreshed = await Order.get(order.id)
    await conversions.send_purchase(refreshed, None)

    assert len(calls) == 2  # one GA4 + one Meta, not four


@pytest.mark.usefixtures("db")
async def test_a_failed_send_is_retried_next_time(configured, capture):
    calls, responses = capture
    responses["www.google-analytics.com"] = httpx.Response(500, text="boom")
    order = await _order()

    first = await conversions.send_purchase(order, None)
    assert first["ga4"]["ok"] is False

    del responses["www.google-analytics.com"]
    refreshed = await Order.get(order.id)
    second = await conversions.send_purchase(refreshed, None)
    # GA4 failed before so it is tried again; Meta succeeded so it is not.
    assert second["ga4"]["ok"] is True
    assert "meta" not in second


@pytest.mark.usefixtures("db")
async def test_send_records_the_outcome_on_the_order(configured, capture):
    order = await _order()
    await conversions.send_purchase(order, None)
    refreshed = await Order.get(order.id)
    record = refreshed.transactionDetails["serverConversions"]["purchase"]
    assert record["ga4"]["ok"] is True
    assert record["meta"]["ok"] is True
    assert "at" in record["ga4"]


@pytest.mark.usefixtures("db")
async def test_meta_error_body_is_treated_as_failure(configured, capture):
    _, responses = capture
    responses["graph.facebook.com"] = httpx.Response(
        400, json={"error": {"message": "Invalid parameter"}}
    )
    order = await _order()
    result = await conversions.send_purchase(order, None)
    assert result["meta"]["ok"] is False
    assert "Invalid parameter" in result["meta"]["error"]


@pytest.mark.usefixtures("db")
async def test_network_errors_never_raise(configured, monkeypatch):
    """Conversions are best-effort — they must not break the payment path."""

    def exploding(self, *args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx.AsyncClient, "post", exploding)
    order = await _order()
    result = await conversions.send_purchase(order, None)
    assert result["ga4"]["ok"] is False
    assert result["meta"]["ok"] is False


@pytest.mark.usefixtures("db")
async def test_nothing_is_sent_when_unconfigured(unconfigured, capture):
    calls, _ = capture
    order = await _order()
    assert await conversions.send_purchase(order, None) == {}
    assert await conversions.send_refund(order, None) == {}
    assert calls == []


@pytest.mark.usefixtures("db")
async def test_test_event_code_is_passed_to_meta(configured, capture, monkeypatch):
    calls, _ = capture
    monkeypatch.setattr(configured, "meta_capi_test_event_code", "TEST42", raising=False)
    order = await _order()
    await conversions.send_purchase(order, None)
    meta = next(r for r in calls if "facebook" in r.url.host)
    assert _body(meta)["test_event_code"] == "TEST42"


# ---------------------------------------------------------------- refund


@pytest.mark.usefixtures("db")
async def test_refund_goes_to_ga4_only(configured, capture):
    """Meta's Conversions API has no refund event."""
    calls, _ = capture
    order = await _order()
    result = await conversions.send_refund(order, None, amount=1199.0)

    assert result["ga4"]["ok"] is True
    assert [r.url.host for r in calls] == ["www.google-analytics.com"]
    event = _body(calls[0])["events"][0]
    assert event["name"] == "refund"
    assert event["params"]["transaction_id"] == str(order.id)
    assert event["params"]["value"] == 1199.0


@pytest.mark.usefixtures("db")
async def test_full_refund_omits_value(configured, capture):
    calls, _ = capture
    order = await _order()
    await conversions.send_refund(order, None, amount=None)
    assert "value" not in _body(calls[0])["events"][0]["params"]


@pytest.mark.usefixtures("db")
async def test_separate_refunds_are_each_reported_once(configured, capture):
    calls, _ = capture
    order = await _order()
    await conversions.send_refund(order, None, amount=400, key="refund_rf_1")
    refreshed = await Order.get(order.id)
    await conversions.send_refund(refreshed, None, amount=400, key="refund_rf_1")
    refreshed = await Order.get(order.id)
    await conversions.send_refund(refreshed, None, amount=300, key="refund_rf_2")
    assert len(calls) == 2


# ---------------------------------------------------------------- wiring


@pytest.mark.usefixtures("db")
async def test_refund_order_payment_reports_the_refund(configured, capture, monkeypatch):
    from app.services import razorpay_refund

    async def fake_razorpay(payment_id, *, reason, amount_paise=None):
        return {"ok": True, "amount_refunded_paise": 119900, "refund": {"id": "rfnd_1"}}

    monkeypatch.setattr(razorpay_refund, "refund_razorpay_payment", fake_razorpay)
    calls, _ = capture
    order = await _order(status="cancelled", razorpayPaymentId="pay_1")

    await razorpay_refund.refund_order_payment(order, reason="admin_cancel_refund")

    ga = [r for r in calls if "google" in r.url.host]
    assert len(ga) == 1
    assert _body(ga[0])["events"][0]["params"]["value"] == 1199.0


@pytest.mark.usefixtures("db")
async def test_already_refunded_does_not_report(configured, capture, monkeypatch):
    """No money moved, so nothing should subtract from revenue."""
    from app.services import razorpay_refund

    async def nothing_left(payment_id, *, reason, amount_paise=None):
        return {"ok": True, "already_refunded": True, "amount_refunded_paise": 119900}

    monkeypatch.setattr(razorpay_refund, "refund_razorpay_payment", nothing_left)
    calls, _ = capture
    order = await _order(status="cancelled", razorpayPaymentId="pay_1")

    await razorpay_refund.refund_order_payment(order, reason="admin_cancel_refund")
    assert [r for r in calls if "google" in r.url.host] == []


@pytest.mark.usefixtures("db")
async def test_paid_order_fires_purchase_exactly_once(monkeypatch):
    """Verify and webhook both finalise payment; only one may report the sale."""
    from app.routers import payments

    async def noop(*args, **kwargs):
        return None

    for name in ("ensure_stock_for_payment", "apply_order_commitments", "process_full_order_flow"):
        monkeypatch.setattr(payments, name, noop)
    monkeypatch.setattr(payments, "_upgrade_guest_customer_from_order", noop)

    sent: list[str] = []

    async def record_purchase(order, user=None):
        sent.append(str(order.id))
        return {}

    monkeypatch.setattr(conversions, "send_purchase", record_purchase)

    order = await _order(paymentStatus="pending", razorpayPaymentId=None)
    payment = {"id": "pay_once", "method": "upi"}

    await payments._finalize_paid_order(order, rz_payment_id="pay_once", payment=payment)
    # A second callback for the same payment — the webhook arriving after verify.
    again = await Order.get(order.id)
    await payments._finalize_paid_order(again, rz_payment_id="pay_once", payment=payment)

    assert sent == [str(order.id)]
    assert (await Order.get(order.id)).paymentStatus == "paid"


@pytest.mark.usefixtures("db")
async def test_create_order_stores_the_browser_context(monkeypatch):
    """The webhook has no cookies, so they must be captured when the order is made."""
    from starlette.requests import Request

    from app.services.conversions import browser_context_from_request

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/orders",
        "headers": [(b"cookie", b"_ga=GA1.1.42.43")],
        "client": ("198.51.100.7", 1),
    }
    ctx = browser_context_from_request(Request(scope))
    order = await _order(transactionDetails={"browserContext": ctx})
    payload = await conversions.build_ga4_purchase(order, None)
    assert payload["client_id"] == "42.43"
