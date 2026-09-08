"""Delhivery B2C (Last Mile) APIs — mirrors the surface of `app.services.dtdc`.

Docs: https://delhivery-express-api-doc.readme.io/reference/introduction-1
Auth is a single account token sent as `Authorization: Token <token>` on every call.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

import httpx
from bson import ObjectId
from fastapi import HTTPException

from app.config import get_settings
from app.documents import Order, Product, Setting, User, Warehouse
from app.services.dtdc_est_cost import chargeable_weight_kg, order_unit_count

# Delhivery issues separate staging and production tokens; ours is a production
# token, so there is one base URL. Point this at staging-express.delhivery.com
# if a sandbox token is ever issued.
API_BASE = "https://track.delhivery.com"
SETTING_KEY = "delhivery_settings"

CARRIER_CODE = "delhivery"
CARRIER_LABEL = "Delhivery"


def _env_delhivery() -> dict[str, Any]:
    settings = get_settings()
    return {
        "apiToken": (os.environ.get("DELHIVERY_API_TOKEN") or settings.delhivery_api_token or "").strip(),
        # Must match the warehouse name registered with Delhivery *exactly* (case sensitive).
        "pickupLocation": (
            os.environ.get("DELHIVERY_PICKUP_LOCATION") or settings.delhivery_pickup_location or ""
        ).strip(),
    }


async def get_delhivery_settings() -> dict:
    """Merge DB settings with env. Non-empty env values win (source of truth for secrets)."""
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    db = dict(s.value) if s and isinstance(s.value, dict) else {}
    out = {**db}
    for key, value in _env_delhivery().items():
        if value:
            out[key] = value
    return out


async def require_delhivery_creds() -> dict:
    cfg = await get_delhivery_settings()
    if not str(cfg.get("apiToken") or "").strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Delhivery is not configured. Set DELHIVERY_API_TOKEN and "
                "DELHIVERY_PICKUP_LOCATION in env (or Settings → Shipping)."
            ),
        )
    return cfg


def is_configured_sync(cfg: dict) -> bool:
    return bool(str(cfg.get("apiToken") or "").strip())


def _headers(token: str, *, accept: str = "application/json") -> dict[str, str]:
    return {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
        "Accept": accept,
    }


def _addr_field(addr: dict, *keys: str, default: str = "") -> str:
    for k in keys:
        v = addr.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return default


def _digits(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


# --------------------------------------------------------------------------
# Serviceability
# --------------------------------------------------------------------------


def _parse_serviceability(data: Any, pincode: str) -> dict[str, Any]:
    """Normalize the /c/api/pin-codes payload into flat flags."""
    codes = (data or {}).get("delivery_codes") if isinstance(data, dict) else None
    if not isinstance(codes, list) or not codes:
        return {
            "carrier": CARRIER_CODE,
            "pincode": pincode,
            "serviceable": False,
            "reason": "Pincode not in Delhivery's serviceable list",
        }
    entry = codes[0].get("postal_code") if isinstance(codes[0], dict) else None
    if not isinstance(entry, dict):
        return {
            "carrier": CARRIER_CODE,
            "pincode": pincode,
            "serviceable": False,
            "reason": "Unexpected serviceability payload",
        }

    def flag(name: str) -> bool:
        return str(entry.get(name) or "").strip().upper() == "Y"

    return {
        "carrier": CARRIER_CODE,
        "pincode": str(entry.get("pin") or pincode),
        "serviceable": flag("pre_paid") or flag("cod") or flag("cash"),
        "prepaid": flag("pre_paid"),
        "cod": flag("cod") or flag("cash"),
        "pickup": flag("pickup"),
        # Out-of-delivery-area: serviceable but slower and usually surcharged.
        "oda": flag("is_oda"),
        "district": entry.get("district") or "",
        "stateCode": entry.get("state_code") or "",
        "sortCode": entry.get("sort_code") or "",
        "maxAmount": entry.get("max_amount"),
        "maxWeight": entry.get("max_weight"),
    }


async def check_serviceability(pincode: str, cfg: dict | None = None) -> dict[str, Any]:
    """Ask Delhivery whether a pincode is serviceable. Never raises for a plain 'no'."""
    pin = _digits(pincode)
    if len(pin) != 6:
        raise HTTPException(status_code=400, detail="A 6-digit pincode is required")
    cfg = cfg or await require_delhivery_creds()

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{API_BASE}/c/api/pin-codes/json/",
            headers=_headers(str(cfg["apiToken"])),
            params={"filter_codes": pin},
        )
        if resp.status_code == 401:
            raise HTTPException(status_code=502, detail="Delhivery rejected the API token")
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Delhivery serviceability check failed: {resp.text[:300]}",
            )
        data = resp.json() if resp.content else {}

    return _parse_serviceability(data, pin)


# --------------------------------------------------------------------------
# Manifest / order creation
# --------------------------------------------------------------------------


async def _pickup_location(cfg: dict) -> dict[str, Any]:
    """Registered Delhivery warehouse. The name must match theirs exactly."""
    name = str(cfg.get("pickupLocation") or "").strip()
    if not name:
        raise HTTPException(
            status_code=400,
            detail=(
                "Delhivery pickup location is not set. It must match the warehouse name "
                "registered with Delhivery exactly (DELHIVERY_PICKUP_LOCATION)."
            ),
        )
    return {"name": name}


async def _return_details() -> dict[str, str]:
    """Return address for RTO — falls back to the default warehouse / company profile."""
    profile: dict = {}
    s = await Setting.find_one(Setting.key == "company_profile")
    if s and isinstance(s.value, dict):
        profile = s.value

    wh = await Warehouse.find_one(Warehouse.isDefault == True)  # noqa: E712
    if not wh:
        wh = await Warehouse.find_one(Warehouse.isActive == True)  # noqa: E712

    phone = _digits(
        (os.environ.get("ORIGIN_PHONE") or "").strip() or profile.get("phone") or ""
    )
    return {
        "return_name": (os.environ.get("ORIGIN_NAME") or "").strip()
        or (wh.name if wh else None)
        or profile.get("tradeName")
        or profile.get("legalName")
        or "Urban Aana",
        "return_add": (os.environ.get("ORIGIN_ADDRESS") or "").strip()
        or (wh.addressLine1 if wh and wh.addressLine1 else None)
        or profile.get("addressLine1")
        or "",
        "return_city": (os.environ.get("ORIGIN_CITY") or "").strip()
        or (wh.city if wh and wh.city else None)
        or profile.get("city")
        or "",
        "return_state": (os.environ.get("ORIGIN_STATE") or "").strip()
        or (wh.stateName if wh and wh.stateName else None)
        or profile.get("stateName")
        or "",
        "return_pin": (os.environ.get("ORIGIN_PINCODE") or "").strip()
        or (wh.pincode if wh and wh.pincode else None)
        or profile.get("pincode")
        or "",
        "return_country": profile.get("country") or "India",
        "return_phone": phone[-10:] if len(phone) >= 10 else "",
    }


async def _package_defaults() -> dict[str, float]:
    s = await Setting.find_one(Setting.key == "shipping_settings")
    packages = []
    if s and isinstance(s.value, dict):
        packages = s.value.get("packages") or []
    pkg = packages[0] if packages else {}
    return {
        "length": float(pkg.get("lengthCm") or 30),
        "width": float(pkg.get("widthCm") or 20),
        "height": float(pkg.get("heightCm") or 10),
        "weight": float(pkg.get("weightKg") or 0.5),
    }


def _sanitize(value: Any) -> str:
    """Delhivery rejects &, #, %, ; and backslash in the payload."""
    text = str(value or "")
    for bad in ("&", "#", "%", ";", "\\"):
        text = text.replace(bad, " ")
    return " ".join(text.split())


async def build_shipment_payload(order: Order, user: User | None, cfg: dict) -> dict[str, Any]:
    addr = order.shippingAddress or {}
    phone = _digits(_addr_field(addr, "phone", "contact", default=(user.phone if user else "") or ""))
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Customer phone required for Delhivery shipment")

    pin = _digits(_addr_field(addr, "postalCode", "pincode", "zipcode"))
    if len(pin) != 6:
        raise HTTPException(status_code=400, detail="A valid 6-digit destination pincode is required")

    dims = await _package_defaults()
    units = order_unit_count(order)
    weight_kg = max(float(dims["weight"]), chargeable_weight_kg(units) or 0.0)

    descriptions: list[str] = []
    hsn_codes: list[str] = []
    for index, item in enumerate(order.items or [], start=1):
        product = None
        if item.productId and ObjectId.is_valid(str(item.productId)):
            product = await Product.get(ObjectId(str(item.productId)))
        name = (getattr(item, "productName", None) or "").strip() or (
            (product.productName if product else None) or f"Item-{index}"
        )
        descriptions.append(_sanitize(name))
        if product and getattr(product, "hsnCode", None):
            hsn_codes.append(str(product.hsnCode).strip())

    gstin = ""
    company = await Setting.find_one(Setting.key == "company_profile")
    if company and isinstance(company.value, dict):
        gstin = str(company.value.get("gstin") or "").strip()

    is_cod = str(order.paymentMethod or "").strip().lower() in ("cod", "cash on delivery")
    declared = float(order.finalPrice or order.total or 0)

    shipment: dict[str, Any] = {
        # Blank waybill lets Delhivery assign one at manifest time.
        "waybill": "",
        "order": str(order.orderNumber or order.id),
        "order_date": (order.createdAt or datetime.utcnow()).strftime("%Y-%m-%d %H:%M:%S"),
        "payment_mode": "COD" if is_cod else "Prepaid",
        "cod_amount": str(round(declared, 2)) if is_cod else "0",
        "total_amount": str(round(declared, 2)),
        "name": _sanitize(_addr_field(addr, "name", default=(user.name if user else "") or "Customer")),
        "add": _sanitize(
            " ".join(
                part
                for part in (
                    _addr_field(addr, "address", "street", "house", "line1"),
                    _addr_field(addr, "address2", "line2"),
                )
                if part
            )
            or "Address"
        ),
        "city": _sanitize(_addr_field(addr, "city")),
        "state": _sanitize(_addr_field(addr, "state")),
        "country": _addr_field(addr, "country", default="India"),
        "phone": phone[-10:],
        "pin": pin,
        "products_desc": _sanitize(", ".join(descriptions) or "Order")[:120],
        "quantity": str(max(1, units)),
        # Delhivery expects grams.
        "weight": str(int(round(weight_kg * 1000))),
        "shipment_length": dims["length"],
        "shipment_width": dims["width"],
        "shipment_height": dims["height"],
        "seller_name": _sanitize((company.value or {}).get("tradeName") if company else "") or "Urban Aana",
        "seller_inv": str(order.invoiceNumber or order.orderNumber or "")[:40],
        "shipping_mode": str(cfg.get("shippingMode") or "Surface"),
    }
    if gstin:
        shipment["seller_gst_tin"] = gstin
    if hsn_codes:
        shipment["hsn_code"] = ",".join(dict.fromkeys(hsn_codes))[:120]

    shipment.update(await _return_details())

    return {
        "pickup_location": await _pickup_location(cfg),
        "shipments": [shipment],
    }


def _extract_package(data: Any) -> dict[str, Any] | None:
    if not isinstance(data, dict):
        return None
    packages = data.get("packages")
    if isinstance(packages, list) and packages and isinstance(packages[0], dict):
        return packages[0]
    return None


def _create_error(data: Any, package: dict | None, fallback: str) -> str:
    """Delhivery reports failures in `rmk`, `error`, or per-package `remarks`."""
    if isinstance(package, dict):
        remarks = package.get("remarks")
        if isinstance(remarks, list) and remarks:
            joined = "; ".join(str(r) for r in remarks if r)
            if joined:
                return joined[:500]
        if package.get("remarks"):
            return str(package["remarks"])[:500]
    if isinstance(data, dict):
        for key in ("rmk", "error", "message"):
            val = data.get(key)
            if isinstance(val, list) and val:
                return "; ".join(str(v) for v in val if v)[:500]
            if isinstance(val, str) and val.strip():
                return val.strip()[:500]
    return fallback


async def create_consignment(order: Order, user: User | None = None) -> dict:
    cfg = await require_delhivery_creds()
    if order.awb:
        raise HTTPException(status_code=400, detail="Shipment already created for this order")
    if order.paymentStatus not in ("paid",):
        raise HTTPException(status_code=400, detail="Order must be paid before creating a shipment")

    payload = await build_shipment_payload(order, user, cfg)

    # Delhivery's manifest endpoint takes a form body, not a JSON body.
    body = f"format=json&data={json.dumps(payload)}"
    headers = {
        "Authorization": f"Token {cfg['apiToken']}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{API_BASE}/api/cmu/create.json", headers=headers, content=body)
        try:
            data = resp.json() if resp.content else {}
        except Exception:  # noqa: BLE001
            data = {"raw": resp.text[:500]}

    package = _extract_package(data)
    waybill = str((package or {}).get("waybill") or "").strip()
    package_ok = str((package or {}).get("status") or "").strip().lower() in ("success", "")
    booked = bool(waybill) and package_ok and data.get("success") is not False and resp.status_code < 400

    if not booked:
        message = _create_error(data, package, "Delhivery create failed")
        order.shippingStatus = "Shipping Sync Failed"
        order.transactionDetails = {
            **(order.transactionDetails or {}),
            "delhiveryError": message,
        }
        await order.save()
        raise HTTPException(status_code=502, detail=message)

    order.awb = waybill
    order.carrier = CARRIER_CODE
    order.courier = CARRIER_LABEL
    order.shippingStatus = "Awaiting Shipment"
    order.transactionDetails = {
        **(order.transactionDetails or {}),
        "delhivery": {
            "waybill": waybill,
            "order": (package or {}).get("refnum") or payload["shipments"][0]["order"],
            "uploadWbn": data.get("upload_wbn"),
            "paymentMode": payload["shipments"][0]["payment_mode"],
            "pickupLocation": payload["pickup_location"]["name"],
            "createdAt": datetime.utcnow().isoformat(),
        },
        "delhiveryError": None,
    }
    order.updatedAt = datetime.utcnow()
    await order.save()

    try:
        from app.services import erp_ops

        await erp_ops.ensure_order_invoice_safe(order, actor=user, context="delhivery_ready_to_ship")
    except Exception:
        pass
    try:
        from app.services import aisensy as aisensy_svc
        from app.services import email_resend as email_svc

        await aisensy_svc.notify_order_event_once("orderShipped", order, user)
        await email_svc.notify_order_email_once("SHIPPED", order, user)
    except Exception as exc:  # noqa: BLE001
        print(f"[Notify] orderShipped: {exc}")

    return data


async def create_reverse_pickup(order: Order, request: Any) -> dict[str, Any]:
    """Book a reverse pickup: collect from the customer, deliver to our warehouse.

    Same manifest endpoint as a forward shipment with `payment_mode: Pickup`;
    the consignee is the customer (who we collect from) and the return keys
    point at the warehouse the goods come back to.
    """
    cfg = await require_delhivery_creds()
    addr = order.shippingAddress or {}

    pin = _digits(_addr_field(addr, "postalCode", "pincode", "zipcode"))
    if len(pin) != 6:
        raise HTTPException(status_code=400, detail="A valid 6-digit pickup pincode is required")

    # A pincode Delhivery will deliver to is not necessarily one it will collect
    # from — check the pickup flag specifically before booking.
    check = await check_serviceability(pin, cfg)
    if not check.get("pickup"):
        raise HTTPException(
            status_code=400,
            detail=f"Delhivery does not offer pickup from {pin}",
        )

    phone = _digits(_addr_field(addr, "phone", "contact"))
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Customer phone required for reverse pickup")

    descriptions = [_sanitize(item.productName) for item in (request.items or [])]
    units = sum(int(item.quantity or 0) for item in (request.items or [])) or 1
    dims = await _package_defaults()
    weight_kg = max(float(dims["weight"]), chargeable_weight_kg(units) or 0.0)

    shipment: dict[str, Any] = {
        "waybill": "",
        "order": str(getattr(request, "number", "") or order.orderNumber or order.id),
        "order_date": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "payment_mode": "Pickup",
        "total_amount": str(round(float(getattr(request, "refundAmount", 0) or 0), 2)),
        "name": _sanitize(_addr_field(addr, "name", default="Customer")),
        "add": _sanitize(
            " ".join(
                part
                for part in (
                    _addr_field(addr, "address", "street", "house", "line1"),
                    _addr_field(addr, "address2", "line2"),
                )
                if part
            )
            or "Address"
        ),
        "city": _sanitize(_addr_field(addr, "city")),
        "state": _sanitize(_addr_field(addr, "state")),
        "country": _addr_field(addr, "country", default="India"),
        "phone": phone[-10:],
        "pin": pin,
        "products_desc": _sanitize(", ".join(descriptions) or "Return")[:120],
        "quantity": str(units),
        "weight": str(int(round(weight_kg * 1000))),
        "shipment_length": dims["length"],
        "shipment_width": dims["width"],
        "shipment_height": dims["height"],
    }
    shipment.update(await _return_details())

    payload = {"pickup_location": await _pickup_location(cfg), "shipments": [shipment]}
    body = f"format=json&data={json.dumps(payload)}"
    headers = {
        "Authorization": f"Token {cfg['apiToken']}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{API_BASE}/api/cmu/create.json", headers=headers, content=body)
        try:
            data = resp.json() if resp.content else {}
        except Exception:  # noqa: BLE001
            data = {"raw": resp.text[:500]}

    package = _extract_package(data)
    waybill = str((package or {}).get("waybill") or "").strip()
    package_ok = str((package or {}).get("status") or "").strip().lower() in ("success", "")
    if not (waybill and package_ok and data.get("success") is not False and resp.status_code < 400):
        raise HTTPException(
            status_code=502,
            detail=_create_error(data, package, "Delhivery reverse pickup failed"),
        )

    return {"waybill": waybill, "response": data, "pincode": pin}


# --------------------------------------------------------------------------
# Tracking
# --------------------------------------------------------------------------


def waybill_for(order: Order) -> str | None:
    awb = str(order.awb or "").strip()
    if awb:
        return awb
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    node = details.get("delhivery") if isinstance(details.get("delhivery"), dict) else {}
    return str(node.get("waybill") or "").strip() or None


def _extract_track_status(data: Any) -> str | None:
    """Pull the current status out of a Delhivery ShipmentData payload."""
    if not isinstance(data, dict):
        return None
    shipments = data.get("ShipmentData")
    if not isinstance(shipments, list) or not shipments:
        return None
    shipment = shipments[0].get("Shipment") if isinstance(shipments[0], dict) else None
    if not isinstance(shipment, dict):
        return None
    status = shipment.get("Status")
    if isinstance(status, dict):
        value = status.get("Status")
        if isinstance(value, str) and value.strip():
            return value.strip()
    value = shipment.get("Status")
    return value.strip() if isinstance(value, str) and value.strip() else None


async def track_consignment(order: Order) -> dict:
    from app.services.fulfillment import can_apply_shipping_status, map_delhivery_track_status

    cfg = await require_delhivery_creds()
    waybill = waybill_for(order)
    if not waybill:
        return {"status": order.shippingStatus or "unknown", "awb": None, "events": []}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{API_BASE}/api/v1/packages/json/",
            headers=_headers(str(cfg["apiToken"])),
            params={"waybill": waybill},
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=(data.get("Error") if isinstance(data, dict) else None) or resp.text[:300] or "Track failed",
            )

    mapped = map_delhivery_track_status(_extract_track_status(data))
    prev = order.shippingStatus
    if mapped and can_apply_shipping_status(prev, mapped):
        order.shippingStatus = mapped
        if mapped == "Delivered":
            order.isDelivered = True
            order.deliveredAt = datetime.utcnow()
            order.status = "delivered"
        await order.save()
        try:
            from app.services import erp_ops

            await erp_ops.ensure_invoice_on_fulfillment(order, context=f"delhivery:{mapped}")
        except Exception:
            pass
        if mapped == "Delivered" and prev != "Delivered":
            try:
                from app.services import aisensy as aisensy_svc
                from app.services import email_resend as email_svc

                user = await User.get(order.customerId) if order.customerId else None
                await aisensy_svc.notify_order_event_once("orderDelivered", order, user)
                await email_svc.notify_order_email_once("DELIVERED", order, user)
            except Exception as exc:  # noqa: BLE001
                print(f"[Notify] orderDelivered: {exc}")

    return data


# --------------------------------------------------------------------------
# Cancel / label
# --------------------------------------------------------------------------


async def cancel_consignment(order: Order) -> dict:
    cfg = await require_delhivery_creds()
    waybill = waybill_for(order)
    if not waybill:
        raise HTTPException(status_code=400, detail="No AWB / reference to cancel")

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(
            f"{API_BASE}/api/p/edit",
            headers=_headers(str(cfg["apiToken"])),
            json={"waybill": waybill, "cancellation": "true"},
        )
        data = resp.json() if resp.content else {}

    if resp.status_code >= 400 or data.get("status") is False:
        raise HTTPException(
            status_code=502,
            detail=data.get("remark") or resp.text[:300] or "Cancel failed",
        )

    prev = (order.transactionDetails or {}).get("delhivery")
    order.awb = None
    order.courier = None
    order.carrier = None
    order.shippingStatus = "Cancelled"
    order.transactionDetails = {
        **(order.transactionDetails or {}),
        "delhivery": None,
        "delhiveryCancelled": {
            "waybill": waybill,
            "previous": prev,
            "cancelledAt": datetime.utcnow().isoformat(),
            "response": data,
        },
    }
    order.updatedAt = datetime.utcnow()
    await order.save()
    return data


async def label_pdf_bytes(order: Order) -> bytes:
    """Packing slip as PDF bytes.

    Delhivery never serves the PDF inline: `/api/p/packing_slip` always answers
    JSON (and rejects an `Accept: application/pdf` request outright). With
    `pdf=true` the JSON carries a short-lived presigned S3 link, which is what
    actually holds the label, so this is a two-hop fetch.
    """
    cfg = await require_delhivery_creds()
    waybill = waybill_for(order)
    if not waybill:
        raise HTTPException(status_code=400, detail="No AWB / reference for label")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"{API_BASE}/api/p/packing_slip",
            headers=_headers(str(cfg["apiToken"])),
            params={"wbns": waybill, "pdf": "true", "pdf_size": "4R"},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=resp.text[:300] or "Label download failed")

        try:
            data = resp.json() if resp.content else {}
        except Exception:  # noqa: BLE001
            data = {}

        package = _extract_package(data)
        link = str((package or {}).get("pdf_download_link") or "").strip()
        if not link:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Delhivery returned no packing-slip PDF link for this waybill. "
                    "Print the label from the Delhivery panel."
                ),
            )

        # Presigned URL — must not carry our Authorization header.
        pdf = await client.get(link, follow_redirects=True)
        if pdf.status_code >= 400:
            raise HTTPException(status_code=502, detail="Delhivery label link could not be downloaded")
        content = pdf.content or b""

    if content[:4] != b"%PDF":
        raise HTTPException(status_code=502, detail="Delhivery label was not a PDF")
    return content


# --------------------------------------------------------------------------
# Warehouse + pickup (one-time / operational helpers)
# --------------------------------------------------------------------------


async def register_warehouse(payload: dict) -> dict:
    """Create the pickup location Delhivery will collect from (one-time setup)."""
    cfg = await require_delhivery_creds()
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(
            f"{API_BASE}/api/backend/clientwarehouse/create/",
            headers=_headers(str(cfg["apiToken"])),
            json=payload,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=str(data or resp.text)[:300])
    return data


async def create_pickup_request(
    *, pickup_date: str, pickup_time: str, expected_package_count: int
) -> dict:
    cfg = await require_delhivery_creds()
    location = (await _pickup_location(cfg))["name"]
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(
            f"{API_BASE}/fm/request/new/",
            headers=_headers(str(cfg["apiToken"])),
            json={
                "pickup_location": location,
                "pickup_date": pickup_date,
                "pickup_time": pickup_time,
                "expected_package_count": int(expected_package_count),
            },
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=str(data or resp.text)[:300])
    return data
