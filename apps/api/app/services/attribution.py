"""Sanitize client attribution payloads for Order.attribution."""

from __future__ import annotations

from typing import Any

_TOUCH_KEYS = (
    "source",
    "medium",
    "campaign",
    "content",
    "term",
    "gclid",
    "fbclid",
    "landedAt",
    "landingPath",
    "referrer",
)
_MAX_LEN = 200


def _clean_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    return s[:_MAX_LEN]


def _sanitize_touch(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for key in _TOUCH_KEYS:
        cleaned = _clean_str(raw.get(key))
        if cleaned is not None:
            out[key] = cleaned
    return out or None


def sanitize_attribution(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    first = _sanitize_touch(raw.get("firstTouch"))
    last = _sanitize_touch(raw.get("lastTouch"))
    if first is None and last is None:
        return None
    return {"firstTouch": first, "lastTouch": last}
