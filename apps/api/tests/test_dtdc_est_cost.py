from app.services.dtdc_est_cost import estimate_dtdc_surface_cost, surface_7d_cost


def test_surface_kerala_one_unit():
    # 0.5 kg → 1 slab → base 58
    assert surface_7d_cost(0.5, "kerala") == 58


def test_surface_kerala_two_units():
    # 1.0 kg → 2 slabs → 58 + 27
    assert surface_7d_cost(1.0, "kerala") == 85


def test_estimate_from_order_dict():
    est = estimate_dtdc_surface_cost(
        {
            "items": [{"quantity": 2}],
            "shippingAddress": {"state": "Kerala", "city": "Kochi"},
        }
    )
    assert est["zone"] == "kerala"
    assert est["units"] == 2
    assert est["amount"] == 85


def test_estimate_missing_address():
    est = estimate_dtdc_surface_cost({"items": [{"quantity": 1}], "shippingAddress": {}})
    assert est["amount"] is None
    assert est["zone"] is None
