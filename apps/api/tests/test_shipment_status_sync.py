from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.documents import Order
from app.services import couriers
from app.services import shipment_status_sync as sync_svc

DTDC_UNKNOWN = "Reference number is not valid"


@pytest.fixture
def carriers(monkeypatch):
    """DTDC configured; track_shipment behaviour is set per test."""

    async def _available():
        return [{"code": "dtdc", "configured": True}]

    monkeypatch.setattr(couriers, "available_carriers", _available)
    monkeypatch.setattr(couriers, "carrier_for_order", lambda order: "dtdc")

    def _install(track):
        monkeypatch.setattr(couriers, "track_shipment", track)

    return _install


async def _shipped_order(**overrides) -> Order:
    defaults = dict(
        orderNumber="UA1100",
        status="shipped",
        paymentStatus="paid",
        shippingStatus="inscan_at_hub",
        awb="7X117350491",
        transactionDetails={"importedFrom": "shopify"},
    )
    order = Order(**{**defaults, **overrides})
    await order.insert()
    return order


def _refuse(message):
    async def _track(order):
        raise HTTPException(status_code=502, detail=message)

    return _track


def test_permanent_errors_are_the_unknown_awb_answers():
    assert sync_svc.is_permanent_track_error("Reference number is not valid")
    assert sync_svc.is_permanent_track_error("WRONG_INPUT")
    assert sync_svc.is_permanent_track_error("The waybill 6341 doesn't exist")
    assert not sync_svc.is_permanent_track_error("Read timed out")
    assert not sync_svc.is_permanent_track_error("502 Bad Gateway")
    assert not sync_svc.is_permanent_track_error(None)


@pytest.mark.usefixtures("db")
async def test_unknown_awb_stops_auto_tracking_after_repeated_answers(carriers):
    carriers(_refuse(DTDC_UNKNOWN))
    order = await _shipped_order()

    for attempt in range(1, sync_svc.PERMANENT_TRACK_ERROR_LIMIT + 1):
        result = await sync_svc.sync_open_shipments_batch()
        assert result["scanned"] == 1
        assert result["errors"][0]["orderNumber"] == "UA1100"
        fresh = await Order.get(order.id)
        assert fresh.transactionDetails["trackError"]["permanentCount"] == attempt
        assert fresh.transactionDetails["dtdcLastTrackAt"]  # rotated to the back of the batch

    fresh = await Order.get(order.id)
    assert DTDC_UNKNOWN in fresh.transactionDetails["trackingStopped"]["reason"]
    assert fresh.transactionDetails["importedFrom"] == "shopify"  # nothing else lost
    assert not sync_svc.is_open_for_track(fresh)

    # Out of the batch from now on: no more calls, no more errors.
    result = await sync_svc.sync_open_shipments_batch()
    assert result["scanned"] == 0
    assert result["errors"] == []


@pytest.mark.usefixtures("db")
async def test_temporary_errors_never_stop_tracking(carriers):
    carriers(_refuse("Read timed out"))
    order = await _shipped_order()

    for _ in range(sync_svc.PERMANENT_TRACK_ERROR_LIMIT + 2):
        await sync_svc.sync_open_shipments_batch()

    fresh = await Order.get(order.id)
    assert "trackingStopped" not in fresh.transactionDetails
    assert fresh.transactionDetails["trackError"]["permanentCount"] == 0
    assert sync_svc.is_open_for_track(fresh)


@pytest.mark.usefixtures("db")
async def test_a_successful_track_clears_the_error(carriers):
    carriers(_refuse(DTDC_UNKNOWN))
    order = await _shipped_order()
    await sync_svc.sync_open_shipments_batch()
    assert (await Order.get(order.id)).transactionDetails["trackError"]

    async def _ok(o):
        return {"status": o.shippingStatus}

    carriers(_ok)
    await sync_svc.sync_open_shipments_batch()
    fresh = await Order.get(order.id)
    assert "trackError" not in fresh.transactionDetails
    assert "trackingStopped" not in fresh.transactionDetails
