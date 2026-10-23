from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.dtdc import _address_lines, _destination_details, _error_message


def test_short_line_1_folds_in_line_2():
    # UA1682: "30" alone was rejected by DTDC as too short.
    assert _address_lines("30", "Naganathapura, Rayasandra", "Bengaluru") == (
        "30, Naganathapura, Rayasandra",
        "",
    )


def test_long_line_1_is_kept():
    assert _address_lines("Flat 4B, Green Residency", "MG Road", "Kochi") == (
        "Flat 4B, Green Residency",
        "MG Road",
    )


def test_short_line_1_without_line_2_uses_city():
    assert _address_lines("12", "", "Bengaluru") == ("12, Bengaluru", "")


def test_short_city_keeps_folding_state_and_pincode():
    # "12, Kochi" is still under DTDC's minimum, so the state goes in too.
    assert _address_lines("12", "", "Kochi", "Kerala", "682001") == ("12, Kochi, Kerala", "")


def test_non_latin_line_1_uses_english_line_2():
    assert _address_lines("പുതിയ വീട്", "Near St. Mary's Church", "Kochi") == (
        "Near St. Mary's Church",
        "",
    )


def test_accented_latin_keeps_base_letters():
    assert _address_lines("Café Lane, Fort", "", "Kochi") == ("Cafe Lane, Fort", "")


def test_non_ascii_is_stripped_before_measuring():
    line1, line2 = _address_lines("३० 30", "Rayasandra Main Road", "Bengaluru")
    assert line1 == "30, Rayasandra Main Road"
    assert line2 == ""


def test_unusable_address_raises_clear_error():
    with pytest.raises(HTTPException) as exc:
        # All Malayalam strips to nothing; city and state alone aren't an address.
        _address_lines("പുതിയ വീട്", "", "Kochi", "Kerala", "682001")
    assert exc.value.status_code == 400
    assert "too short" in exc.value.detail


def test_destination_details_uses_folded_lines():
    order = SimpleNamespace(
        shippingAddress={
            "name": "Test",
            "phone": "9876543210",
            "address": "30",
            "address2": "Naganathapura, Rayasandra",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560100",
        }
    )
    dest = _destination_details(order, None)
    assert dest["address_line_1"] == "30, Naganathapura, Rayasandra"
    assert dest["address_line_2"] == ""


def test_error_message_unwraps_dtdc_error_dict():
    err = {"message": "Insufficient characters for Destination Address Line 1", "code": "WRONG_INPUT"}
    assert _error_message(err) == "Insufficient characters for Destination Address Line 1"
    assert _error_message("plain") == "plain"
    assert _error_message(None) is None
