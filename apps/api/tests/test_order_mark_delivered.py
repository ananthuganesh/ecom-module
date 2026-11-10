"""Admin "Mark as delivered" — manual delivery when the courier never reports it."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import AdminAccount, Order, OrderItem, Role
from app.main import create_app
from app.security import create_access_token
from app.services import aisensy, email_resend, erp_ops
from app.services.shipment_status_sync import is_open_for_track


@pytest.fixture(autouse=True)
def sent(monkeypatch):
    """Record customer notifications and invoice calls instead of hitting providers."""
    calls: list[tuple] = []

    async def _wa(event, order, user=None):
        calls.append(("whatsapp", event, str(order.id)))
        return {}

    async def _email(kind, order, user=None):
        calls.append(("email", kind, str(order.id)))
        return {}

    async def _invoice(order, *, actor=None, context=""):
        calls.append(("invoice", context, str(order.id)))

    monkeypatch.setattr(aisensy, "notify_order_event_once", _wa)
    monkeypatch.setattr(email_resend, "notify_order_email_once", _email)
    monkeypatch.setattr(erp_ops, "ensure_invoice_on_fulfillment", _invoice)
    return calls


async def _staff_client(permissions: list[str] | None = None) -> AsyncClient:
    role = Role(name="Staff", permissions=permissions or ["*"])
    await role.insert()
    admin = AdminAccount(email="ops@example.com", name="Ops", roleId=str(role.id))
    await admin.insert()
    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
    return client


async def _order(**fields) -> Order:
    defaults = {
        "status": "shipped",
        "paymentStatus": "paid",
        "orderNumber": "UA1001",
        "items": [OrderItem(productName="Tee", quantity=1, price=799)],
        "finalPrice": 799,
    }
    order = Order(**{**defaults, **fields})
    await order.insert()
    return order


@pytest.mark.usefixtures("db")
async def test_marks_in_transit_awb_order_delivered_and_stops_tracking(sent):
    order = await _order(awb="D123456789", carrier="dtdc", shippingStatus="In Transit")
    assert is_open_for_track(order)

    async with await _staff_client() as client:
        res = await client.post(f"/api/admin/orders/{order.id}/mark-delivered")

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["deliveryResult"]["changed"] is True
    assert body["status"] == "delivered"

    stored = await Order.get(order.id)
    assert stored.status == "delivered"
    assert stored.shippingStatus == "Delivered"  # moved even though an AWB exists
    assert stored.isDelivered is True
    assert stored.deliveredAt is not None
    assert stored.transactionDetails["manualDelivery"]["by"] == "ops@example.com"
    assert not is_open_for_track(stored)
    oid = str(order.id)
    assert ("whatsapp", "orderDelivered", oid) in sent
    assert ("email", "DELIVERED", oid) in sent
    assert ("invoice", "admin_mark_delivered", oid) in sent


@pytest.mark.usefixtures("db")
async def test_second_call_is_a_no_op(sent):
    order = await _order()
    async with await _staff_client() as client:
        first = await client.post("/api/admin/orders/UA1001/mark-delivered")  # display number resolves too
        second = await client.post(f"/api/admin/orders/{order.id}/mark-delivered")

    assert first.status_code == 200, first.text
    assert second.status_code == 200
    assert second.json()["deliveryResult"] == {"changed": False, "alreadyDelivered": True}
    assert sum(1 for c in sent if c[0] == "whatsapp") == 1


@pytest.mark.usefixtures("db")
async def test_custom_delivery_date_is_kept_and_future_is_rejected():
    order = await _order()
    when = datetime.utcnow().replace(microsecond=0) - timedelta(days=2)
    async with await _staff_client() as client:
        future = await client.post(
            f"/api/admin/orders/{order.id}/mark-delivered",
            json={"deliveredAt": (datetime.utcnow() + timedelta(days=1)).isoformat()},
        )
        assert future.status_code == 400
        assert (await Order.get(order.id)).isDelivered is False

        res = await client.post(
            f"/api/admin/orders/{order.id}/mark-delivered",
            json={"deliveredAt": when.isoformat() + "Z"},
        )

    assert res.status_code == 200, res.text
    stored = await Order.get(order.id)
    assert stored.deliveredAt == when
    assert stored.deliveryDate == when


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"status": "cancelled"}, "cancelled order"),
        ({"status": "abandoned"}, "abandoned order"),
        ({"status": "return requested"}, "return requested order"),
        ({"status": "shipped", "shippingStatus": "Returned"}, "Shipment is Returned"),
        ({"status": "order placed", "paymentStatus": "pending"}, "Only paid orders"),
    ],
)
async def test_ineligible_orders_are_refused(fields, message, sent):
    order = await _order(**fields)
    async with await _staff_client() as client:
        res = await client.post(f"/api/admin/orders/{order.id}/mark-delivered")

    assert res.status_code == 400
    assert message in res.json()["detail"]
    assert (await Order.get(order.id)).isDelivered is False
    assert sent == []


@pytest.mark.usefixtures("db")
async def test_legacy_paid_flag_in_transaction_details_counts():
    order = await _order(paymentStatus=None, transactionDetails={"paymentStatus": "paid"})
    async with await _staff_client() as client:
        res = await client.post(f"/api/admin/orders/{order.id}/mark-delivered")
    assert res.status_code == 200, res.text


@pytest.mark.usefixtures("db")
async def test_status_dropdown_delivered_uses_same_path(sent):
    order = await _order(awb="D999", carrier="dtdc", shippingStatus="Out for Delivery")
    async with await _staff_client() as client:
        res = await client.patch(f"/api/admin/orders/{order.id}/status", json={"status": "delivered"})

    assert res.status_code == 200, res.text
    stored = await Order.get(order.id)
    assert stored.shippingStatus == "Delivered"
    assert stored.isDelivered is True
    assert sum(1 for c in sent if c[0] == "email") == 1


@pytest.mark.usefixtures("db")
async def test_bulk_delivered_skips_ineligible_orders():
    good = await _order(orderNumber="UA2001")
    bad = await _order(orderNumber="UA2002", status="cancelled")
    async with await _staff_client() as client:
        res = await client.patch(
            "/api/admin/orders/bulk-update",
            json={"ids": [str(good.id), str(bad.id)], "status": "delivered"},
        )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["updated"] == 1
    assert [s["orderNumber"] for s in body["skipped"]] == ["UA2002"]
    assert (await Order.get(good.id)).isDelivered is True
    assert (await Order.get(bad.id)).status == "cancelled"


@pytest.mark.usefixtures("db")
async def test_requires_orders_write():
    order = await _order()
    async with await _staff_client(["admin.access", "orders.read"]) as client:
        res = await client.post(f"/api/admin/orders/{order.id}/mark-delivered")
    assert res.status_code == 403
    assert (await Order.get(order.id)).isDelivered is False
