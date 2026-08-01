"""DTDC ECOM RATE 7D (Surface) — estimated shipping cost (mirrors apps/web/utils/dtdcEstCost.js)."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from app.documents import Order

DTDC_UNIT_WEIGHT_KG = 0.5
DTDC_BOX_MAX_UNITS = 3

SURFACE_7D = {
    "kerala": {"base500": 58, "add500": 27},
    "south": {"base500": 66, "add500": 33},
    "metro": {"base500": 78, "add500": 44},
    "roi": {"base500": 86, "add500": 51},
    "jk": {"base500": 100, "add500": 66},
}

SOUTH_STATES = {
    "tamil nadu",
    "tn",
    "karnataka",
    "ka",
    "andhra pradesh",
    "ap",
    "telangana",
    "tl",
    "tg",
    "goa",
}

METRO_STATES = {
    "delhi",
    "nct of delhi",
    "maharashtra",
    "west bengal",
    "gujarat",
}

METRO_CITIES = {
    "mumbai",
    "delhi",
    "new delhi",
    "kolkata",
    "calcutta",
    "ahmedabad",
    "amdavad",
    "pune",
    "bombay",
}


def _norm(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def dtdc_zone_from_address(addr: dict | None) -> str | None:
    addr = addr or {}
    state = _norm(addr.get("state") or addr.get("stateName"))
    city = _norm(addr.get("city"))
    if not state and not city:
        return None
    if state in {"kerala", "kl"}:
        return "kerala"
    if state in {"jammu and kashmir", "jammu & kashmir", "j&k", "jk"}:
        return "jk"
    if state in SOUTH_STATES:
        return "south"
    if city in METRO_CITIES or state in METRO_STATES:
        return "metro"
    return "roi"


def order_unit_count(order: Order | dict) -> int:
    if isinstance(order, Order):
        items = order.items or []
        total = 0
        for item in items:
            try:
                q = int(getattr(item, "quantity", 0) or 0)
            except (TypeError, ValueError):
                q = 0
            if q > 0:
                total += q
        return total

    items = order.get("items") or order.get("orderItems") or []
    total = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        raw = item.get("quantity")
        if raw is None:
            raw = item.get("qty")
        try:
            q = int(raw or 0)
        except (TypeError, ValueError):
            q = 0
        if q > 0:
            total += q
    return total


def chargeable_weight_kg(units: int) -> float:
    u = max(0, int(units or 0))
    return u * DTDC_UNIT_WEIGHT_KG


def boxes_needed(units: int) -> int:
    u = max(0, int(units or 0))
    if u <= 0:
        return 0
    return (u + DTDC_BOX_MAX_UNITS - 1) // DTDC_BOX_MAX_UNITS


def surface_7d_cost(weight_kg: float, zone: str) -> float | None:
    rates = SURFACE_7D.get(zone)
    if not rates:
        return None
    kg = float(weight_kg or 0)
    if kg <= 0:
        return None
    slabs = max(1, math.ceil(kg / DTDC_UNIT_WEIGHT_KG))
    return float(rates["base500"] + (slabs - 1) * rates["add500"])


def estimate_dtdc_surface_cost(order: Order | dict) -> dict[str, Any]:
    units = order_unit_count(order)
    weight_kg = chargeable_weight_kg(units)
    boxes = boxes_needed(units)
    if isinstance(order, Order):
        addr = order.shippingAddress or {}
    else:
        addr = order.get("shippingAddress") or {}
    zone = dtdc_zone_from_address(addr if isinstance(addr, dict) else {})
    amount = surface_7d_cost(weight_kg, zone) if zone and units > 0 else None
    return {
        "amount": amount,
        "zone": zone,
        "units": units,
        "weightKg": weight_kg,
        "boxes": boxes,
    }


def apply_dtdc_est_cost(order: Order) -> bool:
    """Compute est. courier cost onto the order. Returns True if persisted fields changed."""
    est = estimate_dtdc_surface_cost(order)
    amount = est.get("amount")
    amount_f = float(amount) if amount is not None else None
    changed = False

    prev = order.dtdcEstCost
    if amount_f is None:
        if prev is not None:
            order.dtdcEstCost = None
            changed = True
    elif prev is None or abs(float(prev) - amount_f) > 0.001:
        order.dtdcEstCost = amount_f
        changed = True

    details = dict(order.transactionDetails or {})
    meta = {
        "amount": amount_f,
        "zone": est.get("zone"),
        "units": est.get("units"),
        "weightKg": est.get("weightKg"),
        "boxes": est.get("boxes"),
        "calculatedAt": datetime.utcnow().isoformat(),
    }
    prev_meta = details.get("dtdcEst") if isinstance(details.get("dtdcEst"), dict) else {}
    if (
        prev_meta.get("amount") != meta["amount"]
        or prev_meta.get("zone") != meta["zone"]
        or prev_meta.get("units") != meta["units"]
        or changed
    ):
        details["dtdcEst"] = meta
        order.transactionDetails = details
        changed = True

    return changed


async def ensure_dtdc_est_cost(order: Order, *, save: bool = True) -> Order:
    """Recalculate est. cost; optionally save when it changes."""
    if apply_dtdc_est_cost(order) and save:
        order.updatedAt = datetime.utcnow()
        try:
            await order.save()
        except Exception:
            pass
    return order
