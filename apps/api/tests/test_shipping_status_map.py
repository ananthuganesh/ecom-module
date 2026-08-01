from app.services.fulfillment import can_apply_shipping_status, map_dtdc_track_status


def test_map_dtdc_known_statuses():
    assert map_dtdc_track_status("pickup_scheduled") == "Ready To Ship"
    assert map_dtdc_track_status("PICKUP_AWAITED") == "Ready To Ship"
    assert map_dtdc_track_status("in_transit") == "In Transit"
    assert map_dtdc_track_status("out for delivery") == "Out for Delivery"
    assert map_dtdc_track_status("soft_data_upload") == "Awaiting Shipment"
    assert map_dtdc_track_status("Ready To Ship") == "Ready To Ship"
    assert map_dtdc_track_status("weird_unknown_xyz") is None
    assert map_dtdc_track_status("OK") is None


def test_no_status_regression():
    assert can_apply_shipping_status("Awaiting Shipment", "Ready To Ship")
    assert can_apply_shipping_status("Ready To Ship", "In Transit")
    assert not can_apply_shipping_status("Ready To Ship", "Awaiting Shipment")
    assert not can_apply_shipping_status("In Transit", "Ready To Ship")
    assert can_apply_shipping_status("In Transit", "Delivered")
    assert can_apply_shipping_status("Ready To Ship", "Cancelled")
    assert not can_apply_shipping_status("Ready To Ship", "pickup_awaited")  # same rank via map
    # unknown raw must not apply
    assert not can_apply_shipping_status("Awaiting Shipment", "random_carrier_code")
