from fastapi import HTTPException

from app.documents import Setting


PAYMENT_METHOD_DEFAULTS = {"razorpay": True}
NOTIFICATION_PREF_DEFAULTS = {
    # Customer WhatsApp: AiSensy settings (master + per-event). Customer email: always on.
    "adminNewOrderAlert": True,
}


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


async def get_notification_prefs() -> dict[str, bool]:
    return await get_setting_preferences("notification_prefs", NOTIFICATION_PREF_DEFAULTS)


async def save_notification_prefs(value: dict | None) -> dict[str, bool]:
    return await save_setting_preferences("notification_prefs", NOTIFICATION_PREF_DEFAULTS, value)


async def ensure_payment_method_enabled(payment_method: str) -> None:
    method = str(payment_method or "razorpay").lower()
    if method in {"cod", "cash_on_delivery", "magic", "razorpay_magic"}:
        raise HTTPException(status_code=400, detail="Unsupported payment method")
    enabled = await get_payment_methods()
    if method in {"razorpay", "prepaid"} and not enabled.get("razorpay", True):
        raise HTTPException(status_code=400, detail="Online payments are currently unavailable")
