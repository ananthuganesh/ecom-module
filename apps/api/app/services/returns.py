"""Customer return requests: eligibility, creation, and the admin workflow.

A ReturnRequest is the customer's ask. Once approved it books a Delhivery
reverse pickup; once the goods are back it posts a SalesReturn, which is what
actually restocks. Refunds stay a deliberate admin action throughout — nothing
here moves money.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.documents import Order, ReturnItem, ReturnRequest, User

# Customers may raise a return within this window after delivery.
RETURN_WINDOW_DAYS = 2

OPEN_STATUSES = ("requested", "approved", "picked_up")
CLOSED_STATUSES = ("received", "rejected", "cancelled")


def _item_key(item: Any) -> str:
    """Identify an order line across the order and a return request."""
    return "|".join(
        [
            str(getattr(item, "productId", "") or ""),
            str(getattr(item, "size", "") or ""),
            str(getattr(item, "color", "") or ""),
        ]
    )


def delivered_at(order: Order) -> datetime | None:
    """When the parcel actually reached the customer, as best we know."""
    for value in (order.deliveredAt, order.deliveryDate):
        if isinstance(value, datetime):
            return value
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    from app.services import couriers

    raw = couriers.shipment_meta(order)["timestamps"].get("deliveredAt") or details.get("deliveredAt")
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def window_closes_at(order: Order) -> datetime | None:
    delivered = delivered_at(order)
    return delivered + timedelta(days=RETURN_WINDOW_DAYS) if delivered else None


def _is_delivered(order: Order) -> bool:
    if bool(getattr(order, "isDelivered", False)):
        return True
    return str(order.status or "").strip().lower() == "delivered"


async def returned_quantities(order_id: str) -> dict[str, int]:
    """Units already spoken for by open or completed returns, per order line."""
    requests = await ReturnRequest.find(ReturnRequest.orderId == str(order_id)).to_list()
    taken: dict[str, int] = {}
    for req in requests:
        if req.status in ("rejected", "cancelled"):
            continue
        for item in req.items or []:
            key = "|".join(
                [str(item.productId or ""), str(item.size or ""), str(item.color or "")]
            )
            taken[key] = taken.get(key, 0) + int(item.quantity or 0)
    return taken


async def eligibility(order: Order) -> dict[str, Any]:
    """What the customer may return on this order, and why not when they may not."""
    now = datetime.utcnow()
    delivered = delivered_at(order)
    closes = window_closes_at(order)

    def blocked(reason: str) -> dict[str, Any]:
        return {
            "eligible": False,
            "reason": reason,
            "windowDays": RETURN_WINDOW_DAYS,
            "deliveredAt": delivered,
            "windowClosesAt": closes,
            "items": [],
        }

    if not _is_delivered(order):
        return blocked("Only delivered orders can be returned")
    if str(order.status or "").strip().lower() in ("returned", "cancelled"):
        return blocked("This order is already cancelled or returned")
    if delivered is None:
        # Never guess a delivery date — an unknown one must not silently open
        # or close the window.
        return blocked("Delivery date unavailable — contact support to return this order")
    if closes and now > closes:
        return blocked(f"The {RETURN_WINDOW_DAYS}-day return window closed on {closes:%d %b %Y}")

    taken = await returned_quantities(str(order.id))
    items: list[dict[str, Any]] = []
    for index, line in enumerate(order.items or []):
        key = _item_key(line)
        ordered = int(getattr(line, "quantity", 0) or 0)
        already = int(taken.get(key, 0))
        remaining = max(0, ordered - already)
        items.append(
            {
                "index": index,
                "productId": str(getattr(line, "productId", "") or "") or None,
                "productName": getattr(line, "productName", None) or "Item",
                "image": getattr(line, "image", None),
                "size": getattr(line, "size", "") or "",
                "color": getattr(line, "color", "") or "",
                "unitPrice": float(getattr(line, "price", 0) or 0),
                "orderedQuantity": ordered,
                "returnedQuantity": already,
                "returnableQuantity": remaining,
            }
        )

    if not any(row["returnableQuantity"] > 0 for row in items):
        return blocked("Every item on this order has already been returned")

    return {
        "eligible": True,
        "reason": None,
        "windowDays": RETURN_WINDOW_DAYS,
        "deliveredAt": delivered,
        "windowClosesAt": closes,
        "items": items,
    }


def _line_refund(order: Order, unit_price: float, quantity: int) -> float:
    """Item value only — delivery is never refunded on a return.

    Order-level discount is spread across items by value, so a returned item
    refunds what the customer actually paid for it, not its list price.
    """
    gross = sum(
        float(getattr(line, "price", 0) or 0) * int(getattr(line, "quantity", 0) or 0)
        for line in order.items or []
    )
    discount = float(order.discountAmount or order.discount or 0)
    line_value = float(unit_price) * int(quantity)
    if gross > 0 and discount > 0:
        line_value -= discount * (line_value / gross)
    return round(max(0.0, line_value), 2)


async def create_request(
    order: Order,
    *,
    user: User | None,
    selections: list[dict[str, Any]],
    reason: str = "",
    note: str = "",
) -> ReturnRequest:
    """Raise a return for chosen order lines. Validates against what is returnable."""
    check = await eligibility(order)
    if not check["eligible"]:
        raise HTTPException(status_code=400, detail=check["reason"])

    by_index = {row["index"]: row for row in check["items"]}
    items: list[ReturnItem] = []
    total = 0.0

    for raw in selections or []:
        try:
            index = int(raw.get("index"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Each selected item needs an index")
        row = by_index.get(index)
        if row is None:
            raise HTTPException(status_code=400, detail=f"Item {index} is not on this order")

        try:
            quantity = int(raw.get("quantity") or 0)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Quantity must be a whole number")
        if quantity <= 0:
            continue
        if quantity > row["returnableQuantity"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Only {row['returnableQuantity']} × {row['productName']} "
                    "can still be returned"
                ),
            )

        line_refund = _line_refund(order, row["unitPrice"], quantity)
        total += line_refund
        items.append(
            ReturnItem(
                productId=row["productId"],
                productName=row["productName"],
                image=row["image"],
                color=row["color"],
                size=row["size"],
                quantity=quantity,
                unitPrice=row["unitPrice"],
                lineRefund=line_refund,
            )
        )

    if not items:
        raise HTTPException(status_code=400, detail="Select at least one item to return")

    from app.services import erp_ops

    request = ReturnRequest(
        number=await erp_ops.next_number("RR", "seq_return_request"),
        orderId=str(order.id),
        orderNumber=order.orderNumber,
        customerId=str(order.customerId) if order.customerId else None,
        customerName=(user.name if user else None) or (order.shippingAddress or {}).get("name"),
        items=items,
        reason=str(reason or "").strip()[:200],
        customerNote=str(note or "").strip()[:1000],
        status="requested",
        refundAmount=round(total, 2),
    )
    await request.insert()

    order.status = "return requested"
    order.updatedAt = datetime.utcnow()
    await order.save()
    return request


async def approve(request: ReturnRequest, *, actor: str = "admin") -> dict[str, Any]:
    """Approve and book a Delhivery reverse pickup.

    A pincode Delhivery cannot collect from does not block approval — the
    request is flagged so it can be collected another way.
    """
    if request.status != "requested":
        raise HTTPException(status_code=400, detail=f"Return is already {request.status}")

    order = await Order.get(ObjectId(request.orderId)) if ObjectId.is_valid(request.orderId) else None
    if not order:
        raise HTTPException(status_code=404, detail="Order for this return no longer exists")

    from app.services import delhivery as delhivery_svc

    result: dict[str, Any] = {"pickupBooked": False}
    request.status = "approved"
    request.approvedAt = datetime.utcnow()
    request.carrier = "delhivery"

    try:
        pickup = await delhivery_svc.create_reverse_pickup(order, request)
        request.awb = pickup.get("waybill")
        request.pickupServiceable = True
        request.pickupNote = None
        result["pickupBooked"] = True
        result["pickup"] = pickup
    except HTTPException as exc:
        # Approval still stands; the parcel just needs collecting by hand.
        request.pickupServiceable = False
        request.pickupNote = str(exc.detail)[:300]
        request.carrier = None
        result["pickupError"] = request.pickupNote

    request.updatedAt = datetime.utcnow()
    await request.save()
    result["request"] = request
    return result


async def reject(request: ReturnRequest, *, reason: str = "") -> ReturnRequest:
    if request.status not in ("requested", "approved"):
        raise HTTPException(status_code=400, detail=f"Return is already {request.status}")
    request.status = "rejected"
    request.rejectionReason = str(reason or "").strip()[:300] or None
    request.rejectedAt = datetime.utcnow()
    request.updatedAt = datetime.utcnow()
    await request.save()
    await _restore_order_status(request)
    return request


async def mark_received(request: ReturnRequest, *, actor_id: str = "") -> dict[str, Any]:
    """Goods are back: post a SalesReturn, which restocks. Refund stays manual."""
    if request.status in ("received", "rejected", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Return is already {request.status}")

    order = await Order.get(ObjectId(request.orderId)) if ObjectId.is_valid(request.orderId) else None
    if not order:
        raise HTTPException(status_code=404, detail="Order for this return no longer exists")

    from app.documents import LineItem, SalesReturn
    from app.services import erp_ops
    from app.services import stock as stock_service
    from app.services.stock import ensure_default_warehouse

    warehouse = await ensure_default_warehouse()
    line_items = [
        LineItem(
            productId=item.productId,
            productName=item.productName,
            quantity=int(item.quantity),
            unitPrice=float(item.unitPrice),
            variantSku=item.variantSku or "",
        )
        for item in request.items or []
    ]

    sales_return = SalesReturn(
        number=await erp_ops.next_number("SR", "seq_sales_return"),
        orderId=str(order.id),
        warehouseId=str(warehouse.id),
        customerId=request.customerId,
        items=line_items,
        reason=request.reason or f"Return {request.number}",
        restock=True,
    )
    await sales_return.insert()

    # Restock per item and keep going on failure — the SalesReturn is already
    # posted, so aborting midway would leave the return stuck un-receivable
    # (a product deleted since the order was placed is the common case).
    restocked = 0
    restock_errors: list[str] = []
    for item in line_items:
        if not item.productId:
            continue
        try:
            await stock_service.apply_stock_change(
                product_id=item.productId,
                warehouse_id=str(warehouse.id),
                quantity_delta=int(item.quantity),
                movement_type="sale_return",
                variant_sku=item.variantSku or "",
                reason=f"Return {request.number}",
                reference_type="sales_return",
                reference_id=str(sales_return.id),
                created_by=actor_id,
            )
            restocked += int(item.quantity)
        except Exception as exc:  # noqa: BLE001
            detail = getattr(exc, "detail", None) or str(exc)
            restock_errors.append(f"{item.productName}: {detail}")
            print(f"[Return] Restock failed for {request.number}: {detail}")

    request.status = "received"
    request.receivedAt = datetime.utcnow()
    request.salesReturnId = str(sales_return.id)
    request.updatedAt = datetime.utcnow()
    await request.save()

    all_returned = await _every_item_returned(order)
    order.status = "returned" if all_returned else "delivered"
    order.shippingStatus = "Returned" if all_returned else order.shippingStatus
    order.updatedAt = datetime.utcnow()
    await order.save()

    return {
        "request": request,
        "salesReturnId": str(sales_return.id),
        "restockedUnits": restocked,
        "restockErrors": restock_errors,
        # Refund is never automatic — surfaced so the admin can act on it.
        "refundDue": request.refundAmount,
    }


async def _every_item_returned(order: Order) -> bool:
    taken = await returned_quantities(str(order.id))
    for line in order.items or []:
        if int(getattr(line, "quantity", 0) or 0) > int(taken.get(_item_key(line), 0)):
            return False
    return True


async def _restore_order_status(request: ReturnRequest) -> None:
    """Drop 'return requested' when no open return remains on the order."""
    if not ObjectId.is_valid(request.orderId):
        return
    order = await Order.get(ObjectId(request.orderId))
    if not order or str(order.status or "").lower() != "return requested":
        return
    open_requests = await ReturnRequest.find(
        {"orderId": request.orderId, "status": {"$in": list(OPEN_STATUSES)}}
    ).count()
    if open_requests == 0:
        order.status = "delivered"
        order.updatedAt = datetime.utcnow()
        await order.save()
