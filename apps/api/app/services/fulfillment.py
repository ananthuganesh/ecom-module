"""Fulfillment helpers — DTDC is manual; post-pay only marks awaiting shipment."""

from datetime import datetime

from app.documents import Order, User

# Admin order.status → shippingStatus only for terminal / admin-driven cases.
# Live shipment progress (Awaiting / Ready / In Transit / Out for Delivery) comes from DTDC.
_ORDER_STATUS_TO_SHIPPING = {
    # Do not map processing → Awaiting (that means DTDC booked). Keep empty until AWB.
    "delivered": "Delivered",
    "cancelled": "Cancelled",
    "returned": "Returned",
}

# Canonical values stored on Order.shippingStatus
STORE_SHIPPING_STATUSES = frozenset(
    {
        "Payment Pending",
        "Awaiting Shipment",
        "Ready To Ship",
        "In Transit",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
        "Returned",
        "Shipping Sync Failed",
    }
)

# Monotonic progress for DTDC track updates (never move backwards).
_SHIPPING_STATUS_RANK = {
    "payment pending": 0,
    "shipping sync failed": 0,
    "awaiting shipment": 1,
    "ready to ship": 2,
    "in transit": 3,
    "out for delivery": 4,
    "delivered": 5,
    "cancelled": 5,
    "returned": 5,
}

# DTDC / Shipsy track status → store shippingStatus
DTDC_TRACK_STATUS_MAP = {
    "booked": "Awaiting Shipment",
    "soft_data_upload": "Awaiting Shipment",
    "softdataupload": "Awaiting Shipment",
    "soft data upload": "Awaiting Shipment",
    "manifested": "Awaiting Shipment",
    "awaiting_shipment": "Awaiting Shipment",
    "awaiting shipment": "Awaiting Shipment",
    "pickup_pending": "Ready To Ship",
    "pickup pending": "Ready To Ship",
    "pickup_scheduled": "Ready To Ship",
    "pickup scheduled": "Ready To Ship",
    "pickup_awaited": "Ready To Ship",
    "pickup awaited": "Ready To Ship",
    "pickup_done": "In Transit",
    "pickup done": "In Transit",
    "picked_up": "In Transit",
    "picked up": "In Transit",
    "reachedathub": "In Transit",
    "reached_at_hub": "In Transit",
    "in_transit": "In Transit",
    "in transit": "In Transit",
    "out_for_delivery": "Out for Delivery",
    "out for delivery": "Out for Delivery",
    "outfordelivery": "Out for Delivery",
    "ofd": "Out for Delivery",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
    "canceled": "Cancelled",
    "rto": "Returned",
    "returned": "Returned",
    "rto_in_transit": "Returned",
    "rto initiated": "Returned",
}


# Delhivery track status → store shippingStatus.
# Delhivery reports a plain `Status` string; "Pending" means it is sitting at a
# facility mid-journey, not awaiting pickup, so it maps to In Transit.
DELHIVERY_TRACK_STATUS_MAP = {
    "manifested": "Awaiting Shipment",
    "not picked": "Awaiting Shipment",
    "not_picked": "Awaiting Shipment",
    "open": "Awaiting Shipment",
    "pickup scheduled": "Ready To Ship",
    "pickup_scheduled": "Ready To Ship",
    "in transit": "In Transit",
    "in_transit": "In Transit",
    "pending": "In Transit",
    "reached destination": "In Transit",
    "dispatched": "Out for Delivery",
    "out for delivery": "Out for Delivery",
    "delivered": "Delivered",
    "canceled": "Cancelled",
    "cancelled": "Cancelled",
    "rto": "Returned",
    "rto in transit": "Returned",
    "rto_in_transit": "Returned",
    "rto delivered": "Returned",
    "returned": "Returned",
}


def map_delhivery_track_status(raw: str | None) -> str | None:
    """Map a Delhivery track status to a store shippingStatus, or None if unknown."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text in STORE_SHIPPING_STATUSES:
        return text
    lowered = text.lower()
    return (
        DELHIVERY_TRACK_STATUS_MAP.get(lowered)
        or DELHIVERY_TRACK_STATUS_MAP.get(lowered.replace("_", " "))
        or DELHIVERY_TRACK_STATUS_MAP.get(lowered.replace(" ", "_"))
    )


def shipping_status_for_order_status(status: str | None) -> str | None:
    """Map package/fulfillment order status to DTDC shippingStatus (or None)."""
    key = str(status or "").strip().lower()
    return _ORDER_STATUS_TO_SHIPPING.get(key)


def apply_shipping_status_from_order_status(order: Order, status: str | None = None) -> bool:
    """Set shippingStatus from order.status when mapped. Never overrides DTDC AWB progress."""
    if (order.awb or "").strip():
        return False
    mapped = shipping_status_for_order_status(status if status is not None else order.status)
    if not mapped:
        return False
    if order.shippingStatus == mapped:
        return False
    order.shippingStatus = mapped
    return True


def map_dtdc_track_status(raw: str | None) -> str | None:
    """Map a DTDC/Shipsy track status to a store shippingStatus, or None if unknown."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text in STORE_SHIPPING_STATUSES:
        return text
    key = text.lower().replace("-", "_")
    mapped = DTDC_TRACK_STATUS_MAP.get(key) or DTDC_TRACK_STATUS_MAP.get(text.lower())
    if mapped:
        return mapped
    spaced = text.lower().replace("_", " ")
    return DTDC_TRACK_STATUS_MAP.get(spaced)


def can_apply_shipping_status(current: str | None, incoming: str | None) -> bool:
    """True if incoming is a known store status and does not regress progress."""
    mapped = incoming if incoming in STORE_SHIPPING_STATUSES else map_dtdc_track_status(incoming)
    if not mapped or mapped not in STORE_SHIPPING_STATUSES:
        return False
    cur = str(current or "").strip()
    if not cur:
        return True
    cur_norm = cur if cur in STORE_SHIPPING_STATUSES else (map_dtdc_track_status(cur) or cur)
    if cur_norm == mapped:
        return False
    c_rank = _SHIPPING_STATUS_RANK.get(str(cur_norm).lower())
    n_rank = _SHIPPING_STATUS_RANK.get(str(mapped).lower())
    if n_rank is None:
        return False
    if c_rank is None:
        return True
    # Cancelled / Returned may apply from any non-terminal-delivered progress
    if mapped in ("Cancelled", "Returned") and c_rank < 5:
        return True
    return n_rank >= c_rank


# Don't move backwards when a label is printed.
_POST_READY_STATUSES = {
    "ready to ship",
    "in transit",
    "out for delivery",
    "delivered",
    "cancelled",
    "returned",
}


def mark_ready_to_ship_after_label(order: Order) -> bool:
    """After a shipping label is printed, mark Ready To Ship (unless already further along)."""
    current = str(order.shippingStatus or "").strip().lower()
    if current in _POST_READY_STATUSES:
        return False
    order.shippingStatus = "Ready To Ship"
    order.updatedAt = datetime.utcnow()
    return True


def _provider(order: Order) -> str:
    """Carrier holding this order, or the one it would route to if unbooked."""
    from app.services import couriers

    return couriers.carrier_for_order(order)


async def process_full_order_flow(order: Order, user: User | None = None) -> dict:
    """No auto carrier create. Admin creates DTDC consignment from the order page.

    Paid orders stay Unfulfilled (no shippingStatus) until Create DTDC shipment.
    """
    payment_ok = order.paymentStatus in ("paid",)
    if not payment_ok:
        order.shippingStatus = "Payment Pending"
        await order.save()
        return {"skipped": True, "reason": "payment_pending", "provider": _provider(order)}

    if order.awb:
        return {"skipped": True, "reason": "already_shipped", "provider": _provider(order)}

    # Paid but not yet booked with DTDC — show Unfulfilled on Orders list
    if str(order.shippingStatus or "").strip().lower() == "payment pending":
        order.shippingStatus = None
    elif not order.shippingStatus:
        order.shippingStatus = None

    await order.save()
    try:
        from app.services import erp_ops

        await erp_ops.ensure_order_invoice_safe(order, actor=user, context="fulfillment_paid")
    except Exception:
        pass
    return {"ok": True, "manual": True, "provider": _provider(order), "shippingStatus": None}
