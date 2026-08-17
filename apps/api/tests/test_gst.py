import pytest

from app.services.gst import (
    gst_rate_for_unit_price,
    resolve_state_code,
    split_cgst_sgst_igst,
    taxable_and_tax,
)


def test_gst_slabs():
    assert gst_rate_for_unit_price(2500) == 5.0
    assert gst_rate_for_unit_price(2500.01) == 18.0
    assert gst_rate_for_unit_price(999) == 5.0


def test_inclusive_split():
    taxable, tax = taxable_and_tax(1180, 18, inclusive=True)
    assert taxable == 1000.0
    assert tax == 180.0


def test_exclusive_split():
    taxable, tax = taxable_and_tax(1000, 18, inclusive=False)
    assert taxable == 1000.0
    assert tax == 180.0


def test_rejects_negative_amount():
    with pytest.raises(ValueError):
        taxable_and_tax(-1, 5, inclusive=True)


def test_kerala_intra_state_split():
    split = split_cgst_sgst_igst(18.0, "kerala", "32")
    assert split["igst"] == 0.0
    assert split["cgst"] + split["sgst"] == 18.0


def test_inter_state_igst():
    split = split_cgst_sgst_igst(18.0, "kerala", "maharashtra")
    assert split == {"cgst": 0.0, "sgst": 0.0, "igst": 18.0}


def test_state_code_lookup():
    assert resolve_state_code("Kerala") == "32"
    assert resolve_state_code("07") == "07"
