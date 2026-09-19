"""Return refunds: exact refund-due amount via Razorpay, after receipt, once."""

from __future__ import annotations

import asyncio
from datetime import datetime

import pytest
from fastapi import HTTPException

from app.documents import Order, OrderItem, ReturnRequest, ReturnItem
from app.services import razorpay_refund
from app.services import returns as returns_svc


@pytest.fixture
def razorpay(monkeypatch):
    """Record refund calls; answer like Razorpay."""
    state = {"calls": [], "result": None}

    async def fake_refund(payment_id, *, reason, amount_paise=None):
        state["calls"].append({"payment_id": payment_id, "amount_paise": amount_paise, "reason": reason})
        await asyncio.sleep(0)
        if state["result"] is not None:
            return state["result"]
        return {
            "ok": True,
            "refund": {"id": f"rfnd_{len(state['calls'])}"},
            "amount_refunded_paise": amount_paise,
        }

    monkeypatch.setattr(razorpay_refund, "refund_razorpay_payment", fake_refund)
    return state


async def _setup(*, status="received", refund=1199.0, final=2398.0, pay="paid"):
    order = Order(
        orderNumber="UA1586",
        status="delivered",
        paymentStatus=pay,
        razorpayPaymentId="pay_ABC",
        finalPrice=final,
        items=[OrderItem(productName="Indian Elephant", quantity=2, price=1199, size="S")],
        transactionDetails={"paymentStatus": pay},
    )
    await order.insert()
    request = ReturnRequest(
        number="RR-202609-00001",
        orderId=str(order.id),
        orderNumber="UA1586",
        items=[ReturnItem(productName="Indian Elephant", quantity=1, unitPrice=1199, lineRefund=refund)],
        status=status,
        refundAmount=refund,
        receivedAt=datetime.utcnow() if status == "received" else None,
    )
    await request.insert()
    return order, request


@pytest.mark.usefixtures("db")
async def test_refunds_exactly_the_refund_due(razorpay):
    order, request = await _setup()
    result = await returns_svc.refund_return(request, actor_id="admin1")

    assert razorpay["calls"] == [
        {"payment_id": "pay_ABC", "amount_paise": 119900, "reason": "Return RR-202609-00001"}
    ]
    assert result["refundedAmount"] == 1199.0
    saved = await ReturnRequest.get(request.id)
    assert saved.refundStatus == "refunded"
    assert saved.refundId == "rfnd_1"
    assert saved.refundedAt is not None


@pytest.mark.parametrize("status", ["requested", "approved", "picked_up", "rejected"])
@pytest.mark.usefixtures("db")
async def test_no_refund_before_the_goods_are_received(razorpay, status):
    _, request = await _setup(status=status)
    with pytest.raises(HTTPException) as exc:
        await returns_svc.refund_return(request)
    assert exc.value.status_code == 400
    assert razorpay["calls"] == []


@pytest.mark.usefixtures("db")
async def test_part_of_the_order_marks_it_partially_refunded(razorpay):
    order, request = await _setup(refund=1199.0, final=2398.0)
    await returns_svc.refund_return(request)
    saved = await Order.get(order.id)
    assert saved.paymentStatus == "partially_refunded"
    assert saved.transactionDetails["paymentStatus"] == "partially_refunded"
    assert saved.transactionDetails["refundedAmount"] == 1199.0
    entry = saved.transactionDetails["refunds"][-1]
    assert entry["returnNumber"] == "RR-202609-00001"
    assert entry["id"] == "rfnd_1"


@pytest.mark.usefixtures("db")
async def test_whole_order_marks_it_refunded(razorpay):
    order, request = await _setup(refund=1199.0, final=1199.0)
    await returns_svc.refund_return(request)
    assert (await Order.get(order.id)).paymentStatus == "refunded"


@pytest.mark.usefixtures("db")
async def test_second_refund_is_refused(razorpay):
    _, request = await _setup()
    await returns_svc.refund_return(request)
    with pytest.raises(HTTPException) as exc:
        await returns_svc.refund_return(await ReturnRequest.get(request.id))
    assert exc.value.status_code == 400
    assert len(razorpay["calls"]) == 1


@pytest.mark.usefixtures("db")
async def test_simultaneous_clicks_refund_once(razorpay):
    _, request = await _setup()
    copies = [await ReturnRequest.get(request.id) for _ in range(3)]
    results = await asyncio.gather(
        *(returns_svc.refund_return(c) for c in copies), return_exceptions=True
    )
    assert sum(1 for r in results if isinstance(r, dict)) == 1
    assert len(razorpay["calls"]) == 1


@pytest.mark.usefixtures("db")
async def test_failed_refund_can_be_retried(razorpay):
    order, request = await _setup()
    razorpay["result"] = {"ok": False, "error": "BAD_REQUEST_ERROR"}
    with pytest.raises(HTTPException) as exc:
        await returns_svc.refund_return(request)
    assert exc.value.status_code == 502
    failed = await ReturnRequest.get(request.id)
    assert failed.refundStatus == "failed"
    assert "BAD_REQUEST_ERROR" in failed.refundError
    assert (await Order.get(order.id)).paymentStatus == "paid"  # nothing recorded

    razorpay["result"] = None
    await returns_svc.refund_return(failed)
    assert (await ReturnRequest.get(request.id)).refundStatus == "refunded"


@pytest.mark.usefixtures("db")
async def test_already_refunded_in_razorpay_records_no_new_money(razorpay):
    order, request = await _setup()
    razorpay["result"] = {"ok": True, "already_refunded": True, "amount_refunded_paise": 239800}
    result = await returns_svc.refund_return(request)
    assert result["alreadyRefunded"] is True
    saved = await ReturnRequest.get(request.id)
    assert saved.refundStatus == "refunded"
    assert "already fully refunded" in saved.refundError
    assert (await Order.get(order.id)).transactionDetails.get("refundedAmount") is None


@pytest.mark.usefixtures("db")
async def test_unpaid_order_cannot_be_refunded(razorpay):
    _, request = await _setup(pay="pending")
    with pytest.raises(HTTPException):
        await returns_svc.refund_return(request)
    assert razorpay["calls"] == []


@pytest.mark.usefixtures("db")
async def test_refund_shows_on_the_order_payload(razorpay):
    from app.serializers import enrich_orders

    order, request = await _setup()
    await returns_svc.refund_return(request)
    payload = (await enrich_orders([await Order.get(order.id)]))[0]
    ret = payload["returns"][0]
    assert ret["refundStatus"] == "refunded"
    assert ret["refundedAmount"] == 1199.0
    assert ret["refundId"] == "rfnd_1"


@pytest.mark.usefixtures("db")
async def test_endpoint_needs_payments_permission():
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    _, request = await _setup()
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as client:
        res = await client.post(f"/api/admin/returns/{request.id}/refund")
    assert res.status_code == 401
