"""Carrier registry — routes shipment operations to DTDC or Delhivery.

Each carrier module exposes the same coroutine surface (`create_consignment`,
`track_consignment`, `cancel_consignment`, `label_pdf_bytes`), so callers only
need the carrier code. `Order.carrier` records the choice at booking time;
orders booked before Delhivery existed have no `carrier` and are DTDC.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.documents import Order
from app.services import delhivery as delhivery_svc
from app.services import dtdc as dtdc_svc
from app.services import pincode_routes

DTDC = "dtdc"
DELHIVERY = "delhivery"
DEFAULT_CARRIER = DTDC

CARRIERS = {
    DTDC: dtdc_svc,
    DELHIVERY: delhivery_svc,
}

CARRIER_LABELS = {
    DTDC: "DTDC",
    DELHIVERY: "Delhivery",
}


def normalize(code: str | None) -> str | None:
    """Accept 'DTDC', 'Delhivery', 'delhivery_surface' etc. → a registry key."""
    text = str(code or "").strip().lower().replace("-", "_")
    if not text:
        return None
    if text in CARRIERS:
        return text
    for key in CARRIERS:
        if text.startswith(key):
            return key
    return None


def carrier_for_order(order: Order) -> str:
    """The carrier an existing shipment belongs to.

    Falls back to DTDC so orders booked before the Delhivery integration keep
    tracking, cancelling and printing through the carrier that actually has them.
    """
    explicit = normalize(getattr(order, "carrier", None))
    if explicit:
        return explicit
    explicit = normalize(getattr(order, "courier", None))
    if explicit:
        return explicit
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    if isinstance(details.get("delhivery"), dict):
        return DELHIVERY
    return DEFAULT_CARRIER


def module_for(code: str | None) -> Any:
    """Resolve a carrier module. An unrecognised non-empty code is an error, not
    a reason to quietly book with the default carrier."""
    if code is not None and str(code).strip() and normalize(code) is None:
        raise HTTPException(status_code=400, detail=f"Unknown carrier '{code}'")
    return CARRIERS[normalize(code) or DEFAULT_CARRIER]


def module_for_order(order: Order) -> Any:
    return CARRIERS[carrier_for_order(order)]


def shipment_reference(order: Order) -> str | None:
    """AWB / reference for whichever carrier holds this shipment."""
    awb = str(order.awb or "").strip()
    if awb:
        return awb
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    dtdc_node = details.get("dtdc") if isinstance(details.get("dtdc"), dict) else {}
    ref = str(dtdc_node.get("reference_number") or "").strip()
    if ref:
        return ref
    dl_node = details.get("delhivery") if isinstance(details.get("delhivery"), dict) else {}
    return str(dl_node.get("waybill") or "").strip() or None


def destination_pincode(order: Order) -> str | None:
    addr = order.shippingAddress or {}
    for field in ("postalCode", "pincode", "zipcode", "zip", "zipCode"):
        pin = pincode_routes.normalize_pincode(addr.get(field))
        if pin:
            return pin
    return None


async def suggest_carrier(pincode: str | None) -> dict[str, Any]:
    """Which carrier should handle this pincode, and why.

    A pincode on a carrier's exclusion list routes elsewhere; everything else
    goes to the default carrier.
    """
    override = await pincode_routes.carrier_for_pincode(pincode)
    if override and override in CARRIERS:
        return {
            "carrier": override,
            "label": CARRIER_LABELS[override],
            "automatic": True,
            # `override` marks the case worth telling the admin about; the plain
            # default needs no explanation in the UI.
            "override": True,
            "reason": f"{CARRIER_LABELS[DEFAULT_CARRIER]} does not deliver to this pincode",
        }
    return {
        "carrier": DEFAULT_CARRIER,
        "label": CARRIER_LABELS[DEFAULT_CARRIER],
        "automatic": True,
        "override": False,
        "reason": "",
    }


async def suggest_carrier_for_order(order: Order) -> dict[str, Any]:
    return await suggest_carrier(destination_pincode(order))


# Public tracking pages customers are sent to from emails and the account area.
TRACK_URLS = {
    DTDC: "https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb_no&strCnno={awb}",
    DELHIVERY: "https://www.delhivery.com/track/package/{awb}",
}

# Milestone timestamps are written under the booking carrier's node.
_MILESTONE_KEYS = (
    "createdAt",
    "fulfilledAt",
    "readyToShipAt",
    "shippedAt",
    "outForDeliveryAt",
    "ofdAt",
    "deliveredAt",
)


def carrier_node(order: Order) -> dict[str, Any]:
    """The booking record the holding carrier wrote, whichever key it used."""
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    for key in (carrier_for_order(order), DTDC, DELHIVERY):
        node = details.get(key)
        if isinstance(node, dict) and node:
            return node
    return {}


def track_url(order: Order) -> str | None:
    """Customer-facing tracking page for the carrier that holds the parcel."""
    awb = shipment_reference(order)
    if not awb:
        return None
    template = TRACK_URLS.get(carrier_for_order(order))
    return template.format(awb=awb) if template else None


def shipment_meta(order: Order) -> dict[str, Any]:
    """Everything downstream needs about a shipment without touching raw details.

    Callers (emails, the customer timeline, admin payloads) must not reach into
    `transactionDetails` themselves — that is how the DTDC-only assumptions got
    baked into three separate places.
    """
    node = carrier_node(order)
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    timestamps = {
        key: details.get(key) or node.get(key)
        for key in _MILESTONE_KEYS
        if details.get(key) or node.get(key)
    }
    code = carrier_for_order(order) if shipment_reference(order) else None
    return {
        "carrier": code,
        "carrierLabel": CARRIER_LABELS.get(code) if code else None,
        "awb": shipment_reference(order),
        "trackUrl": track_url(order),
        "timestamps": timestamps,
    }


async def create_shipment(order: Order, user=None, carrier: str | None = None) -> dict:
    """Book with the requested carrier, or auto-route by destination pincode.

    An explicit carrier (the admin's dropdown choice) always wins; when none is
    given the pincode routing table decides.
    """
    if carrier is None or not str(carrier).strip():
        carrier = (await suggest_carrier_for_order(order))["carrier"]
    module = module_for(carrier)
    key = normalize(carrier) or DEFAULT_CARRIER
    data = await module.create_consignment(order, user)
    # DTDC sets `courier` from its own response and predates `carrier`; stamp it
    # here so later track/cancel/label calls route back to the same carrier.
    if normalize(getattr(order, "carrier", None)) != key:
        order.carrier = key
        await order.save()
    return data


async def track_shipment(order: Order) -> dict:
    return await module_for_order(order).track_consignment(order)


async def cancel_shipment(order: Order) -> dict:
    return await module_for_order(order).cancel_consignment(order)


async def label_pdf_bytes(order: Order) -> bytes:
    return await module_for_order(order).label_pdf_bytes(order)


async def merge_label_pdfs(pdfs: list[bytes]) -> bytes:
    """Carrier-agnostic — both carriers hand back real PDF pages."""
    return await dtdc_svc.merge_label_pdfs(pdfs)


async def available_carriers() -> list[dict[str, Any]]:
    """Which carriers are configured, for the admin carrier dropdown."""
    out: list[dict[str, Any]] = []

    dtdc_cfg = await dtdc_svc.get_dtdc_settings()
    out.append(
        {
            "code": DTDC,
            "label": CARRIER_LABELS[DTDC],
            "configured": bool(
                str(dtdc_cfg.get("apiKey") or "").strip()
                and str(dtdc_cfg.get("customerCode") or "").strip()
            ),
            # DTDC's customer integration has no serviceability endpoint —
            # a bad pincode only surfaces when the consignment is booked.
            "supportsServiceability": False,
        }
    )

    delhivery_cfg = await delhivery_svc.get_delhivery_settings()
    out.append(
        {
            "code": DELHIVERY,
            "label": CARRIER_LABELS[DELHIVERY],
            "configured": delhivery_svc.is_configured_sync(delhivery_cfg),
            "supportsServiceability": True,
        }
    )
    return out


async def serviceability(pincode: str) -> list[dict[str, Any]]:
    """Per-carrier serviceability for a destination pincode.

    Only Delhivery can answer this; DTDC is reported as unknown rather than
    guessed, so the admin sees the difference instead of a false green light.
    """
    results: list[dict[str, Any]] = [
        {
            "carrier": DTDC,
            "label": CARRIER_LABELS[DTDC],
            "serviceable": None,
            "reason": "DTDC does not expose a serviceability API",
        }
    ]

    cfg = await delhivery_svc.get_delhivery_settings()
    if not delhivery_svc.is_configured_sync(cfg):
        results.append(
            {
                "carrier": DELHIVERY,
                "label": CARRIER_LABELS[DELHIVERY],
                "serviceable": None,
                "reason": "Delhivery is not configured",
            }
        )
        return results

    try:
        check = await delhivery_svc.check_serviceability(pincode, cfg)
        results.append({**check, "label": CARRIER_LABELS[DELHIVERY]})
    except HTTPException as exc:
        results.append(
            {
                "carrier": DELHIVERY,
                "label": CARRIER_LABELS[DELHIVERY],
                "serviceable": None,
                "reason": str(exc.detail),
            }
        )
    return results
