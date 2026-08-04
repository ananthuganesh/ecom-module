import re
from datetime import datetime, timedelta
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.deps import AdminUser, CurrentUser, PaymentsWriter
from app.documents import Order, OrderItem, Product, Setting
from app.serializers import remap_order
from app.services import erp_ops
from app.services.attribution import sanitize_attribution
from app.services.fulfillment import process_full_order_flow
from app.services.rate_limit import rate_limit_dependency
from app.services.shipping_settings import get_shipping_settings, rate_for_zip
from app.services.stock import apply_order_commitments, reserve_order_stock
from app.services.store_settings import ensure_payment_method_enabled
from app.services.variants import find_variant

router = APIRouter(prefix="/api/orders", tags=["orders"])


async def _max_order_number_seq(prefix: str, suffix: str) -> int:
    """Highest numeric sequence already used in orders (keeps counter in sync)."""
    col = Order.get_pymongo_collection()
    pattern = f"^{re.escape(prefix)}(\\d+){re.escape(suffix)}$"
    cursor = col.find({"orderNumber": {"$regex": pattern}}, {"orderNumber": 1})
    highest = 0
    async for row in cursor:
        raw = str(row.get("orderNumber") or "")
        match = re.match(pattern, raw)
        if not match:
            continue
        try:
            highest = max(highest, int(match.group(1)))
        except ValueError:
            continue
    return highest


async def _next_order_number() -> str:
    profile = {}
    s = await Setting.find_one(Setting.key == "company_profile")
    if s and isinstance(s.value, dict):
        profile = s.value
    # Brand short ids: UA1000, UA1001, …
    prefix = str(profile.get("orderPrefix") if profile.get("orderPrefix") not in (None, "") else "UA")
    suffix = str(profile.get("orderSuffix") or "")

    col = Setting.get_pymongo_collection()
    floor = max(999, await _max_order_number_seq(prefix, suffix))

    # Ensure counter exists and never lags behind existing order numbers.
    existing = await col.find_one({"key": "seq_order_number"})
    cur = int(((existing or {}).get("value") or {}).get("seq") or 0)
    if not existing or cur < floor:
        await col.update_one(
            {"key": "seq_order_number"},
            {"$set": {"value": {"seq": floor}}},
            upsert=True,
        )

    doc = await col.find_one_and_update(
        {"key": "seq_order_number"},
        {"$inc": {"value.seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    n = int((doc.get("value") or {}).get("seq") or (floor + 1))
    return f"{prefix}{n}{suffix}"


async def _next_order_url_id() -> str:
    """12-digit public URL id, separate from display orderNumber (UA1000)."""
    col = Setting.get_pymongo_collection()
    # Start just below 709021859801 so first id matches the 12-digit style users expect
    start_floor = 709021859800
    existing = await col.find_one({"key": "seq_order_url_id"})
    if not existing:
        await col.update_one(
            {"key": "seq_order_url_id"},
            {"$set": {"value": {"seq": start_floor}}},
            upsert=True,
        )
    else:
        cur = int((existing.get("value") or {}).get("seq") or 0)
        if cur < start_floor:
            await col.update_one(
                {"key": "seq_order_url_id"},
                {"$set": {"value.seq": start_floor}},
            )

    doc = await col.find_one_and_update(
        {"key": "seq_order_url_id"},
        {"$inc": {"value.seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    n = int((doc.get("value") or {}).get("seq") or (start_floor + 1))
    return f"{n:012d}"


def _is_owner(order: Order, user) -> bool:
    return str(order.customerId) == str(user.id) or bool(user.isAdmin)


async def _storefront_shipping_price(address: dict) -> float:
    """Price storefront delivery from the server-side shipping profile."""
    settings = await get_shipping_settings()
    serviceable, fee = rate_for_zip(
        settings,
        str(address.get("pincode") or address.get("zipcode") or ""),
        str(address.get("country") or "IN"),
    )
    if not serviceable:
        raise HTTPException(status_code=400, detail="Shipping is not available to this address")
    return fee


@router.post("", status_code=201)
async def create_order(
    body: dict,
    user: CurrentUser,
    _: None = Depends(rate_limit_dependency("orders-create", limit=20)),
):
    order_items = body.get("orderItems") or []
    if not order_items:
        raise HTTPException(status_code=400, detail="No order items")

    items: list[OrderItem] = []
    for oi in order_items:
        pid = oi.get("product")
        product = await Product.get(ObjectId(pid)) if pid and ObjectId.is_valid(str(pid)) else None
        if not product:
            raise HTTPException(status_code=404, detail=f"Product not found: {pid}")
        qty = int(oi.get("qty") or 1)
        if qty <= 0 or qty > 50:
            raise HTTPException(status_code=400, detail="Item quantity must be between 1 and 50")
        color = oi.get("color") or ""
        size = oi.get("size") or ""
        # Only persist axes this product actually sells on its variants
        from app.services.variants import product_variant_axes

        axes = product_variant_axes(product)
        if not axes.get("color"):
            color = ""
        if not axes.get("size"):
            size = ""
        available = product.totalStock or 0
        variant = find_variant(product, color=color, size=size)
        if variant is not None:
            available = variant.quantity or 0
        if available < qty:
            name = product.productName or product.name or "Product"
            label = " / ".join(p for p in [size, color] if p)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {name}{f' ({label})' if label else ''}. Only {available} left.",
            )
        correct = 0.0
        if product.pricing:
            correct = float(product.pricing.sellingPrice or 0)
        if correct <= 0:
            name = product.productName or product.name or "Product"
            raise HTTPException(
                status_code=400,
                detail=f"{name} has no sellable price configured.",
            )
        price = correct
        thumb = (product.thumbnails[0] if product.thumbnails else None) or None
        if not thumb and product.variants:
            for v in product.variants:
                imgs = getattr(v, "images", None) or []
                if imgs:
                    thumb = imgs[0]
                    break
        item = OrderItem(
            productId=product.id,
            productName=product.productName or product.name or product.product or "Product",
            image=str(thumb or "") or None,
            color=color,
            size=size,
            quantity=qty,
            price=price,
        )
        items.append(item)

    subtotal = sum(i.price * i.quantity for i in items)
    payment = str(body.get("paymentMethod") or "razorpay").lower()
    if payment in {"prepaid"}:
        payment = "razorpay"
    await ensure_payment_method_enabled(payment)

    shipping_address = body.get("shippingAddress") or {}
    delivery = await _storefront_shipping_price(shipping_address)
    is_gift = bool(body.get("isGift"))
    gift_fee = 39 if is_gift else 0
    discount = 0.0
    applied = None
    coupon_reserved = False
    coupon_code = body.get("couponCode")
    if coupon_code:
        from app.services import discounts as discount_svc

        cart_lines = [
            {
                "productId": str(i.productId),
                "price": float(i.price),
                "quantity": int(i.quantity),
            }
            for i in items
        ]
        coupon, discount = await discount_svc.validate_coupon(
            str(coupon_code),
            items=cart_lines,
            subtotal=subtotal,
        )
        if not await discount_svc.reserve_coupon_usage(coupon.code):
            raise HTTPException(status_code=400, detail="Discount usage limit reached")
        coupon_reserved = True
        applied = coupon.code

    final_price = max(0.0, subtotal + delivery + gift_fee - discount)
    payment = "razorpay"

    attribution = sanitize_attribution(body.get("attribution"))

    order = Order(
        customerId=user.id,
        orderNumber=await _next_order_number(),
        orderUrlId=await _next_order_url_id(),
        items=items,
        shippingAddress=shipping_address,
        status="order placed",
        total=subtotal,
        discount=discount,
        discountAmount=discount,
        finalPrice=final_price,
        deliveryAmount=delivery,
        isGift=is_gift,
        giftFee=gift_fee,
        giftMessage=body.get("giftMessage") or "",
        couponCode=applied,
        paymentMethod=payment,
        paymentStatus="pending",
        transactionDetails={
            "paymentMethod": payment,
            "paymentStatus": "pending",
            **({"couponReserved": True} if coupon_reserved else {}),
            **(
                {"guestId": str(body.get("guestId")).strip()}
                if body.get("guestId")
                else {}
            ),
        },
        shippingStatus="Payment Pending",
        attribution=attribution,
    )
    from app.services.dtdc_est_cost import apply_dtdc_est_cost

    apply_dtdc_est_cost(order)
    # Retry if a stale counter races another insert on unique orderNumber.
    for attempt in range(5):
        try:
            await order.insert()
            break
        except DuplicateKeyError:
            if attempt >= 4:
                raise HTTPException(
                    status_code=409,
                    detail="Could not allocate order number. Please try again.",
                )
            order.orderNumber = await _next_order_number()
            order.orderUrlId = await _next_order_url_id()

    try:
        await reserve_order_stock(order)
    except HTTPException:
        if coupon_reserved and applied:
            from app.services import discounts as discount_svc

            await discount_svc.release_coupon_usage(applied)
        await order.delete()
        raise
    except Exception as exc:
        if coupon_reserved and applied:
            from app.services import discounts as discount_svc

            await discount_svc.release_coupon_usage(applied)
        await order.delete()
        raise HTTPException(status_code=400, detail="Could not reserve stock") from exc

    try:
        await erp_ops.ensure_order_invoice(order, actor=user)
    except Exception as exc:
        print(f"[Checkout] Invoice create failed: {exc}")

    try:
        from app.services import aisensy as aisensy_svc
        from app.services import email_resend as email_svc

        await aisensy_svc.notify_order_event_once("orderPlaced", order, user)
        await email_svc.notify_order_email_once("PLACED", order, user)
        await email_svc.notify_staff_new_order(order, user)
    except Exception as exc:
        print(f"[Checkout] orderPlaced notify failed: {exc}")

    return remap_order(order)


@router.get("/myorders")
async def my_orders(user: CurrentUser):
    orders = await Order.find(Order.customerId == user.id).sort([("createdAt", -1)]).to_list()
    return [remap_order(o) for o in orders]


def _trend(current: float, previous: float) -> str:
    if not previous:
        return "+0%" if not current else "+100.0%"
    change = ((current - previous) / previous) * 100
    if not change:
        return "+0%"
    return f"{change:+.1f}%"


@router.get("/stats")
async def stats(
    _: AdminUser,
    range_: Literal["7d", "30d", "90d", "365d", "all"] = Query("30d", alias="range"),
):
    """Paid-order analytics. Excludes abandoned and cancelled checkouts."""
    from app.documents import User

    now = datetime.utcnow()
    if range_ == "all":
        days = None
        current_start = datetime(2000, 1, 1)
        previous_start = datetime(2000, 1, 1)
        previous_end = datetime(2000, 1, 1)
    else:
        days = int(range_.removesuffix("d"))
        current_start = now - timedelta(days=days)
        previous_start = current_start - timedelta(days=days)
        previous_end = current_start

    # Real sales only — unpaid gateway exits / abandoned carts do not count
    eligible: dict[str, Any] = {
        "status": {"$nin": ["abandoned", "cancelled"]},
        "$or": [
            {"paymentStatus": "paid"},
            {"transactionDetails.paymentStatus": "paid"},
        ],
    }
    collection = Order.get_pymongo_collection()

    async def period_totals(start: datetime, end: datetime) -> tuple[int, float]:
        rows = await collection.aggregate(
            [
                {"$match": {**eligible, "createdAt": {"$gte": start, "$lt": end}}},
                {
                    "$group": {
                        "_id": None,
                        "orders": {"$sum": 1},
                        "revenue": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                    }
                },
            ]
        ).to_list(1)
        row = rows[0] if rows else {}
        return int(row.get("orders") or 0), round(float(row.get("revenue") or 0), 2)

    if range_ == "all":
        paid_orders, total_revenue = await period_totals(current_start, now + timedelta(days=1))
        previous_paid_orders, previous_revenue = 0, 0.0
        date_match: dict[str, Any] = {}
    else:
        paid_orders, total_revenue = await period_totals(current_start, now)
        previous_paid_orders, previous_revenue = await period_totals(previous_start, previous_end)
        date_match = {"createdAt": {"$gte": current_start, "$lt": now}}

    unpaid_match = {
        "status": {"$ne": "abandoned"},
        **date_match,
        "$nor": [
            {"paymentStatus": "paid"},
            {"transactionDetails.paymentStatus": "paid"},
        ],
    }
    all_orders = await collection.count_documents({"status": {"$ne": "abandoned"}, **date_match})
    pending_orders = await collection.count_documents(unpaid_match)
    total_orders = all_orders  # paid + pending (excludes abandoned)

    users = User.get_pymongo_collection()
    # Customers who completed at least one paid order (not abandoned-only accounts)
    paid_customer_ids = await collection.distinct(
        "customerId",
        eligible,
    )
    paid_customer_ids = [cid for cid in paid_customer_ids if cid]
    total_customers = len(paid_customer_ids)

    if range_ == "all":
        current_customers = total_customers
        previous_customers = 0
    else:
        current_ids = await collection.distinct(
            "customerId",
            {**eligible, "createdAt": {"$gte": current_start, "$lt": now}},
        )
        previous_ids = await collection.distinct(
            "customerId",
            {**eligible, "createdAt": {"$gte": previous_start, "$lt": previous_end}},
        )
        current_customers = len([c for c in current_ids if c])
        previous_customers = len([c for c in previous_ids if c])

    # Keep registered store size available for analytics pages if needed
    from app.services.customers import customer_mongo_filter

    registered_customers = await users.count_documents(customer_mongo_filter())

    avg = round(total_revenue / paid_orders, 2) if paid_orders else 0.0
    previous_avg = (
        round(previous_revenue / previous_paid_orders, 2) if previous_paid_orders else 0.0
    )
    series_days = days if days is not None else 30
    series_start = now - timedelta(days=series_days) if range_ == "all" else current_start
    daily_rows = await collection.aggregate(
        [
            {"$match": {**eligible, "createdAt": {"$gte": series_start, "$lt": now}}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "revenue": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                    "orders": {"$sum": 1},
                }
            },
        ]
    ).to_list(None)
    by_date = {
        row["_id"]: {
            "date": row["_id"],
            "revenue": round(float(row.get("revenue") or 0), 2),
            "orders": int(row.get("orders") or 0),
        }
        for row in daily_rows
    }
    series = [
        by_date.get(
            (series_start + timedelta(days=offset)).strftime("%Y-%m-%d"),
            {
                "date": (series_start + timedelta(days=offset)).strftime("%Y-%m-%d"),
                "revenue": 0,
                "orders": 0,
            },
        )
        for offset in range(series_days + 1)
    ]

    top_products = await collection.aggregate(
        [
            {"$match": {**eligible, "createdAt": {"$gte": series_start, "$lt": now}}},
            {"$unwind": "$items"},
            {
                "$group": {
                    "_id": "$items.productId",
                    "quantity": {"$sum": {"$ifNull": ["$items.quantity", 1]}},
                    "revenue": {
                        "$sum": {
                            "$multiply": [
                                {"$ifNull": ["$items.price", 0]},
                                {"$ifNull": ["$items.quantity", 1]},
                            ]
                        }
                    },
                }
            },
            {"$sort": {"revenue": -1, "quantity": -1}},
            {"$limit": 10},
            {
                "$lookup": {
                    "from": "products",
                    "localField": "_id",
                    "foreignField": "_id",
                    "as": "product",
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "productId": {"$toString": "$_id"},
                    "name": {
                        "$ifNull": [
                            {"$arrayElemAt": ["$product.productName", 0]},
                            {"$arrayElemAt": ["$product.name", 0]},
                            "Unknown product",
                        ]
                    },
                    "quantity": 1,
                    "revenue": 1,
                }
            },
        ]
    ).to_list(10)
    for product in top_products:
        product["quantity"] = int(product.get("quantity") or 0)
        product["revenue"] = round(float(product.get("revenue") or 0), 2)

    channels = await collection.aggregate(
        [
            {"$match": {**eligible, "createdAt": {"$gte": series_start, "$lt": now}}},
            {
                "$group": {
                    "_id": {"$ifNull": ["$attribution.lastTouch.source", "direct"]},
                    "orders": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                }
            },
            {"$sort": {"revenue": -1}},
        ]
    ).to_list(None)
    channels = [
        {
            "source": str(row.get("_id") or "direct"),
            "orders": int(row.get("orders") or 0),
            "revenue": round(float(row.get("revenue") or 0), 2),
        }
        for row in channels
    ]

    location_rows = await collection.aggregate(
        [
            {"$match": {**eligible, "createdAt": {"$gte": series_start, "$lt": now}}},
            {
                "$addFields": {
                    "locationKey": {
                        "$trim": {
                            "input": {
                                "$ifNull": [
                                    "$shippingAddress.state",
                                    {
                                        "$ifNull": [
                                            "$shippingAddress.stateName",
                                            {
                                                "$ifNull": [
                                                    "$shippingAddress.city",
                                                    "Unknown",
                                                ]
                                            },
                                        ]
                                    },
                                ]
                            }
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": {
                        "$cond": [
                            {"$or": [{"$eq": ["$locationKey", ""]}, {"$eq": ["$locationKey", None]}]},
                            "Unknown",
                            "$locationKey",
                        ]
                    },
                    "orders": {"$sum": 1},
                    "sales": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                }
            },
            {"$sort": {"sales": -1}},
            {"$limit": 8},
        ]
    ).to_list(8)
    by_location = [
        {
            "location": str(row.get("_id") or "Unknown"),
            "orders": int(row.get("orders") or 0),
            "sales": round(float(row.get("sales") or 0), 2),
        }
        for row in location_rows
    ]

    async def abandoned_count(start: datetime, end: datetime) -> int:
        return int(
            await collection.count_documents(
                {
                    "status": "abandoned",
                    "createdAt": {"$gte": start, "$lt": end},
                }
            )
        )

    if range_ == "all":
        abandoned_orders = int(
            await collection.count_documents({"status": "abandoned"})
        )
        previous_abandoned = 0
    else:
        abandoned_orders = await abandoned_count(current_start, now)
        previous_abandoned = await abandoned_count(previous_start, previous_end)

    checkout_attempts = paid_orders + abandoned_orders
    previous_checkout_attempts = previous_paid_orders + previous_abandoned
    abandoned_rate = (
        round((abandoned_orders / checkout_attempts) * 100, 1) if checkout_attempts else 0.0
    )
    previous_abandoned_rate = (
        round((previous_abandoned / previous_checkout_attempts) * 100, 1)
        if previous_checkout_attempts
        else 0.0
    )

    return {
        "totalOrders": total_orders,
        "paidOrders": paid_orders,
        "pendingOrders": pending_orders,
        "abandonedOrders": abandoned_orders,
        "abandonedRate": abandoned_rate,
        "totalRevenue": total_revenue,
        # Paying customers in the selected range (dashboard "New customers").
        "newCustomers": current_customers,
        # Distinct paying customers all-time (kept for analytics).
        "totalCustomers": total_customers,
        "registeredCustomers": registered_customers,
        "avgOrderValue": avg,
        "range": range_,
        "trends": {
            "orders": _trend(paid_orders, previous_paid_orders),
            "revenue": _trend(total_revenue, previous_revenue),
            "customers": _trend(current_customers, previous_customers),
            "avgValue": _trend(avg, previous_avg),
            "abandoned": _trend(abandoned_orders, previous_abandoned),
            "abandonedRate": _trend(abandoned_rate, previous_abandoned_rate),
        },
        "previous": {
            "paidOrders": previous_paid_orders,
            "revenue": previous_revenue,
            "customers": previous_customers,
            "abandonedOrders": previous_abandoned,
            "abandonedRate": previous_abandoned_rate,
        },
        "series": series,
        "topProducts": top_products,
        "channels": channels,
        "byLocation": by_location,
    }


@router.get("")
async def list_orders(
    _: AdminUser,
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    from app.services.pagination import parse_pagination

    sk, lim, _pg = parse_pagination(page=page, skip=skip, limit=limit)
    orders = await Order.find_all().sort([("createdAt", -1)]).skip(sk).limit(lim).to_list()
    return [remap_order(o) for o in orders]


@router.get("/{order_id}")
async def get_order(order_id: str, user: CurrentUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _is_owner(order, user):
        raise HTTPException(status_code=403, detail="Not authorized to view this order")
    return remap_order(order)


@router.put("/{order_id}/pay")
async def mark_paid(order_id: str, admin: PaymentsWriter, body: dict | None = None):
    """Staff with payments.write only. Customer payments must use /api/payments/verify."""
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    from app.services.stock import ensure_stock_for_payment

    await ensure_stock_for_payment(order)
    reason = str((body or {}).get("reason") or "admin_manual_mark_paid").strip()[:200]
    order.paymentStatus = "paid"
    # Whitelist only — never merge raw body (stock flags / inventory bypass).
    order.transactionDetails = {
        **(order.transactionDetails or {}),
        "paymentStatus": "paid",
        "markedPaidBy": str(admin.id),
        "markedPaidReason": reason,
    }
    order.updatedAt = datetime.utcnow()
    await order.save()
    await apply_order_commitments(order)
    try:
        await process_full_order_flow(order, admin)
    except Exception as exc:
        print(f"[Orders] mark_paid fulfillment failed: {exc}")
    return remap_order(order)


@router.post("/{order_id}/release-reservation")
async def release_reservation(order_id: str, user: CurrentUser):
    """Release soft-reserved stock when checkout is dismissed / payment abandoned."""
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _is_owner(order, user):
        raise HTTPException(status_code=403, detail="Not authorized")
    pay = str(order.paymentStatus or "").lower()
    if pay in {"paid", "refunded", "partially_refunded"}:
        raise HTTPException(status_code=400, detail="Cannot release reservation for a paid order")
    from app.services.order_abandon import mark_order_abandoned
    from app.services.stock import release_order_stock

    released = await release_order_stock(order)
    # Payment modal closed → this is an abandoned cart order, not an open order.
    abandoned = await mark_order_abandoned(
        order,
        reason="payment_dismissed",
        release_stock=False,
    )
    return {"success": True, "released": bool(released), "abandoned": bool(abandoned)}


@router.put("/{order_id}/deliver")
async def mark_delivered(order_id: str, _: AdminUser):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.isDelivered = True
    order.deliveredAt = datetime.utcnow()
    order.status = "delivered"
    order.shippingStatus = "Delivered"
    await order.save()
    try:
        await erp_ops.ensure_invoice_on_fulfillment(order, context="mark_delivered")
    except Exception:
        pass
    return remap_order(order)
