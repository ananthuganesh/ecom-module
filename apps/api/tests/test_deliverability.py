from __future__ import annotations

import httpx
import pytest
from fastapi import HTTPException

from app.services import couriers, pincode_routes


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setenv("DELHIVERY_API_TOKEN", "test-token")
    monkeypatch.setenv("DELHIVERY_PICKUP_LOCATION", "Urban Aana Warehouse")
    couriers.clear_deliverability_cache()
    pincode_routes.invalidate_cache()
    yield
    couriers.clear_deliverability_cache()


@pytest.fixture
def delhivery(monkeypatch):
    """Answer Delhivery serviceability from a dict; count the calls."""
    state = {"flags": {}, "calls": 0, "status": 200}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"] += 1
        if state["status"] != 200:
            return httpx.Response(state["status"], text="down")
        pin = request.url.params.get("filter_codes")
        flags = state["flags"].get(pin)
        if flags is None:
            return httpx.Response(200, json={"delivery_codes": []})
        return httpx.Response(200, json={"delivery_codes": [{"postal_code": {"pin": int(pin), **flags}}]})

    original = httpx.AsyncClient.__init__

    def patched(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        original(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched)
    return state


async def _exclude(pin: str):
    await pincode_routes.upsert_routes([{"pincode": pin, "carrier": "delhivery"}], source="test")


# ---------------------------------------------------------------- the rules


@pytest.mark.usefixtures("db")
async def test_pincode_not_on_the_exclusion_list_ships_with_dtdc(delhivery):
    result = await couriers.deliverability("682001")
    assert result == {"deliverable": True, "pincode": "682001", "carrier": "dtdc"}
    # DTDC has no API to ask, so nothing is called.
    assert delhivery["calls"] == 0


@pytest.mark.usefixtures("db")
async def test_excluded_pincode_delhivery_serves(delhivery):
    await _exclude("121014")
    delhivery["flags"]["121014"] = {"pre_paid": "Y", "cod": "Y"}
    result = await couriers.deliverability("121014")
    assert result["deliverable"] is True
    assert result["carrier"] == "delhivery"


@pytest.mark.usefixtures("db")
async def test_excluded_pincode_neither_carrier_serves(delhivery):
    await _exclude("121014")
    result = await couriers.deliverability("121014")  # Delhivery: not in list
    assert result["deliverable"] is False
    assert "don't deliver" in result["reason"]


@pytest.mark.usefixtures("db")
async def test_cod_only_pincode_is_not_deliverable_for_a_prepaid_store(delhivery):
    await _exclude("121014")
    delhivery["flags"]["121014"] = {"pre_paid": "N", "cod": "Y"}
    assert (await couriers.deliverability("121014"))["deliverable"] is False


@pytest.mark.parametrize("bad", ["", None, "12", "abcdef", "1234567"])
@pytest.mark.usefixtures("db")
async def test_invalid_pincode_is_refused(bad, delhivery):
    result = await couriers.deliverability(bad)
    assert result["deliverable"] is False
    assert result["pincode"] is None


# ---------------------------------------------------------------- failing open


@pytest.mark.usefixtures("db")
async def test_carrier_outage_is_unknown_not_refused(delhivery):
    """An unreachable API must never turn into a lost sale."""
    await _exclude("121014")
    delhivery["status"] = 503
    result = await couriers.deliverability("121014")
    assert result["deliverable"] is None


@pytest.mark.usefixtures("db")
async def test_unconfigured_delhivery_is_unknown(monkeypatch, delhivery):
    from app.config import get_settings

    monkeypatch.delenv("DELHIVERY_API_TOKEN", raising=False)
    monkeypatch.setattr(get_settings(), "delhivery_api_token", "", raising=False)
    await _exclude("121014")
    assert (await couriers.deliverability("121014"))["deliverable"] is None


# ---------------------------------------------------------------- caching


@pytest.mark.usefixtures("db")
async def test_definite_answers_are_cached(delhivery):
    await _exclude("121014")
    delhivery["flags"]["121014"] = {"pre_paid": "Y"}
    await couriers.deliverability("121014")
    await couriers.deliverability("121014")
    await couriers.deliverability("121014")
    assert delhivery["calls"] == 1


@pytest.mark.usefixtures("db")
async def test_outages_are_not_cached(delhivery):
    """Otherwise a blip would keep answering "unknown" for six hours."""
    await _exclude("121014")
    delhivery["status"] = 503
    assert (await couriers.deliverability("121014"))["deliverable"] is None

    delhivery["status"] = 200
    delhivery["flags"]["121014"] = {"pre_paid": "Y"}
    assert (await couriers.deliverability("121014"))["deliverable"] is True


# ---------------------------------------------------------------- order creation


@pytest.mark.usefixtures("db")
async def test_order_to_an_undeliverable_pincode_is_refused(delhivery):
    from app.routers.orders import _assert_deliverable

    await _exclude("121014")
    with pytest.raises(HTTPException) as exc:
        await _assert_deliverable({"postalCode": "121014"})
    assert exc.value.status_code == 400
    assert "don't deliver" in str(exc.value.detail)


@pytest.mark.usefixtures("db")
async def test_order_goes_through_during_an_outage(delhivery):
    from app.routers.orders import _assert_deliverable

    await _exclude("121014")
    delhivery["status"] = 503
    await _assert_deliverable({"pincode": "121014"})  # does not raise


@pytest.mark.usefixtures("db")
async def test_order_to_a_normal_pincode_goes_through(delhivery):
    from app.routers.orders import _assert_deliverable

    await _assert_deliverable({"postalCode": "682001"})


# ---------------------------------------------------------------- public endpoint


@pytest.mark.usefixtures("db")
async def test_endpoint_hides_the_carrier_from_shoppers(delhivery):
    from app.routers.shipping import deliverable

    await _exclude("121014")
    delhivery["flags"]["121014"] = {"pre_paid": "Y"}
    body = await deliverable("121014", None)
    assert body == {"pincode": "121014", "deliverable": True, "reason": None}
    assert "carrier" not in body


@pytest.mark.usefixtures("db")
async def test_endpoint_explains_a_refusal(delhivery):
    from app.routers.shipping import deliverable

    await _exclude("121014")
    body = await deliverable("121014", None)
    assert body["deliverable"] is False
    assert body["reason"]
