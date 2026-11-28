"""Changing an order's delivery address after checkout, before it ships."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Address, AdminAccount, Order, OrderItem, Role, SalesInvoice, User
from app.main import create_app
from app.security import create_access_token
from app.services import couriers, erp_ops

KARNATAKA = {
    "name": "Asha Rao",
    "phone": "9876543210",
    "house": "45 New Street, Koramangala",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560034",
}
KERALA = {**KARNATAKA, "house": "7 Marine Drive, Ernakulam", "city": "Kochi", "state": "Kerala", "pincode": "682031"}

OLD_ADDRESS = {
    "name": "Asha Rao",
    "firstName": "Asha",
    "lastName": "Rao",
    "email": "asha@example.com",
    "phone": "9876543210",
    "address": "12 MG Road, Indiranagar",
    "address2": "",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560038",
    "pincode": "560038",
    "country": "India",
}


@pytest.fixture(autouse=True)
def deliverable(monkeypatch):
    """Carrier lookup: everything deliverable unless the PIN is listed here."""
    blocked: set[str] = set()

    async def _check(pin):
        pin = str(pin or "")
        if pin in blocked:
            return {"pincode": pin, "deliverable": False, "reason": "We don't deliver to this PIN code yet."}
        return {"pincode": pin, "deliverable": True}

    monkeypatch.setattr(couriers, "deliverability", _check)
    return blocked


@pytest.fixture(autouse=True)
def _rate_limits(monkeypatch):
    from app.services import rate_limit

    async def _ok(*args, **kwargs):
        return None

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", _ok, raising=False)


def _client(token: str) -> AsyncClient:
    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {token}"
    return client


async def _staff(permissions: list[str] | None = None) -> AsyncClient:
    role = Role(name="Staff", permissions=permissions or ["*"])
    await role.insert()
    admin = AdminAccount(email="ops@example.com", name="Ops", roleId=str(role.id))
    await admin.insert()
    return _client(create_access_token(admin.id))


async def _customer(**fields) -> User:
    user = User(name="Asha Rao", phone="9876543210", email="asha@example.com", **fields)
    await user.insert()
    return user


async def _order(customer: User | None = None, **fields) -> Order:
    defaults = {
        "status": "order placed",
        "paymentStatus": "paid",
        "orderNumber": "UA1001",
        "customerId": customer.id if customer else None,
        "items": [OrderItem(productName="Tee", quantity=1, price=1000)],
        "finalPrice": 1000,
        "deliveryAmount": 49,
        "shippingAddress": dict(OLD_ADDRESS),
    }
    order = Order(**{**defaults, **fields})
    await order.insert()
    return order


# ─── Customer ────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("db")
async def test_customer_changes_address_within_same_state():
    user = await _customer()
    order = await _order(user)
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json=KARNATAKA)

    assert res.status_code == 200, res.text
    assert res.json()["addressResult"] == {"changed": True, "stateChanged": False, "invoiceUpdated": False}
    stored = await Order.get(order.id)
    addr = stored.shippingAddress
    assert addr["address"] == KARNATAKA["house"]
    assert addr["postalCode"] == addr["pincode"] == "560034"
    assert addr["email"] == "asha@example.com"  # kept from checkout
    assert addr["firstName"] == "Asha" and addr["lastName"] == "Rao"
    assert stored.deliveryAmount == 49  # fee already paid is untouched
    [change] = stored.transactionDetails["addressChanges"]
    assert change["by"] == "customer"
    assert change["from"]["postalCode"] == "560038"
    assert change["to"]["postalCode"] == "560034"


@pytest.mark.usefixtures("db")
async def test_customer_can_pick_a_saved_address():
    user = await _customer(
        addresses=[Address(id="home", name="Asha Rao", phone="9876543210", house="9 Lake View Road",
                           city="Mysuru", state="Karnataka", pincode="570001")]
    )
    order = await _order(user)
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json={"addressId": "home"})

    assert res.status_code == 200, res.text
    assert (await Order.get(order.id)).shippingAddress["city"] == "Mysuru"


@pytest.mark.usefixtures("db")
async def test_customer_cannot_move_order_to_another_state():
    user = await _customer()
    order = await _order(user)
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json=KERALA)

    assert res.status_code == 400
    assert "same state" in res.json()["detail"]
    assert (await Order.get(order.id)).shippingAddress == OLD_ADDRESS


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"awb": "D123"}, "handed to the courier"),
        ({"transactionDetails": {"delhivery": {"waybill": "W1"}}}, "handed to the courier"),
        ({"shippingStatus": "In Transit"}, "already with the courier"),
        ({"status": "delivered"}, "delivered"),
        ({"status": "cancelled"}, "cancelled"),
        ({"paymentStatus": "pending"}, "Only paid orders"),
    ],
)
async def test_customer_blocked_once_order_moves_on(fields, message):
    user = await _customer()
    order = await _order(user, **fields)
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json=KARNATAKA)

    assert res.status_code == 400
    assert message in res.json()["detail"]
    assert (await Order.get(order.id)).shippingAddress == OLD_ADDRESS


@pytest.mark.usefixtures("db")
async def test_customer_cannot_touch_someone_elses_order():
    owner = await _customer()
    other = User(name="Other", phone="9000000001", email="other@example.com")
    await other.insert()
    order = await _order(owner)
    async with _client(create_access_token(other.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json=KARNATAKA)
        bad_id = await client.put("/api/orders/not-an-id/shipping-address", json=KARNATAKA)

    assert res.status_code == 404
    assert bad_id.status_code == 404
    assert (await Order.get(order.id)).shippingAddress == OLD_ADDRESS


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({"pincode": "5600"}, "PIN code"),
        ({"house": "x"}, "street address"),
        ({"phone": "12345"}, "10-digit mobile"),
        ({"state": "Narnia"}, "Unknown state"),
    ],
)
async def test_invalid_address_rejected(patch, message):
    user = await _customer()
    order = await _order(user, shippingAddress={**OLD_ADDRESS, "phone": ""})
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json={**KARNATAKA, **patch})

    assert res.status_code == 400
    assert message in res.json()["detail"]


@pytest.mark.usefixtures("db")
async def test_undeliverable_pin_is_refused(deliverable):
    deliverable.add("560099")
    user = await _customer()
    order = await _order(user)
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(
            f"/api/orders/{order.id}/shipping-address", json={**KARNATAKA, "pincode": "560099"}
        )

    assert res.status_code == 400
    assert "deliver" in res.json()["detail"]


@pytest.mark.usefixtures("db")
async def test_same_address_again_is_a_no_op():
    user = await _customer()
    order = await _order(user)
    same = {**KARNATAKA, "house": OLD_ADDRESS["address"], "pincode": "560038", "city": "Bengaluru"}
    async with _client(create_access_token(user.id)) as client:
        res = await client.put(f"/api/orders/{order.id}/shipping-address", json=same)

    assert res.status_code == 200, res.text
    assert res.json()["addressResult"]["changed"] is False
    assert "addressChanges" not in (await Order.get(order.id)).transactionDetails


# ─── Staff ───────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("db")
async def test_staff_move_to_another_state_redoes_invoice_split(monkeypatch):
    async def _company():
        return {"stateCode": "29", "gstin": "29ABCDE1234F1Z5"}  # seller in Karnataka

    monkeypatch.setattr(erp_ops, "company_profile", _company)
    user = await _customer()
    order = await _order(user)
    invoice = await erp_ops.ensure_order_invoice(order)
    assert invoice.customerStateCode == "29"
    assert invoice.igst == 0 and invoice.cgst > 0
    tax, total = invoice.taxTotal, invoice.grandTotal

    async with await _staff() as client:
        res = await client.put("/api/admin/orders/UA1001/shipping-address", json=KERALA)

    assert res.status_code == 200, res.text
    assert res.json()["addressResult"] == {"changed": True, "stateChanged": True, "invoiceUpdated": True}
    inv = await SalesInvoice.get(invoice.id)
    assert inv.number == invoice.number
    assert inv.customerStateCode == "32"
    assert inv.cgst == 0 and inv.sgst == 0
    assert inv.igst == pytest.approx(tax)
    assert inv.grandTotal == total
    assert "Place of supply changed 29 → 32" in inv.notes
    stored = await Order.get(order.id)
    assert stored.shippingAddress["state"] == "Kerala"
    assert stored.shippingAddress["stateCode"] == "32"
    assert stored.transactionDetails["addressChanges"][-1]["actorId"] == "ops@example.com"


@pytest.mark.usefixtures("db")
async def test_staff_can_edit_unpaid_manual_orders_but_not_booked_ones():
    unpaid = await _order(None, paymentStatus="pending", orderNumber="UA2001")
    booked = await _order(None, awb="D1", carrier="dtdc", orderNumber="UA2002")
    async with await _staff() as client:
        ok = await client.put(f"/api/admin/orders/{unpaid.id}/shipping-address", json=KARNATAKA)
        refused = await client.put(f"/api/admin/orders/{booked.id}/shipping-address", json=KARNATAKA)

    assert ok.status_code == 200, ok.text
    assert refused.status_code == 400
    assert "Cancel the shipment first" in refused.json()["detail"]


@pytest.mark.usefixtures("db")
async def test_after_shipment_cancel_staff_can_edit_again():
    # What couriers.cancel_shipment leaves behind: no AWB, shippingStatus Cancelled.
    order = await _order(None, awb=None, shippingStatus="Cancelled", status="processing")
    async with await _staff() as client:
        res = await client.put(f"/api/admin/orders/{order.id}/shipping-address", json=KARNATAKA)
    assert res.status_code == 200, res.text


@pytest.mark.usefixtures("db")
async def test_staff_need_orders_write():
    order = await _order(None)
    async with await _staff(["admin.access", "orders.read"]) as client:
        res = await client.put(f"/api/admin/orders/{order.id}/shipping-address", json=KARNATAKA)
    assert res.status_code == 403
