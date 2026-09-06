from __future__ import annotations

import httpx
import pytest

from app.documents import Order, OrderItem, PincodeRoute
from app.services import couriers, pincode_routes
from scripts.import_pincode_routes import DEFAULT_CSV, build_rows, read_csv

TOKEN = "test-delhivery-token"


@pytest.fixture(autouse=True)
def carrier_env(monkeypatch):
    monkeypatch.setenv("DELHIVERY_API_TOKEN", TOKEN)
    monkeypatch.setenv("DELHIVERY_PICKUP_LOCATION", "Urban Aana Warehouse")
    monkeypatch.setenv("DELHIVERY_ENV", "staging")
    pincode_routes.invalidate_cache()
    yield
    pincode_routes.invalidate_cache()


async def _order(pincode: str = "682001") -> Order:
    order = Order(
        orderNumber=f"UA-{pincode}",
        paymentStatus="paid",
        paymentMethod="razorpay",
        finalPrice=999.0,
        items=[OrderItem(productName="Tee", quantity=1)],
        shippingAddress={
            "name": "Test Customer",
            "phone": "9876543210",
            "address": "1 Main Road",
            "city": "Town",
            "state": "State",
            "postalCode": pincode,
            "country": "India",
        },
    )
    await order.insert()
    return order


# ---------------------------------------------------------------- normalizing


def test_normalize_pincode_accepts_only_six_digits():
    assert pincode_routes.normalize_pincode("682001") == "682001"
    assert pincode_routes.normalize_pincode(" 682 001 ") == "682001"
    assert pincode_routes.normalize_pincode(682001) == "682001"
    assert pincode_routes.normalize_pincode("68200") is None
    assert pincode_routes.normalize_pincode("6820011") is None
    assert pincode_routes.normalize_pincode("") is None
    assert pincode_routes.normalize_pincode(None) is None


def test_normalize_preserves_leading_zero_pincodes():
    """Excel likes to strip leading zeros — a 5-digit value must not silently pass."""
    assert pincode_routes.normalize_pincode("744101") == "744101"
    assert pincode_routes.normalize_pincode("75001") is None


# ---------------------------------------------------------------- import parsing


def test_build_rows_maps_dtdc_columns():
    source = [
        {
            "pincode": "121014",
            "br_city": "PANIPAT",
            "state": "HARYANA",
            "office_name": "IP DISPATCH PANIPAT BRANCH",
            "end_mile_tat": "4",
        }
    ]
    rows, rejected = build_rows(iter(source), "delhivery")
    assert rejected == []
    assert rows[0] == {
        "pincode": "121014",
        "carrier": "delhivery",
        "reason": "DTDC IP-dispatch pincode (not normally delivered)",
        "city": "PANIPAT",
        "state": "HARYANA",
        "branch": "IP DISPATCH PANIPAT BRANCH",
        "tatDays": 4,
    }


def test_build_rows_dedupes_and_rejects_bad_values():
    source = [
        {"pincode": "121014"},
        {"pincode": "121014"},
        {"pincode": "12"},
        {"pincode": ""},
        {"pincode": "560001"},
    ]
    rows, rejected = build_rows(iter(source), "delhivery")
    assert [r["pincode"] for r in rows] == ["121014", "560001"]
    assert rejected == ["12"]


def test_build_rows_survives_non_numeric_tat():
    rows, _ = build_rows(iter([{"pincode": "121014", "end_mile_tat": "N/A"}]), "delhivery")
    assert rows[0]["tatDays"] is None


# ---------------------------------------------------------------- bundled data


def test_bundled_csv_is_intact():
    """Guards the committed list against a truncated or Excel-mangled re-save."""
    assert DEFAULT_CSV.is_file(), f"missing {DEFAULT_CSV}"
    rows, rejected = build_rows(read_csv(DEFAULT_CSV), "delhivery")

    assert rejected == [], f"malformed pincodes in the CSV: {rejected[:5]}"
    assert len(rows) == 8730, f"expected 8730 pincodes, found {len(rows)}"
    assert all(len(r["pincode"]) == 6 and r["pincode"].isdigit() for r in rows)
    assert len({r["pincode"] for r in rows}) == len(rows), "duplicate pincodes"

    # Metros are deliberately absent — this is DTDC's exception list, not its
    # coverage list. If they ever appear, the file's meaning has changed.
    listed = {r["pincode"] for r in rows}
    for metro in ("110017", "400001", "560001", "600001", "700001", "682001"):
        assert metro not in listed, f"{metro} is a metro and should not be excluded"


# ---------------------------------------------------------------- lookup


@pytest.mark.usefixtures("db")
async def test_upsert_creates_then_updates():
    result = await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )
    assert result == {"created": 1, "updated": 0, "skipped": 0}

    again = await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )
    assert again == {"created": 0, "updated": 1, "skipped": 0}
    assert await PincodeRoute.find_all().count() == 1


@pytest.mark.usefixtures("db")
async def test_upsert_skips_malformed_rows():
    result = await pincode_routes.upsert_routes(
        [
            {"pincode": "121014", "carrier": "delhivery"},
            {"pincode": "12", "carrier": "delhivery"},
            {"pincode": "560001", "carrier": ""},
        ],
        source="dtdc-ip-dispatch",
    )
    assert result["created"] == 1
    assert result["skipped"] == 2


@pytest.mark.usefixtures("db")
async def test_carrier_for_pincode_reads_table():
    await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )
    assert await pincode_routes.carrier_for_pincode("121014") == "delhivery"
    assert await pincode_routes.carrier_for_pincode("560001") is None
    assert await pincode_routes.carrier_for_pincode("bad") is None


@pytest.mark.usefixtures("db")
async def test_clear_source_removes_only_that_import():
    await pincode_routes.upsert_routes([{"pincode": "121014", "carrier": "delhivery"}], source="a")
    await pincode_routes.upsert_routes([{"pincode": "560001", "carrier": "delhivery"}], source="b")
    removed = await pincode_routes.clear_source("a")
    assert removed == 1
    assert await pincode_routes.carrier_for_pincode("121014") is None
    assert await pincode_routes.carrier_for_pincode("560001") == "delhivery"


@pytest.mark.usefixtures("db")
async def test_cache_is_invalidated_on_write():
    assert await pincode_routes.carrier_for_pincode("121014") is None
    await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )
    # Without invalidation this would still read the empty cached map.
    assert await pincode_routes.carrier_for_pincode("121014") == "delhivery"


# ---------------------------------------------------------------- routing


@pytest.mark.usefixtures("db")
async def test_excluded_pincode_routes_to_delhivery():
    await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )
    suggestion = await couriers.suggest_carrier("121014")
    assert suggestion["carrier"] == "delhivery"
    assert suggestion["automatic"] is True
    assert suggestion["override"] is True
    assert suggestion["reason"]


@pytest.mark.usefixtures("db")
async def test_unlisted_pincode_stays_on_dtdc():
    suggestion = await couriers.suggest_carrier("560001")
    assert suggestion["carrier"] == couriers.DEFAULT_CARRIER
    # No override means nothing worth telling the admin — the UI shows no note.
    assert suggestion["override"] is False
    assert suggestion["reason"] == ""


@pytest.mark.usefixtures("db")
async def test_destination_pincode_reads_common_address_shapes():
    order = await _order("682001")
    assert couriers.destination_pincode(order) == "682001"

    order.shippingAddress = {"pincode": "110017"}
    assert couriers.destination_pincode(order) == "110017"

    order.shippingAddress = {"zipCode": "744101"}
    assert couriers.destination_pincode(order) == "744101"

    order.shippingAddress = {}
    assert couriers.destination_pincode(order) is None


@pytest.mark.usefixtures("db")
async def test_booking_without_carrier_auto_routes_to_delhivery(monkeypatch):
    """The whole point: an excluded pincode books with Delhivery, not DTDC."""
    await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )

    original = httpx.AsyncClient.__init__

    def patched(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"packages": [{"waybill": "DL777", "status": "Success"}]}
            )
        )
        original(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched)

    order = await _order("121014")
    await couriers.create_shipment(order, None)

    refreshed = await Order.get(order.id)
    assert refreshed.carrier == "delhivery"
    assert refreshed.awb == "DL777"


@pytest.mark.usefixtures("db")
async def test_explicit_carrier_overrides_the_routing_table(monkeypatch):
    """The admin dropdown must win over automatic routing."""
    await pincode_routes.upsert_routes(
        [{"pincode": "121014", "carrier": "delhivery"}], source="dtdc-ip-dispatch"
    )
    order = await _order("121014")

    called: dict = {}

    async def fake_create(o, u):
        called["carrier"] = "dtdc"
        o.awb = "DTDC1"
        await o.save()
        return {}

    monkeypatch.setattr(couriers.CARRIERS["dtdc"], "create_consignment", fake_create)
    await couriers.create_shipment(order, None, carrier="dtdc")
    assert called["carrier"] == "dtdc"

    refreshed = await Order.get(order.id)
    assert refreshed.carrier == "dtdc"
