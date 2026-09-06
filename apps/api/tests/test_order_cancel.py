from __future__ import annotations

import httpx
import pytest
from fastapi import HTTPException

from app.documents import Order, OrderItem
from app.services import couriers, order_cancel


@pytest.fixture(autouse=True)
def carrier_env(monkeypatch):
    monkeypatch.setenv("DELHIVERY_API_TOKEN", "test-token")
    monkeypatch.setenv("DELHIVERY_PICKUP_LOCATION", "Urban Aana Warehouse")
    monkeypatch.setenv("DELHIVERY_ENV", "staging")
    yield


@pytest.fixture
def mock_http(monkeypatch):
    def _install(handler):
        original = httpx.AsyncClient.__init__

        def patched(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            original(self, *args, **kwargs)

        monkeypatch.setattr(httpx.AsyncClient, "__init__", patched)

    return _install


async def _order(**overrides) -> Order:
    defaults = dict(
        orderNumber="UA2001",
        status="processing",
        paymentStatus="paid",
        finalPrice=1200.0,
        items=[OrderItem(productName="Tee", quantity=1)],
        shippingAddress={"pincode": "682001"},
    )
    order = Order(**{**defaults, **overrides})
    await order.insert()
    return order


# ---------------------------------------------------------------- guards


@pytest.mark.usefixtures("db")
async def test_already_cancelled_is_rejected():
    order = await _order(status="cancelled")
    with pytest.raises(HTTPException) as exc:
        await order_cancel.cancel_order(order)
    assert "already cancelled" in str(exc.value.detail).lower()


@pytest.mark.usefixtures("db")
async def test_delivered_orders_cannot_be_cancelled():
    order = await _order(status="delivered", isDelivered=True)
    with pytest.raises(HTTPException) as exc:
        await order_cancel.cancel_order(order)
    assert exc.value.status_code == 400


# ---------------------------------------------------------------- soft-error matching


@pytest.mark.parametrize(
    "detail,soft",
    [
        ("Shipment already cancelled", True),
        ("Waybill not found", True),
        ("No AWB / reference to cancel", True),
        # The bug this guards: "cannot be cancelled" contains "cancelled".
        ("Cannot be cancelled at this stage", False),
        ("Unable to cancel, already out for delivery", False),
        ("Cancellation not allowed after pickup", False),
        ("Some other carrier failure", False),
        ("", False),
    ],
)
def test_soft_cancel_error_matching(detail, soft):
    assert order_cancel._is_soft_cancel_error(detail) is soft


# ---------------------------------------------------------------- unfulfilled


@pytest.mark.usefixtures("db")
async def test_unfulfilled_cancel_skips_the_carrier():
    order = await _order()
    result = await order_cancel.cancel_order(order)

    assert result["hadShipment"] is False
    assert result["carrier"] is None
    assert result["shipmentCancelled"] is False

    refreshed = await Order.get(order.id)
    assert refreshed.status == "cancelled"
    assert refreshed.shippingStatus == "Cancelled"
    assert refreshed.archived is True
    assert refreshed.transactionDetails["cancelledBy"] == "admin"


# ---------------------------------------------------------------- carrier routing


@pytest.mark.usefixtures("db")
async def test_delhivery_order_cancels_against_delhivery(mock_http):
    """The bug this guards: a Delhivery waybill sent to DTDC's cancel endpoint."""
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"status": True, "remark": "Shipment has been cancelled"})

    mock_http(handler)
    order = await _order(awb="DL999", carrier="delhivery", shippingStatus="Awaiting Shipment")
    result = await order_cancel.cancel_order(order)

    assert "delhivery.com" in seen["url"]
    assert "/api/p/edit" in seen["url"]
    assert result["carrier"] == "delhivery"
    assert result["shipmentCancelled"] is True
    # Legacy key still true so existing admin clients keep working.
    assert result["dtdcCancelled"] is True
    assert result["dtdc"] is None

    refreshed = await Order.get(order.id)
    assert refreshed.status == "cancelled"
    assert refreshed.awb is None


@pytest.mark.usefixtures("db")
async def test_legacy_order_without_carrier_cancels_against_dtdc(monkeypatch):
    """Orders booked before Delhivery existed carry no carrier code."""
    called: dict = {}

    async def fake_cancel(o):
        called["hit"] = "dtdc"
        o.awb = None
        await o.save()
        return {"status": "OK"}

    monkeypatch.setattr(couriers.CARRIERS["dtdc"], "cancel_consignment", fake_cancel)
    order = await _order(awb="D12345", courier="DTDC")
    result = await order_cancel.cancel_order(order)

    assert called["hit"] == "dtdc"
    assert result["carrier"] == "dtdc"
    assert result["dtdc"] == {"status": "OK"}


# ---------------------------------------------------------------- refund on cancel


@pytest.mark.usefixtures("db")
async def test_paid_order_is_refunded_on_cancel(monkeypatch):
    calls: dict = {}

    async def fake_refund(order, *, reason):
        calls["reason"] = reason
        order.paymentStatus = "refunded"
        await order.save()
        return {"ok": True, "amount_refunded_paise": 120000}

    monkeypatch.setattr(
        "app.services.razorpay_refund.refund_order_payment", fake_refund
    )
    order = await _order(razorpayPaymentId="pay_123")
    result = await order_cancel.cancel_order(order)

    assert result["refunded"] is True
    assert calls["reason"] == "admin_cancel_refund"
    refreshed = await Order.get(order.id)
    assert refreshed.status == "cancelled"
    assert refreshed.paymentStatus == "refunded"


@pytest.mark.usefixtures("db")
async def test_refund_can_be_skipped(monkeypatch):
    async def fail(order, *, reason):
        raise AssertionError("refund must not run when refund=False")

    monkeypatch.setattr("app.services.razorpay_refund.refund_order_payment", fail)
    order = await _order(razorpayPaymentId="pay_123")
    result = await order_cancel.cancel_order(order, refund=False)

    assert result["refunded"] is False
    assert (await Order.get(order.id)).status == "cancelled"


@pytest.mark.usefixtures("db")
async def test_unpaid_order_skips_refund():
    order = await _order(paymentStatus="pending")
    result = await order_cancel.cancel_order(order)
    assert result["refunded"] is False
    assert "refundSkipped" in result


@pytest.mark.usefixtures("db")
async def test_paid_order_without_payment_id_skips_refund():
    """COD or manually-marked-paid orders have nothing to refund at Razorpay."""
    order = await _order()
    result = await order_cancel.cancel_order(order)
    assert result["refunded"] is False
    assert "refundSkipped" in result


@pytest.mark.usefixtures("db")
async def test_refund_failure_does_not_abort_the_cancel(monkeypatch):
    """The parcel is already cancelled — a Razorpay outage must not strand the order."""

    async def failing(order, *, reason):
        return {"ok": False, "error": "gateway_timeout"}

    monkeypatch.setattr(
        "app.services.razorpay_refund.refund_order_payment", failing
    )
    order = await _order(razorpayPaymentId="pay_123")
    result = await order_cancel.cancel_order(order)

    assert result["refunded"] is False
    assert result["refundError"] == "gateway_timeout"
    refreshed = await Order.get(order.id)
    assert refreshed.status == "cancelled"
    assert refreshed.archived is True


# ---------------------------------------------------------------- failure handling


@pytest.mark.usefixtures("db")
async def test_carrier_refusal_aborts_the_cancel(mock_http):
    """A live parcel must not be marked cancelled locally."""
    mock_http(
        lambda request: httpx.Response(
            200, json={"status": False, "remark": "Cannot cancel, shipment out for delivery"}
        )
    )
    order = await _order(awb="DL999", carrier="delhivery")
    with pytest.raises(HTTPException):
        await order_cancel.cancel_order(order)

    refreshed = await Order.get(order.id)
    assert refreshed.status != "cancelled"
    assert refreshed.awb == "DL999"


@pytest.mark.usefixtures("db")
async def test_already_gone_shipment_still_cancels_locally(mock_http):
    mock_http(
        lambda request: httpx.Response(
            200, json={"status": False, "remark": "Shipment already cancelled"}
        )
    )
    order = await _order(awb="DL999", carrier="delhivery")
    result = await order_cancel.cancel_order(order)

    assert result["shipmentCancelled"] is False
    assert "already" in result["shipmentWarning"].lower()

    refreshed = await Order.get(order.id)
    assert refreshed.status == "cancelled"
    assert refreshed.transactionDetails["shipmentCancelled"]["carrier"] == "delhivery"
