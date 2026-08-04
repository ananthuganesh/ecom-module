"""Periodic + on-demand DTDC tracking sync for open shipments."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.documents import Order
from app.serializers import remap_order

TERMINAL_SHIPPING = frozenset(
    {
        "delivered",
        "cancelled",
        "canceled",
        "returned",
    }
)

# Soft refresh / cron defaults
SYNC_BATCH_LIMIT = 40
SYNC_CONCURRENCY = 3
SYNC_INTERVAL_SECONDS = 300.0  # 5 minutes
SYNC_MAX_IDS = 50


def dtdc_reference(order: Order) -> str | None:
    awb = str(order.awb or "").strip()
    if awb:
        return awb
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    dtdc = details.get("dtdc") if isinstance(details.get("dtdc"), dict) else {}
    ref = str(dtdc.get("reference_number") or "").strip()
    return ref or None


def is_open_for_dtdc_track(order: Order) -> bool:
    if not order or not dtdc_reference(order):
        return False
    if bool(getattr(order, "isDelivered", False)):
        return False
    status = str(order.shippingStatus or "").strip().lower()
    if status in TERMINAL_SHIPPING:
        return False
    order_status = str(order.status or "").strip().lower()
    if order_status in TERMINAL_SHIPPING or order_status in {"abandoned"}:
        return False
    return True


async def sync_orders_tracking(
    orders: list[Order],
    *,
    concurrency: int = SYNC_CONCURRENCY,
    stamp_unchanged: bool = True,
) -> dict[str, Any]:
    """Track each open order against DTDC; persist status changes. Never raises for single failures.

    stamp_unchanged: when True (cron), touch dtdcLastTrackAt so the batch rotates.
    Soft refresh should pass False to avoid rewriting every row on each page load.
    """
    from app.services import dtdc as dtdc_svc

    try:
        await dtdc_svc.require_dtdc_creds()
    except HTTPException as exc:
        return {
            "ok": False,
            "skipped": True,
            "reason": str(exc.detail or "DTDC not configured"),
            "scanned": 0,
            "updated": [],
            "unchanged": 0,
            "errors": [],
        }

    targets = [o for o in orders if is_open_for_dtdc_track(o)]
    if not targets:
        return {
            "ok": True,
            "scanned": 0,
            "updated": [],
            "unchanged": 0,
            "errors": [],
        }

    sem = asyncio.Semaphore(max(1, concurrency))
    updated: list[dict] = []
    errors: list[dict[str, str]] = []
    unchanged_ids: list[str] = []

    async def _one(order: Order) -> None:
        async with sem:
            before = str(order.shippingStatus or "")
            try:
                await dtdc_svc.track_consignment(order)
                after = str(order.shippingStatus or "")
                if after != before:
                    details = dict(order.transactionDetails or {})
                    details["dtdcLastTrackAt"] = datetime.utcnow().isoformat()
                    order.transactionDetails = details
                    order.updatedAt = datetime.utcnow()
                    try:
                        await order.save()
                    except Exception:
                        pass
                    updated.append(remap_order(order))
                else:
                    unchanged_ids.append(str(order.id))
                    if stamp_unchanged:
                        details = dict(order.transactionDetails or {})
                        details["dtdcLastTrackAt"] = datetime.utcnow().isoformat()
                        order.transactionDetails = details
                        order.updatedAt = datetime.utcnow()
                        try:
                            await order.save()
                        except Exception:
                            pass
            except HTTPException as exc:
                errors.append(
                    {
                        "orderId": str(order.id),
                        "error": str(exc.detail or "Track failed"),
                    }
                )
            except Exception as exc:  # noqa: BLE001
                errors.append({"orderId": str(order.id), "error": str(exc)})

    await asyncio.gather(*[_one(o) for o in targets])
    return {
        "ok": True,
        "scanned": len(targets),
        "updated": updated,
        "unchanged": len(unchanged_ids),
        "errors": errors,
    }


async def sync_orders_by_ids(
    order_ids: list[str],
    *,
    stamp_unchanged: bool = False,
) -> dict[str, Any]:
    ids: list[ObjectId] = []
    for raw in order_ids:
        sid = str(raw or "").strip()
        if ObjectId.is_valid(sid):
            ids.append(ObjectId(sid))
    if not ids:
        return {
            "ok": True,
            "scanned": 0,
            "updated": [],
            "unchanged": 0,
            "errors": [],
        }

    orders = await Order.find({"_id": {"$in": ids}}).to_list()
    return await sync_orders_tracking(orders, stamp_unchanged=stamp_unchanged)


async def sync_open_shipments_batch(*, limit: int = SYNC_BATCH_LIMIT) -> dict[str, Any]:
    """Cron batch: oldest-tracked open AWB orders first."""
    lim = max(1, min(int(limit), SYNC_BATCH_LIMIT))
    query: dict[str, Any] = {
        "status": {"$nin": ["abandoned", "delivered", "cancelled", "canceled", "returned"]},
        "isDelivered": {"$ne": True},
        "$or": [
            {"awb": {"$exists": True, "$nin": [None, ""]}},
            {"transactionDetails.dtdc.reference_number": {"$exists": True, "$nin": [None, ""]}},
        ],
        "shippingStatus": {
            "$not": {
                "$regex": r"^(delivered|cancelled|canceled|returned)$",
                "$options": "i",
            }
        },
    }
    orders = (
        await Order.find(query)
        .sort([("transactionDetails.dtdcLastTrackAt", 1), ("updatedAt", 1)])
        .limit(lim)
        .to_list()
    )
    result = await sync_orders_tracking(orders)
    result["batchLimit"] = lim
    return result


async def shipment_status_sync_loop(
    stop_event: asyncio.Event,
    *,
    interval_seconds: float = SYNC_INTERVAL_SECONDS,
) -> None:
    """Background poller started from app lifespan."""
    # Small delay so boot isn't fighting other startup work
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=45.0)
        return
    except asyncio.TimeoutError:
        pass

    while not stop_event.is_set():
        try:
            result = await sync_open_shipments_batch()
            updated_n = len(result.get("updated") or [])
            if updated_n or result.get("errors"):
                print(
                    f"[DTDC] Status sync: scanned={result.get('scanned')} "
                    f"updated={updated_n} errors={len(result.get('errors') or [])}"
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[DTDC] Status sync error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
