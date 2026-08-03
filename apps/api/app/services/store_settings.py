from __future__ import annotations

import time

from fastapi import HTTPException

from app.documents import Setting


PAYMENT_METHOD_DEFAULTS = {"razorpay": True}
NOTIFICATION_PREF_DEFAULTS = {
    "emailOrderConfirmation": True,  # placed + paid/confirmed customer emails
    "emailOrderShipped": True,
    "emailOrderDelivered": True,
    "emailAbandonedCart": True,
    "adminNewOrderAlert": True,  # staff new-order email
}

_NOTIFICATION_PREFS_CACHE: dict[str, bool] | None = None
_NOTIFICATION_PREFS_CACHE_AT = 0.0
_NOTIFICATION_PREFS_TTL_SEC = 5.0


def _invalidate_notification_prefs_cache() -> None:
    global _NOTIFICATION_PREFS_CACHE, _NOTIFICATION_PREFS_CACHE_AT
    _NOTIFICATION_PREFS_CACHE = None
    _NOTIFICATION_PREFS_CACHE_AT = 0.0


async def get_setting_preferences(key: str, defaults: dict[str, bool]) -> dict[str, bool]:
    setting = await Setting.find_one(Setting.key == key)
    stored = setting.value if setting and isinstance(setting.value, dict) else {}
    return {name: bool(stored.get(name, default)) for name, default in defaults.items()}


async def save_setting_preferences(key: str, defaults: dict[str, bool], value: dict | None) -> dict[str, bool]:
    current = await get_setting_preferences(key, defaults)
    incoming = value or {}
    updated = {
        name: bool(incoming[name]) if name in incoming else current[name]
        for name in defaults
    }
    setting = await Setting.find_one(Setting.key == key)
    if setting:
        setting.value = updated
        await setting.save()
    else:
        await Setting(key=key, value=updated).insert()
    return updated


async def get_payment_methods() -> dict[str, bool]:
    return await get_setting_preferences("payment_methods", PAYMENT_METHOD_DEFAULTS)


async def save_payment_methods(value: dict | None) -> dict[str, bool]:
    return await save_setting_preferences("payment_methods", PAYMENT_METHOD_DEFAULTS, value)


def _prefs_from_stored(stored: dict) -> dict[str, bool]:
    prefs = {
        name: bool(stored.get(name, default))
        for name, default in NOTIFICATION_PREF_DEFAULTS.items()
    }
    # Compatibility: older UI stored separate placed/confirmed toggles.
    if "emailOrderConfirmation" not in stored and (
        "emailOrderPlaced" in stored or "emailOrderConfirmed" in stored
    ):
        prefs["emailOrderConfirmation"] = bool(
            stored.get("emailOrderPlaced", True)
        ) and bool(stored.get("emailOrderConfirmed", True))
    return prefs


async def get_notification_prefs() -> dict[str, bool]:
    global _NOTIFICATION_PREFS_CACHE, _NOTIFICATION_PREFS_CACHE_AT
    now = time.monotonic()
    if (
        _NOTIFICATION_PREFS_CACHE is not None
        and now - _NOTIFICATION_PREFS_CACHE_AT < _NOTIFICATION_PREFS_TTL_SEC
    ):
        return dict(_NOTIFICATION_PREFS_CACHE)

    setting = await Setting.find_one(Setting.key == "notification_prefs")
    stored = setting.value if setting and isinstance(setting.value, dict) else {}
    prefs = _prefs_from_stored(stored)
    _NOTIFICATION_PREFS_CACHE = prefs
    _NOTIFICATION_PREFS_CACHE_AT = now
    return dict(prefs)


async def save_notification_prefs(value: dict | None) -> dict[str, bool]:
    updated = await save_setting_preferences(
        "notification_prefs", NOTIFICATION_PREF_DEFAULTS, value
    )
    global _NOTIFICATION_PREFS_CACHE, _NOTIFICATION_PREFS_CACHE_AT
    _NOTIFICATION_PREFS_CACHE = dict(updated)
    _NOTIFICATION_PREFS_CACHE_AT = time.monotonic()
    return updated


async def ensure_payment_method_enabled(payment_method: str) -> None:
    method = str(payment_method or "razorpay").lower()
    # Store is Razorpay-only — reject COD and legacy aliases.
    if method in {"cod", "cash_on_delivery", "pay_on_delivery", "magic", "razorpay_magic"}:
        raise HTTPException(status_code=400, detail="Unsupported payment method")
    enabled = await get_payment_methods()
    if method in {"razorpay", "prepaid"} and not enabled.get("razorpay", True):
        raise HTTPException(status_code=400, detail="Online payments are currently unavailable")
