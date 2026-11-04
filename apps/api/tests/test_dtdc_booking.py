"""DTDC booking keeps each service type's rejection instead of only the last one."""

from __future__ import annotations

import httpx
import pytest
from fastapi import HTTPException

from app.documents import Order, OrderItem
from app.services import dtdc


class _FakeClient:
    """Stands in for httpx.AsyncClient; answers per service_type_id."""

    def __init__(self, replies: dict[str, tuple[int, dict]]):
        self.replies = replies
        self.calls: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, *, headers=None, json=None):
        service = json["service_type_id"]
        self.calls.append(service)
        status, body = self.replies[service]
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))


@pytest.fixture
def fake_dtdc(monkeypatch):
    async def creds():
        return {"apiKey": "k", "customerCode": "c"}

    async def payload(order, user, cfg):
        return {"customer_reference_number": order.orderNumber}

    monkeypatch.setattr(dtdc, "require_dtdc_creds", creds)
    monkeypatch.setattr(dtdc, "build_softdata_payload", payload)

    def install(replies):
        client = _FakeClient(replies)
        monkeypatch.setattr(dtdc.httpx, "AsyncClient", lambda **_: client)
        return client

    return install


async def _paid_order() -> Order:
    order = Order(
        orderNumber="UA1724",
        items=[OrderItem(productName="Tee", quantity=1, price=1199)],
        shippingAddress={"pincode": "501505"},
        paymentStatus="paid",
        finalPrice=1199,
    )
    await order.insert()
    return order


def _rejected(message: str) -> tuple[int, dict]:
    return 400, {"status": "OK", "data": [{"success": False, "message": message}]}


@pytest.mark.usefixtures("db")
async def test_failure_reports_every_service_reason(fake_dtdc):
    client = fake_dtdc(
        {
            "B2C PRIORITY": _rejected("Pincode not serviceable for Priority"),
            "B2C SMART EXPRESS": _rejected("Consignment Number and Service Type do not Match"),
        }
    )
    order = await _paid_order()

    with pytest.raises(HTTPException) as err:
        await dtdc.create_consignment(order)

    assert client.calls == ["B2C PRIORITY", "B2C SMART EXPRESS"]
    assert err.value.status_code == 502
    assert err.value.detail == (
        "B2C PRIORITY: Pincode not serviceable for Priority; "
        "B2C SMART EXPRESS: Consignment Number and Service Type do not Match"
    )
    saved = await Order.get(order.id)
    assert saved.shippingStatus == "Shipping Sync Failed"
    assert saved.transactionDetails["dtdcError"] == err.value.detail
    assert saved.transactionDetails["dtdcAttempts"] == [
        {"serviceType": "B2C PRIORITY", "error": "Pincode not serviceable for Priority"},
        {"serviceType": "B2C SMART EXPRESS", "error": "Consignment Number and Service Type do not Match"},
    ]


@pytest.mark.usefixtures("db")
async def test_same_reason_on_every_service_is_not_repeated(fake_dtdc):
    fake_dtdc(
        {
            "B2C PRIORITY": _rejected("Invalid destination pincode"),
            "B2C SMART EXPRESS": _rejected("Invalid destination pincode"),
        }
    )
    order = await _paid_order()

    with pytest.raises(HTTPException) as err:
        await dtdc.create_consignment(order)

    assert err.value.detail == "Invalid destination pincode"


@pytest.mark.usefixtures("db")
async def test_fallback_booking_clears_earlier_attempts(fake_dtdc, monkeypatch):
    async def no_notify(*_a, **_k):
        return None

    from app.services import aisensy, email_resend, erp_ops

    monkeypatch.setattr(aisensy, "notify_order_event_once", no_notify)
    monkeypatch.setattr(email_resend, "notify_order_email_once", no_notify)
    monkeypatch.setattr(erp_ops, "ensure_order_invoice_safe", no_notify)
    fake_dtdc(
        {
            "B2C PRIORITY": _rejected("Pincode not serviceable for Priority"),
            "B2C SMART EXPRESS": (200, {"status": "OK", "data": [{"success": True, "reference_number": "7X123"}]}),
        }
    )
    order = await _paid_order()
    order.transactionDetails = {"dtdcAttempts": [{"serviceType": "old", "error": "stale"}]}
    await order.save()

    result = await dtdc.create_consignment(order)

    assert result["service_type_id"] == "B2C SMART EXPRESS"
    saved = await Order.get(order.id)
    assert saved.awb == "7X123"
    assert saved.transactionDetails["dtdcAttempts"] is None
    assert saved.transactionDetails["dtdcError"] is None
