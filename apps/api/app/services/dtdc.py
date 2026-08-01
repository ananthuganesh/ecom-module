"""DTDC / Shipsy customer consignment APIs."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import httpx
from bson import ObjectId
from fastapi import HTTPException

from app.documents import Order, Product, Setting, User, Warehouse

# Customer integration host (same as Urban Aana). app.shipsy.in rejects these API keys.
DTDC_BASE = "https://dtdcapi.shipsy.io"
SETTING_KEY = "dtdc_settings"
# Try in order (same as Urban Aana live). First success wins.
DEFAULT_SERVICE_TYPES = ("B2C PRIORITY", "B2C SMART EXPRESS")


def _env_dtdc() -> dict[str, Any]:
    service = (
        os.environ.get("DTDC_SERVICE_TYPE_ID")
        or os.environ.get("DTDC_SERVICE_TYPE")
        or ""
    ).strip()
    return {
        "apiKey": (os.environ.get("DTDC_API_KEY") or "").strip(),
        "customerCode": (os.environ.get("DTDC_CUST_CODE") or "").strip(),
        "serviceTypeId": service or DEFAULT_SERVICE_TYPES[0],
        "trackingToken": (os.environ.get("DTDC_TRACKING_TOKEN") or "").strip(),
        "loadType": (os.environ.get("DTDC_LOAD_TYPE") or "NON-DOCUMENT").strip(),
    }


async def get_dtdc_settings() -> dict:
    """Merge DB settings with env. Non-empty env values win (source of truth for secrets)."""
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    db = dict(s.value) if s and isinstance(s.value, dict) else {}
    out = {**db}
    for key, value in _env_dtdc().items():
        if value:
            out[key] = value
    if not out.get("serviceTypeId"):
        out["serviceTypeId"] = DEFAULT_SERVICE_TYPES[0]
    if not out.get("loadType"):
        out["loadType"] = "NON-DOCUMENT"
    return out


def service_type_candidates(_cfg: dict | None = None) -> list[str]:
    """Always try B2C PRIORITY first, then B2C SMART EXPRESS."""
    return list(DEFAULT_SERVICE_TYPES)


async def require_dtdc_creds() -> dict:
    cfg = await get_dtdc_settings()
    api_key = str(cfg.get("apiKey") or "").strip()
    customer_code = str(cfg.get("customerCode") or "").strip()
    if not api_key or not customer_code:
        raise HTTPException(
            status_code=400,
            detail="DTDC is not configured. Set DTDC_API_KEY and DTDC_CUST_CODE in env (or Settings → Shipping).",
        )
    return cfg


def _headers(api_key: str) -> dict[str, str]:
    return {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _addr_field(addr: dict, *keys: str, default: str = "") -> str:
    for k in keys:
        v = addr.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return default


async def _origin_details() -> dict[str, Any]:
    profile = {}
    s = await Setting.find_one(Setting.key == "company_profile")
    if s and isinstance(s.value, dict):
        profile = s.value

    wh = await Warehouse.find_one(Warehouse.isDefault == True)  # noqa: E712
    if not wh:
        wh = await Warehouse.find_one(Warehouse.isActive == True)  # noqa: E712

    name = (
        (os.environ.get("ORIGIN_NAME") or "").strip()
        or (wh.name if wh else None)
        or profile.get("tradeName")
        or profile.get("legalName")
        or "Urban Aana"
    )
    phone = (
        (os.environ.get("ORIGIN_PHONE") or "").strip()
        or profile.get("phone")
        or "9999999999"
    )
    line1 = (
        (os.environ.get("ORIGIN_ADDRESS") or "").strip()
        or (wh.addressLine1 if wh and wh.addressLine1 else None)
        or profile.get("addressLine1")
        or "Address"
    )
    line2 = profile.get("addressLine2") or ""
    city = (
        (os.environ.get("ORIGIN_CITY") or "").strip()
        or (wh.city if wh and wh.city else None)
        or profile.get("city")
        or ""
    )
    state = (
        (os.environ.get("ORIGIN_STATE") or "").strip()
        or (wh.stateName if wh and wh.stateName else None)
        or profile.get("stateName")
        or ""
    )
    pincode = (
        (os.environ.get("ORIGIN_PINCODE") or "").strip()
        or (wh.pincode if wh and wh.pincode else None)
        or profile.get("pincode")
        or ""
    )
    country = profile.get("country") or "India"

    return {
        "name": name,
        "phone": str(phone)[:15],
        "address_line_1": line1,
        "address_line_2": line2,
        "city": city,
        "state": state,
        "pincode": str(pincode),
        "country": country,
    }


def _destination_details(order: Order, user: User | None) -> dict[str, Any]:
    addr = order.shippingAddress or {}
    return {
        "name": _addr_field(addr, "name", default=(user.name if user else "") or "Customer"),
        "phone": _addr_field(addr, "phone", "contact", default=(user.phone if user else "") or "9999999999")[:15],
        "alternate_phone": "",
        "address_line_1": _addr_field(addr, "address", "street", "house", "line1", default="Address"),
        "address_line_2": _addr_field(addr, "address2", "line2"),
        "pincode": _addr_field(addr, "postalCode", "pincode", "zipcode"),
        "city": _addr_field(addr, "city"),
        "state": _addr_field(addr, "state"),
        "country": _addr_field(addr, "country", default="India"),
        "district": _addr_field(addr, "city"),
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


async def build_softdata_payload(order: Order, user: User | None, cfg: dict) -> dict[str, Any]:
    origin = await _origin_details()
    dest = _destination_details(order, user)
    dims = await _package_defaults()
    is_cod = str(order.paymentMethod or "").lower() in ("cod",) or order.paymentStatus == "pay_on_delivery"
    invoice_no = order.invoiceNumber or order.orderNumber or str(order.id)
    invoice_date = (order.createdAt or datetime.utcnow()).strftime("%Y-%m-%d")
    declared = float(order.finalPrice or order.total or 0)
    customer_ref = str(order.orderNumber or order.id)[:40]

    pieces = []
    for i, item in enumerate(order.items or [], start=1):
        product = None
        if item.productId and ObjectId.is_valid(str(item.productId)):
            product = await Product.get(ObjectId(str(item.productId)))
        name = (product.productName or product.name if product else None) or f"Item-{i}"
        sku = (product.productId if product and product.productId else None) or str(item.productId or i)
        pieces.append(
            {
                "description": str(name)[:120],
                "declared_value": str(round(float(item.price or 0) * int(item.quantity or 1), 2)),
                "weight": str(dims["weight"]),
                "height": str(dims["height"]),
                "length": str(dims["length"]),
                "width": str(dims["width"]),
                "weight_unit": "kg",
                "dimension_unit": "cm",
                "piece_product_code": str(sku)[:40],
            }
        )

    payload: dict[str, Any] = {
        "action_type": "single_pickup",
        "consignment_type": "forward",
        "movement_type": "forward",
        "load_type": cfg.get("loadType") or "NON-DOCUMENT",
        "description": pieces[0]["description"] if pieces else "Order",
        "customer_code": cfg.get("customerCode"),
        "service_type_id": cfg.get("serviceTypeId") or DEFAULT_SERVICE_TYPES[0],
        "dimension_unit": "cm",
        "length": str(dims["length"]),
        "width": str(dims["width"]),
        "height": str(dims["height"]),
        "weight_unit": "kg",
        "weight": str(dims["weight"]),
        "num_pieces": max(1, sum(int(i.quantity or 1) for i in (order.items or [])) or 1),
        "customer_reference_number": customer_ref,
        "declared_value": declared,
        "invoice_amount": str(declared),
        "invoice_number": str(invoice_no)[:40],
        "invoice_date": invoice_date,
        "origin_details": origin,
        "destination_details": dest,
        "return_details": origin,
        "pieces_detail": pieces or [
            {
                "description": "Order",
                "declared_value": str(declared),
                "weight": str(dims["weight"]),
                "height": str(dims["height"]),
                "length": str(dims["length"]),
                "width": str(dims["width"]),
                "weight_unit": "kg",
                "dimension_unit": "cm",
            }
        ],
    }

    # Leave reference_number empty so Shipsy/DTDC assigns AWB (common pattern);
    # if settings force a reference, use order id.
    if cfg.get("useOrderIdAsReference"):
        payload["reference_number"] = str(order.id)[:40]

    if is_cod:
        payload["cod_amount"] = str(declared)
        payload["cod_collection_mode"] = "cash"

    gstin = ""
    company = await Setting.find_one(Setting.key == "company_profile")
    if company and isinstance(company.value, dict):
        gstin = str(company.value.get("gstin") or "")
    if gstin:
        payload["tax_details"] = [
            {
                "cgst": "0.0",
                "sgst": "0.0",
                "igst": "0.0",
                "total_tax": "0.0",
                "sender_gstin": gstin,
            }
        ]

    return payload


async def create_consignment(order: Order, user: User | None = None) -> dict:
    cfg = await require_dtdc_creds()
    if order.awb:
        raise HTTPException(status_code=400, detail="Shipment already created for this order")

    payment_ok = (
        str(order.paymentMethod or "").lower() == "cod"
        or order.paymentStatus in ("paid", "pay_on_delivery")
    )
    if not payment_ok:
        raise HTTPException(status_code=400, detail="Order must be paid or COD before creating a shipment")

    base_payload = await build_softdata_payload(order, user, cfg)
    api_key = str(cfg["apiKey"])
    candidates = service_type_candidates()
    last_error = ""
    data: dict[str, Any] = {}
    payload = base_payload

    async with httpx.AsyncClient(timeout=60.0) as client:
        for service_type in candidates:
            payload = {**base_payload, "service_type_id": service_type}
            print(f"[DTDC] Booking order {order.orderNumber or order.id} with {service_type}")
            try:
                resp = await client.post(
                    f"{DTDC_BASE}/api/customer/integration/consignment/upload/softdata/v2",
                    headers=_headers(api_key),
                    json=payload,
                )
                data = resp.json() if resp.content else {}
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)[:500]
                print(f"[DTDC] {service_type} request failed: {last_error}")
                continue

            consignment = None
            if isinstance(data.get("data"), list) and data["data"]:
                consignment = data["data"][0]
            elif isinstance(data.get("consignments"), list) and data["consignments"]:
                consignment = data["consignments"][0]

            ref = (
                data.get("reference_number")
                or data.get("courier_partner_reference_number")
                or ""
            )
            if isinstance(consignment, dict):
                ref = (
                    consignment.get("reference_number")
                    or consignment.get("awb_number")
                    or consignment.get("courier_partner_reference_number")
                    or ref
                )

            status_ok = str(data.get("status") or "").upper() in ("", "OK", "SUCCESS")
            success_flag = data.get("success")
            consignment_ok = not isinstance(consignment, dict) or consignment.get("success") is not False
            booked = bool(ref) and consignment_ok and success_flag is not False and (
                status_ok or success_flag is True or resp.status_code < 400
            )

            if not booked:
                msg = None
                if isinstance(consignment, dict):
                    msg = consignment.get("message")
                last_error = str(
                    msg
                    or data.get("message")
                    or data.get("error")
                    or (resp.text if resp.status_code >= 400 else None)
                    or "DTDC create failed"
                )[:500]
                print(f"[DTDC] {service_type} failed: {last_error}")
                continue

            print(f"[DTDC] Success with {service_type}: {ref}")
            order.awb = str(ref)
            order.courier = (
                (consignment or {}).get("courier_partner")
                if isinstance(consignment, dict)
                else None
            ) or data.get("courier_partner") or "DTDC"
            order.shippingStatus = "Awaiting Shipment"
            order.transactionDetails = {
                **(order.transactionDetails or {}),
                "dtdc": {
                    "reference_number": ref,
                    "customer_reference_number": data.get("customer_reference_number")
                    or (
                        consignment.get("customer_reference_number")
                        if isinstance(consignment, dict)
                        else None
                    )
                    or payload.get("customer_reference_number"),
                    "courier_partner": order.courier,
                    "courier_account": data.get("courier_account")
                    or (
                        consignment.get("courier_account")
                        if isinstance(consignment, dict)
                        else None
                    ),
                    "service_type_id": service_type,
                    "createdAt": datetime.utcnow().isoformat(),
                },
                "dtdcError": None,
                "dtdcServiceType": service_type,
            }
            from app.services.dtdc_est_cost import apply_dtdc_est_cost

            apply_dtdc_est_cost(order)
            order.updatedAt = datetime.utcnow()
            await order.save()
            try:
                from app.services import erp_ops

                await erp_ops.ensure_order_invoice_safe(order, actor=user, context="dtdc_ready_to_ship")
            except Exception:
                pass
            try:
                from app.services import aisensy as aisensy_svc
                from app.services import email_resend as email_svc

                await aisensy_svc.notify_order_event_once("orderShipped", order, user)
                await email_svc.notify_order_email_once("SHIPPED", order, user)
            except Exception as exc:
                print(f"[Notify] orderShipped: {exc}")
            return {**(data if isinstance(data, dict) else {}), "service_type_id": service_type}

    order.shippingStatus = "Shipping Sync Failed"
    order.transactionDetails = {
        **(order.transactionDetails or {}),
        "dtdcError": last_error or "No applicable DTDC service types for this pincode pair",
        "dtdcTriedServices": candidates,
    }
    await order.save()
    raise HTTPException(
        status_code=502,
        detail=last_error or "No applicable DTDC service types for this pincode pair",
    )


async def track_consignment(order: Order) -> dict:
    from app.services.fulfillment import can_apply_shipping_status, map_dtdc_track_status

    cfg = await require_dtdc_creds()
    ref = order.awb or ((order.transactionDetails or {}).get("dtdc") or {}).get("reference_number")
    if not ref:
        return {"status": order.shippingStatus or "unknown", "awb": None, "events": []}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{DTDC_BASE}/api/customer/integration/consignment/track",
            headers=_headers(str(cfg["apiKey"])),
            params={"reference_number": ref},
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=data.get("message") or resp.text or "Track failed")

    raw_status = _extract_track_status(data)
    mapped = map_dtdc_track_status(raw_status)
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

            await erp_ops.ensure_invoice_on_fulfillment(order, context=f"dtdc:{mapped}")
        except Exception:
            pass
        if mapped == "Delivered" and prev != "Delivered":
            try:
                from app.services import aisensy as aisensy_svc
                from app.services import email_resend as email_svc

                user = await User.get(order.customerId) if order.customerId else None
                await aisensy_svc.notify_order_event_once("orderDelivered", order, user)
                await email_svc.notify_order_email_once("DELIVERED", order, user)
            except Exception as exc:
                print(f"[Notify] orderDelivered: {exc}")

    return data


def _extract_track_status(data: Any) -> str | None:
    """Pull the best status string from a Shipsy/DTDC track payload."""
    if not isinstance(data, dict):
        return None

    def _from_dict(obj: dict) -> str | None:
        for key in (
            "status",
            "shipment_status",
            "current_status",
            "consignment_status",
            "strCode",
            "status_code",
        ):
            val = obj.get(key)
            if isinstance(val, str) and val.strip() and val.strip().upper() not in ("OK", "SUCCESS"):
                return val.strip()
        return None

    direct = _from_dict(data)
    if direct:
        return direct

    for nest_key in ("consignment", "data", "result", "tracking"):
        nested = data.get(nest_key)
        if isinstance(nested, dict):
            found = _from_dict(nested)
            if found:
                return found

    events = data.get("events") or data.get("scans") or data.get("tracking_history")
    if isinstance(events, list) and events:
        last = events[-1]
        if isinstance(last, dict):
            found = _from_dict(last)
            if found:
                return found
            for key in ("status", "status_code", "description", "remark"):
                val = last.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()

    return None


async def cancel_consignment(order: Order) -> dict:
    cfg = await require_dtdc_creds()
    ref = order.awb or ((order.transactionDetails or {}).get("dtdc") or {}).get("reference_number")
    if not ref:
        raise HTTPException(status_code=400, detail="No AWB / reference to cancel")

    body = {
        "AWBNo": [str(ref)],
        "customerCode": cfg.get("customerCode"),
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(
            f"{DTDC_BASE}/api/customer/integration/consignment/cancel",
            headers=_headers(str(cfg["apiKey"])),
            json=body,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400 or data.get("success") is False:
            raise HTTPException(
                status_code=502,
                detail=data.get("message") or data.get("failure_reason") or resp.text or "Cancel failed",
            )

    order.shippingStatus = "Cancelled"
    order.transactionDetails = {
        **(order.transactionDetails or {}),
        "dtdcCancel": data,
    }
    order.updatedAt = datetime.utcnow()
    await order.save()
    return data


async def label_pdf_bytes(order: Order) -> bytes:
    cfg = await require_dtdc_creds()
    ref = order.awb or ((order.transactionDetails or {}).get("dtdc") or {}).get("reference_number")
    if not ref:
        raise HTTPException(status_code=400, detail="No AWB / reference for label")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(
            f"{DTDC_BASE}/api/customer/integration/consignment/shippinglabel/stream",
            headers={
                "api-key": str(cfg["apiKey"]),
                "Accept": "application/pdf",
            },
            params={
                "reference_number": ref,
                "label_code": "SHIP_LABEL_4X6",
                "label_format": "pdf",
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=resp.text[:500] or "Label download failed")
        return resp.content


async def merge_label_pdfs(pdfs: list[bytes]) -> bytes:
    from io import BytesIO

    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    for raw in pdfs:
        if not raw:
            continue
        reader = PdfReader(BytesIO(raw))
        for page in reader.pages:
            writer.add_page(page)
    if len(writer.pages) == 0:
        raise HTTPException(status_code=400, detail="No label pages to merge")
    out = BytesIO()
    writer.write(out)
    return out.getvalue()
