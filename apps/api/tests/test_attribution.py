from app.services.attribution import sanitize_attribution


def test_sanitize_none_returns_none():
    assert sanitize_attribution(None) is None
    assert sanitize_attribution({}) is None
    assert sanitize_attribution("x") is None


def test_sanitize_keeps_known_fields():
    raw = {
        "firstTouch": {
            "source": " ig ",
            "medium": "cpc",
            "campaign": "summer",
            "content": "banner",
            "term": "hijab",
            "gclid": "g1",
            "fbclid": "f1",
            "landedAt": "2026-07-01T10:00:00.000Z",
            "landingPath": "/shop?utm_source=ig",
            "evil": "drop-me",
        },
        "lastTouch": {
            "source": "google",
            "medium": "organic",
            "campaign": "",
            "landedAt": "2026-07-20T10:00:00.000Z",
            "landingPath": "/",
        },
        "extra": True,
    }
    out = sanitize_attribution(raw)
    assert out is not None
    assert "extra" not in out
    assert out["firstTouch"]["source"] == "ig"
    assert "evil" not in out["firstTouch"]
    assert out["firstTouch"]["gclid"] == "g1"
    assert "campaign" not in out["lastTouch"]  # empty dropped
    assert out["lastTouch"]["source"] == "google"


def test_sanitize_truncates_long_strings():
    long = "x" * 500
    out = sanitize_attribution({"firstTouch": {"source": long}, "lastTouch": None})
    assert out["firstTouch"]["source"] == "x" * 200
    assert out["lastTouch"] is None


def test_sanitize_both_empty_touches_returns_none():
    assert sanitize_attribution({"firstTouch": {}, "lastTouch": {}}) is None


def test_sanitize_rejects_non_string_touch_values():
    out = sanitize_attribution(
        {
            "firstTouch": {
                "source": 123,
                "medium": False,
                "campaign": "summer",
            },
            "lastTouch": None,
        }
    )
    assert out == {"firstTouch": {"campaign": "summer"}, "lastTouch": None}
