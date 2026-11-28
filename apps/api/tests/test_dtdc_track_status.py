import pytest

from app.services.fulfillment import map_dtdc_track_status


@pytest.mark.parametrize(
    "raw",
    ["pickup_completed", "Pickup Completed", "booked_at_hub", "intransittohub", "reachedathub"],
)
def test_collected_parcels_map_to_in_transit(raw):
    # Codes Shipsy returns live after the rider collects the parcel.
    assert map_dtdc_track_status(raw) == "In Transit"


def test_pickup_not_yet_done_stays_ready_to_ship():
    assert map_dtdc_track_status("pickup_scheduled") == "Ready To Ship"
    assert map_dtdc_track_status("out_for_pickup") == "Ready To Ship"


def test_unknown_status_is_ignored():
    assert map_dtdc_track_status("something_new") is None


def test_last_scan_keeps_a_failed_attempt_reason_visible():
    from app.services.dtdc import _last_scan

    scan = _last_scan(
        {
            "events": [
                {"type": "reachedathub", "event_time": 2000, "hub_name": "AVANAVANCHERY", "customer_update": "Reached At Hub"},
                {
                    "type": "attempted",
                    "event_time": 1000,
                    "customer_update": "Undelivered",
                    "failure_reason": "RECEIVER NOT AVAILABLE/REACHABLE OVER PHONE",
                },
            ]
        }
    )
    assert scan["status"] == "Reached At Hub"
    assert scan["remark"] == "RECEIVER NOT AVAILABLE/REACHABLE OVER PHONE"
    assert scan["location"] == "AVANAVANCHERY"
