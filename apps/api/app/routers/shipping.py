from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.deps import AdminUser, CurrentUser
from app.documents import Order, User
from app.serializers import remap_order
from app.services import dtdc
from app.services.fulfillment import mark_ready_to_ship_after_label, process_full_order_flow

router = APIRouter(prefix="/api/shipping", tags=["shipping"])


@router.post("/sync-statuses")
async def sync_statuses(body: dict, admin: AdminUser):
    """Soft-refresh DTDC tracking for selected (or open) orders; persists status changes."""
    from app.services import dtdc_status_sync as sync_svc

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
    tracking = await dtdc.track_consignment(order)
    return {"order": remap_order(order), "tracking": tracking}


@router.post("/create/{order_id}")
async def create_shipment(order_id: str, admin: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customer = await User.get(order.customerId) if order.customerId else None
    data = await dtdc.create_consignment(order, customer or admin)
    return {"ok": True, "dtdc": data, "order": remap_order(order)}


@router.post("/retry/{order_id}")
async def retry(order_id: str, admin: AdminUser):
    """Alias for create — keeps older admin clients working."""
    return await create_shipment(order_id, admin)


@router.post("/cancel/{order_id}")
async def cancel_shipment(order_id: str, admin: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    data = await dtdc.cancel_consignment(order)
    return {"ok": True, "dtdc": data, "order": remap_order(order)}


@router.get("/label/{order_id}")
async def shipping_label(order_id: str, admin: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pdf = await dtdc.label_pdf_bytes(order)
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
        if not (order.awb or "").strip() and not ((order.transactionDetails or {}).get("dtdc") or {}).get(
            "reference_number"
        ):
            skipped.append(sid)
            continue
        try:
            pdfs.append(await dtdc.label_pdf_bytes(order))
            if mark_ready_to_ship_after_label(order):
                await order.save()
                marked_ready += 1
        except HTTPException as exc:
            errors.append(f"{order.orderNumber or sid}: {exc.detail}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{order.orderNumber or sid}: {exc}")

    if not pdfs:
        detail = "No printable DTDC labels in selection"
        if errors:
            detail = f"{detail}. {'; '.join(errors[:3])}"
        raise HTTPException(status_code=400, detail=detail)

    merged = await dtdc.merge_label_pdfs(pdfs)
    filename = f"dtdc-labels-{len(pdfs)}.pdf"
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
