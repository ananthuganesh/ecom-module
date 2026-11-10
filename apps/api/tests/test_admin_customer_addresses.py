"""Staff edit a customer's saved addresses from the admin customer page."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Address, AdminAccount, Role, User
from app.main import create_app
from app.security import create_access_token

GOOD = {
    "name": "Asha Rao",
    "phone": "+91 98765 43210",
    "house": "12 MG Road, Indiranagar",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560038",
}


async def _staff_client(permissions: list[str], email: str = "owner@example.com") -> AsyncClient:
    role = Role(name=email, permissions=permissions)
    await role.insert()
    admin = AdminAccount(email=email, name="Staff", roleId=str(role.id))
    await admin.insert()
    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {create_access_token(admin.id)}"
    return client


async def _customer(**fields) -> User:
    user = User(name="Asha Rao", phone="9876543210", customerUrlId="100000000001", **fields)
    await user.insert()
    return user


@pytest.mark.usefixtures("db")
async def test_first_address_becomes_default_and_payload_is_admin_customer():
    user = await _customer()
    async with await _staff_client(["*"]) as client:
        res = await client.post(f"/api/admin/users/{user.id}/addresses", json=GOOD)

    assert res.status_code == 201, res.text
    data = res.json()
    assert data["_id"] == str(user.id)
    assert "ordersCount" in data  # same shape as GET /api/admin/users/{id}
    [addr] = data["addresses"]
    assert addr["isDefault"] is True
    assert addr["phone"] == "9876543210"
    assert addr["pincode"] == "560038"
    stored = await User.get(user.id)
    assert stored.addresses[0].house == GOOD["house"]


@pytest.mark.usefixtures("db")
async def test_update_by_public_customer_id_keeps_address_id_and_default():
    user = await _customer(
        addresses=[Address(id="a1", name="Asha", house="Old street 1", city="Pune", state="MH", pincode="411001", isDefault=True)]
    )
    async with await _staff_client(["*"]) as client:
        res = await client.put(
            "/api/admin/users/100000000001/addresses/a1",
            json={**GOOD, "house": "45 New Street, Koramangala"},
        )

    assert res.status_code == 200, res.text
    [addr] = res.json()["addresses"]
    assert addr["id"] == "a1"
    assert addr["house"] == "45 New Street, Koramangala"
    assert addr["isDefault"] is True
    stored = await User.get(user.id)
    assert stored.addresses[0].city == "Bengaluru"


@pytest.mark.usefixtures("db")
async def test_legacy_address_without_id_is_editable():
    user = User(name="Old", phone="9000000000")
    await user.insert()
    # Legacy row written before addresses had ids.
    await User.get_pymongo_collection().update_one(
        {"_id": user.id},
        {"$set": {"addresses": [{"house": "Legacy lane 9", "city": "Kochi", "state": "KL", "pincode": "682001"}]}},
    )
    async with await _staff_client(["*"]) as client:
        before = (await client.get(f"/api/admin/users/{user.id}")).json()
        legacy_id = before["addresses"][0]["id"]
        assert legacy_id == "legacy-0"
        res = await client.put(f"/api/admin/users/{user.id}/addresses/{legacy_id}", json=GOOD)

    assert res.status_code == 200, res.text
    [addr] = res.json()["addresses"]
    assert addr["house"] == GOOD["house"]
    assert addr["id"] and not addr["id"].startswith("legacy-")


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({"pincode": "5600"}, "PIN code"),
        ({"house": "x"}, "street address"),
        ({"city": ""}, "City and state"),
    ],
)
async def test_invalid_address_is_rejected(patch, message):
    user = await _customer()
    async with await _staff_client(["*"]) as client:
        res = await client.post(f"/api/admin/users/{user.id}/addresses", json={**GOOD, **patch})

    assert res.status_code == 400
    assert message in res.json()["detail"]
    assert (await User.get(user.id)).addresses == []


@pytest.mark.usefixtures("db")
async def test_set_default_and_delete_default_promotes_remaining():
    user = await _customer(
        addresses=[
            Address(id="a1", house="First street 1", city="Pune", state="MH", pincode="411001", isDefault=True),
            Address(id="a2", house="Second street 2", city="Pune", state="MH", pincode="411002"),
        ]
    )
    async with await _staff_client(["*"]) as client:
        res = await client.post(f"/api/admin/users/{user.id}/addresses/a2/default")
        assert res.status_code == 200
        assert [a["isDefault"] for a in res.json()["addresses"]] == [False, True]

        res = await client.delete(f"/api/admin/users/{user.id}/addresses/a2")
        assert res.status_code == 200
        [left] = res.json()["addresses"]
        assert left["id"] == "a1" and left["isDefault"] is True

        missing = await client.delete(f"/api/admin/users/{user.id}/addresses/nope")
        assert missing.status_code == 404


@pytest.mark.usefixtures("db")
async def test_read_only_staff_cannot_edit_addresses():
    user = await _customer()
    async with await _staff_client(["admin.access", "customers.read"], email="viewer@example.com") as client:
        assert (await client.get(f"/api/admin/users/{user.id}")).status_code == 200
        res = await client.post(f"/api/admin/users/{user.id}/addresses", json=GOOD)

    assert res.status_code == 403
    assert (await User.get(user.id)).addresses == []


@pytest.mark.usefixtures("db")
async def test_unknown_customer_is_404():
    async with await _staff_client(["*"]) as client:
        res = await client.post("/api/admin/users/999999999999/addresses", json=GOOD)
    assert res.status_code == 404


@pytest.mark.usefixtures("db")
async def test_customer_account_routes_still_share_the_same_rules():
    """The storefront /api/users/addresses routes now go through the same service."""
    user = await _customer()
    client = AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test")
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    async with client:
        bad = await client.post("/api/users/addresses", json={**GOOD, "pincode": "12"})
        added = await client.post("/api/users/addresses", json=GOOD)
        aid = (await client.get("/api/users/addresses")).json()[0]["id"]
        updated = await client.put(f"/api/users/addresses/{aid}", json={**GOOD, "city": "Mysuru"})
        deleted = await client.delete(f"/api/users/addresses/{aid}")

    assert bad.status_code == 400
    assert added.status_code == 200, added.text
    assert updated.status_code == 200
    assert (await User.get(user.id)).addresses == []
    assert deleted.status_code == 200
