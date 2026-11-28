"""Storefront shipping profiles and pincode-based rates."""

from __future__ import annotations

from app.documents import Setting

DEFAULT_SHIPPING_SETTINGS = {
    "estimatedDeliveryEnabled": False,
    "profiles": [
        {
            "id": "default",
            "name": "General profile",
            "isDefault": True,
            "appliesTo": "all_products",
            "zones": [
                {"name": "Local", "countries": ["India"], "rate": 0, "rateType": "flat"},
                {"name": "Rest of India", "countries": ["India"], "rate": 49, "rateType": "flat"},
            ],
        }
    ],
    "packages": [
        {
            "id": "box-1",
            "name": "Standard box",
            "lengthCm": 30,
            "widthCm": 20,
            "heightCm": 10,
            "weightKg": 0.5,
        }
    ],
}


async def get_shipping_settings() -> dict:
    s = await Setting.find_one(Setting.key == "shipping_settings")
    if s and isinstance(s.value, dict):
        merged = {**DEFAULT_SHIPPING_SETTINGS, **s.value}
    else:
        merged = dict(DEFAULT_SHIPPING_SETTINGS)
    merged.pop("codFee", None)
    merged.pop("carrierAccounts", None)
    return merged


def rate_for_zip(settings: dict, zipcode: str, country: str = "IN") -> tuple[bool, float]:
    """Return (serviceable, fee_inr). Prefer pincode-specific zones over catch-all zones."""
    profiles = settings.get("profiles") or []
    country_norm = (country or "IN").upper()
    is_india = country_norm in ("IN", "IND", "INDIA")
    z = str(zipcode or "").strip()
    catchall_rates: list[float] = []

    for profile in profiles:
        zones = profile.get("zones") or []
        for zone in zones:
            countries = [str(c).lower() for c in (zone.get("countries") or [])]
            if countries:
                india_zone = any(c in ("india", "in", "ind") or "india" in c for c in countries)
                if is_india and not india_zone:
                    continue
                if not is_india and india_zone and not any(c == country_norm.lower() for c in countries):
                    continue
            rate = float(zone.get("rate") or 0)
            pincodes = zone.get("pincodes") or zone.get("zipcodes") or []
            if not pincodes:
                catchall_rates.append(rate)
                continue
            for entry in pincodes:
                if isinstance(entry, dict):
                    start = str(entry.get("from") or entry.get("start") or "")
                    end = str(entry.get("to") or entry.get("end") or "")
                    if start and end and start <= z <= end:
                        return True, rate
                elif str(entry) == z:
                    return True, rate

    if catchall_rates:
        return True, catchall_rates[0]
    if is_india and not profiles:
        return True, 0.0
    if is_india and profiles and not z:
        return False, 0.0
    return False, 0.0
