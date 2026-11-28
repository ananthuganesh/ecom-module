"""Unpaid checkouts stay out of the admin Shipments list."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import AdminAccount, Order, OrderItem, Role
from app.main import create_app
from app.security import create_access_token


async def _admin_client() -> AsyncClient:
    role = Role(name="Owner", permissions=["*"])
    await role.insert()
    admin = AdminAccount(email="owner@example.com", name="Owner", roleId=str(role.id))
    await admin.insert()
    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
    return client


def _order(**fields) -> Order:
    return Order(items=[OrderItem(productName="Tee", quantity=1, price=799)], finalPrice=799, **fields)


@pytest.mark.usefixtures("db")
async def test_shipments_hide_unpaid_checkouts_but_keep_paid_orders():
    unpaid = _order(status="order placed", paymentStatus="pending", shippingStatus="Payment Pending",
                    transactionDetails={"checkout": "magic"})
    paid = _order(status="processing", paymentStatus="paid", shippingStatus="Ready To Ship", orderNumber="UA2001")
    await unpaid.insert()
    await paid.insert()

    async with await _admin_client() as client:
        listed = (await client.get("/api/admin/orders", params={"scope": "shipment"})).json()
        filtered = (
            await client.get("/api/admin/orders", params={"scope": "shipment", "shippingStatus": "Payment Pending"})
        ).json()
        abandoned = (await client.get("/api/admin/orders", params={"status": "abandoned"})).json()

    ids = {row["_id"] for row in listed["items"]}
    assert str(paid.id) in ids
    assert str(unpaid.id) not in ids
    assert filtered["items"] == []
    # Still reachable where it belongs.
    assert str(unpaid.id) in {row["_id"] for row in abandoned["items"]}
