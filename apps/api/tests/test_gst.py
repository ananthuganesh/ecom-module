from app.services.gst import split_cgst_sgst_igst, taxable_and_tax


def test_taxable_inclusive_18():
    taxable, tax = taxable_and_tax(118, 18, inclusive=True)
    assert taxable == 100.0
    assert tax == 18.0


def test_taxable_exclusive_18():
    taxable, tax = taxable_and_tax(100, 18, inclusive=False)
    assert taxable == 100.0
    assert tax == 18.0


def test_taxable_zero_rate():
    taxable, tax = taxable_and_tax(50, 0, inclusive=True)
    assert taxable == 50.0
    assert tax == 0.0


def test_split_intra_state():
    parts = split_cgst_sgst_igst(18, "32", "32")
    assert parts["cgst"] == 9.0
    assert parts["sgst"] == 9.0
    assert parts["igst"] == 0.0


def test_resolve_state_code_from_name():
    from app.services.gst import resolve_state_code

    assert resolve_state_code("Kerala") == "32"
    assert resolve_state_code("27") == "27"
    assert resolve_state_code("Maharashtra") == "27"


def test_split_uses_state_names():
    from app.services.gst import split_cgst_sgst_igst

    parts = split_cgst_sgst_igst(18, "Kerala", "Kerala")
    assert parts["cgst"] == 9.0
    assert parts["sgst"] == 9.0
    assert parts["igst"] == 0.0

