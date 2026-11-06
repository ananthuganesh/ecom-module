"""Periodic + on-demand carrier tracking sync for open shipments (DTDC + Delhivery)."""

from __future__ import annotations

import asyncio
import re
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

_TERMINAL_SHIPPING_RE = re.compile(r"^(delivered|cancelled|canceled|returned)$", re.IGNORECASE)

# Soft refresh / cron defaults
SYNC_BATCH_LIMIT = 40
SYNC_CONCURRENCY = 3
SYNC_INTERVAL_SECONDS = 300.0  # 5 minutes
SYNC_MAX_IDS = 50

# A carrier that says the AWB doesn't exist will never say otherwise (typically
# orders imported from the old store, booked outside this system). After this
# many such answers in a row the order is taken out of auto-tracking.
PERMANENT_TRACK_ERROR_LIMIT = 3
_PERMANENT_TRACK_ERROR_MARKERS = (
    "reference number is not valid",  # DTDC / Shipsy WRONG_INPUT
    "wrong_input",
    "doesn't exist",  # Delhivery: "waybill ... doesn't exist"
    "does not exist",
    "no such waybill",
    "invalid waybill",
)


def is_permanent_track_error(message: str | None) -> bool:
    """True when the carrier says it doesn't know this AWB at all (not a timeout / outage)."""
    text = str(message or "").strip().lower()
    return any(marker in text for marker in _PERMANENT_TRACK_ERROR_MARKERS)


def tracking_stopped(order: Order) -> bool:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    return bool(details.get("trackingStopped"))


def _record_track_error(order: Order, message: str) -> None:
    """Note the failure on the order (admin can see it) and rotate it to the back of the batch.

    Consecutive "AWB unknown" answers stop auto-tracking; any other error resets the count.
    """
    now = datetime.utcnow().isoformat()
    details = dict(order.transactionDetails or {})
    previous = details.get("trackError") if isinstance(details.get("trackError"), dict) else {}
    permanent = is_permanent_track_error(message)
    count = int(previous.get("permanentCount") or 0) + 1 if permanent else 0
    details["trackError"] = {"message": message, "at": now, "permanentCount": count}
    details["dtdcLastTrackAt"] = now
    if permanent and count >= PERMANENT_TRACK_ERROR_LIMIT:
        details["trackingStopped"] = {
            "reason": f"Carrier doesn't recognise this AWB: {message}",
            "at": now,
        }
    order.transactionDetails = details


def _clear_track_error(order: Order) -> None:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    if "trackError" in details:
        order.transactionDetails = {k: v for k, v in details.items() if k != "trackError"}


def shipment_reference(order: Order) -> str | None:
    from app.services import couriers

    return couriers.shipment_reference(order)


def is_open_for_track(order: Order) -> bool:
    if not order or not shipment_reference(order):
        return False
    if tracking_stopped(order):
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
    from app.services import couriers

    configured = {
        row["code"] for row in await couriers.available_carriers() if row.get("configured")
    }
    if not configured:
        return {
            "ok": False,
            "skipped": True,
            "reason": "No carrier is configured",
            "scanned": 0,
            "updated": [],
            "unchanged": 0,
            "errors": [],
        }

    targets = [
        o
        for o in orders
        if is_open_for_track(o) and couriers.carrier_for_order(o) in configured
    ]
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
                await couriers.track_shipment(order)
                _clear_track_error(order)
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
            except Exception as exc:  # noqa: BLE001 — one bad order never stops the batch
                message = (
                    str(exc.detail or "Track failed")
                    if isinstance(exc, HTTPException)
                    else str(exc) or exc.__class__.__name__
                )
                errors.append(
                    {
                        "orderId": str(order.id),
                        "orderNumber": str(order.orderNumber or ""),
                        "error": message,
                    }
                )
                _record_track_error(order, message)
                try:
                    await order.save()
                except Exception:
                    pass

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
    """Cron batch: oldest-tracked open AWB orders first, across every carrier."""
    lim = max(1, min(int(limit), SYNC_BATCH_LIMIT))
    query: dict[str, Any] = {
        "status": {"$nin": ["abandoned", "delivered", "cancelled", "canceled", "returned"]},
        "isDelivered": {"$ne": True},
        "$or": [
            {"awb": {"$exists": True, "$nin": [None, ""]}},
            {"transactionDetails.dtdc.reference_number": {"$exists": True, "$nin": [None, ""]}},
            {"transactionDetails.delhivery.waybill": {"$exists": True, "$nin": [None, ""]}},
        ],
        # Compiled regex: same query on Atlas, and mongomock (tests) accepts it under $not.
        "shippingStatus": {"$not": _TERMINAL_SHIPPING_RE},
        "transactionDetails.trackingStopped": {"$exists": False},
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
            errors = result.get("errors") or []
            if updated_n or errors:
                detail = "; ".join(
                    f"{e.get('orderNumber') or e.get('orderId')}: {e.get('error')}" for e in errors[:5]
                )
                print(
                    f"[Shipping] Status sync: scanned={result.get('scanned')} "
                    f"updated={updated_n} errors={len(errors)}" + (f" ({detail})" if detail else "")
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[Shipping] Status sync error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
