from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.deps import AdminUser, CurrentUser
from app.documents import Order, User
from app.serializers import remap_order
from app.services import couriers
from app.services.fulfillment import mark_ready_to_ship_after_label, process_full_order_flow

router = APIRouter(prefix="/api/shipping", tags=["shipping"])


@router.post("/sync-statuses")
async def sync_statuses(body: dict, admin: AdminUser):
    """Soft-refresh DTDC tracking for selected (or open) orders; persists status changes."""
    from app.services import shipment_status_sync as sync_svc

    raw_ids = body.get("orderIds") or body.get("ids") or []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=400, detail="orderIds is required")
    if len(raw_ids) > sync_svc.SYNC_MAX_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Max {sync_svc.SYNC_MAX_IDS} orders per sync",
        )

    result = await sync_svc.sync_orders_by_ids([str(x) for x in raw_ids])
    return {
        "ok": bool(result.get("ok", True)),
        "scanned": result.get("scanned") or 0,
        "updated": result.get("updated") or [],
        "unchanged": result.get("unchanged") or 0,
        "errors": result.get("errors") or [],
        "skipped": bool(result.get("skipped")),
        "reason": result.get("reason"),
    }


@router.get("/track/{order_id}")
async def track(order_id: str, user: CurrentUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order.customerId) != str(user.id) and not user.isAdmin:
        raise HTTPException(status_code=403, detail="Not authorized")
    tracking = await couriers.track_shipment(order)
    return {"order": remap_order(order), "tracking": tracking}


@router.get("/carriers")
async def carriers(admin: AdminUser):
    """Carrier options for the admin booking dropdown."""
    return {"carriers": await couriers.available_carriers(), "default": couriers.DEFAULT_CARRIER}


@router.get("/serviceability/{pincode}")
async def serviceability(pincode: str, admin: AdminUser):
    """Per-carrier serviceability plus the auto-routed carrier for a pincode."""
    return {
        "pincode": pincode,
        "carriers": await couriers.serviceability(pincode),
        "suggested": await couriers.suggest_carrier(pincode),
    }


@router.post("/create/{order_id}")
async def create_shipment(order_id: str, admin: AdminUser, body: dict | None = None):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    requested = (body or {}).get("carrier") or (body or {}).get("courier")
    if requested and not couriers.normalize(requested):
        raise HTTPException(status_code=400, detail=f"Unknown carrier '{requested}'")
    customer = await User.get(order.customerId) if order.customerId else None
    data = await couriers.create_shipment(order, customer or admin, carrier=requested)
    carrier = couriers.carrier_for_order(order)
    # `dtdc` key kept for older admin clients that read response.dtdc.
    return {
        "ok": True,
        "carrier": carrier,
        "shipment": data,
        "dtdc": data if carrier == couriers.DTDC else None,
        "order": remap_order(order),
    }


@router.post("/retry/{order_id}")
async def retry(order_id: str, admin: AdminUser, body: dict | None = None):
    """Alias for create — keeps older admin clients working."""
    return await create_shipment(order_id, admin, body)


@router.post("/cancel/{order_id}")
async def cancel_shipment(order_id: str, admin: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    carrier = couriers.carrier_for_order(order)
    data = await couriers.cancel_shipment(order)
    return {
        "ok": True,
        "carrier": carrier,
        "shipment": data,
        "dtdc": data if carrier == couriers.DTDC else None,
        "order": remap_order(order),
    }


@router.get("/label/{order_id}")
async def shipping_label(order_id: str, admin: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pdf = await couriers.label_pdf_bytes(order)
    if mark_ready_to_ship_after_label(order):
        await order.save()
    filename = f"label-{(order.awb or order_id)}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/labels/bulk")
async def shipping_labels_bulk(body: dict, admin: AdminUser):
    """Download and merge DTDC shipping labels for selected orders that have AWBs."""
    raw_ids = body.get("orderIds") or body.get("ids") or []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=400, detail="orderIds is required")
    if len(raw_ids) > 50:
        raise HTTPException(status_code=400, detail="Max 50 labels per bulk print")

    pdfs: list[bytes] = []
    skipped: list[str] = []
    errors: list[str] = []
    marked_ready = 0

    for oid in raw_ids:
        sid = str(oid)
        if not ObjectId.is_valid(sid):
            skipped.append(sid)
            continue
        order = await Order.get(ObjectId(sid))
        if not order:
            skipped.append(sid)
            continue
        if not couriers.shipment_reference(order):
            skipped.append(sid)
            continue
        try:
            pdfs.append(await couriers.label_pdf_bytes(order))
            if mark_ready_to_ship_after_label(order):
                await order.save()
                marked_ready += 1
        except HTTPException as exc:
            errors.append(f"{order.orderNumber or sid}: {exc.detail}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{order.orderNumber or sid}: {exc}")

    if not pdfs:
        detail = "No printable shipping labels in selection"
        if errors:
            detail = f"{detail}. {'; '.join(errors[:3])}"
        raise HTTPException(status_code=400, detail=detail)

    merged = await couriers.merge_label_pdfs(pdfs)
    filename = f"shipping-labels-{len(pdfs)}.pdf"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Labels-Printed": str(len(pdfs)),
        "X-Labels-Skipped": str(len(skipped)),
        "X-Labels-Marked-Ready": str(marked_ready),
    }
    if errors:
        headers["X-Labels-Errors"] = str(len(errors))
    return Response(content=merged, media_type="application/pdf", headers=headers)


@router.post("/mark-awaiting/{order_id}")
async def mark_awaiting(order_id: str, admin: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    data = await process_full_order_flow(order, admin)
    return {"ok": True, "result": data, "order": remap_order(order)}
