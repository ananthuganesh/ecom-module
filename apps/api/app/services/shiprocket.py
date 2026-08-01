"""Shiprocket integration — no-op when credentials missing; only call after paid/COD."""

from datetime import datetime

import httpx

from app.config import get_settings
from app.documents import Order, Setting, User

TOKEN_KEY = "shiprocket_token"


async def _get_token() -> str | None:
    settings = get_settings()
    if not settings.shiprocket_email or not settings.shiprocket_password:
        return None
    cached = await Setting.find_one(Setting.key == TOKEN_KEY)
    if cached and isinstance(cached.value, dict) and cached.value.get("token"):
        return cached.value["token"]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://apiv2.shiprocket.in/v1/external/auth/login",
            json={"email": settings.shiprocket_email, "password": settings.shiprocket_password},
        )
        resp.raise_for_status()
        token = resp.json().get("token")
    if token:
        existing = await Setting.find_one(Setting.key == TOKEN_KEY)
        if existing:
            existing.value = {"token": token}
            await existing.save()
        else:
            await Setting(key=TOKEN_KEY, value={"token": token}).insert()
    return token


async def process_full_order_flow(order: Order, user: User) -> dict:
    """Create Shiprocket order when credentials exist; otherwise mark pending sync."""
    payment_ok = order.paymentMethod == "cod" or order.paymentStatus == "paid"
    if not payment_ok:
        order.shippingStatus = "Payment Pending"
        await order.save()
        return {"skipped": True, "reason": "payment_pending"}

    token = await _get_token()
    if not token:
        order.shippingStatus = order.shippingStatus or "Shipping Pending"
        await order.save()
        return {"skipped": True, "reason": "no_credentials"}

    addr = order.shippingAddress or {}
    payload = {
        "order_id": str(order.id),
        "order_date": (order.createdAt or datetime.utcnow()).strftime("%Y-%m-%d %H:%M"),
        "pickup_location": "Primary",
        "billing_customer_name": addr.get("name") or user.name,
        "billing_last_name": "",
        "billing_address": addr.get("house") or addr.get("address") or "",
        "billing_city": addr.get("city") or "",
        "billing_pincode": addr.get("pincode") or "",
        "billing_state": addr.get("state") or "",
        "billing_country": addr.get("country") or "India",
        "billing_email": user.email or "orders@urbanaana.com",
        "billing_phone": addr.get("phone") or user.phone or "",
        "shipping_is_billing": True,
        "order_items": [
            {
                "name": f"Item-{i}",
                "sku": f"SKU-{i}",
                "units": it.quantity,
                "selling_price": it.price,
            }
            for i, it in enumerate(order.items or [], start=1)
        ],
        "payment_method": "COD" if order.paymentMethod == "cod" else "Prepaid",
        "sub_total": order.finalPrice,
        "length": 10,
        "breadth": 10,
        "height": 10,
        "weight": 0.5,
    }
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        data = resp.json() if resp.content else {}
        if resp.is_success:
            order.shiprocketOrderId = str(data.get("order_id") or data.get("shipment_id") or "")
            order.shippingStatus = "Ready To Ship"
            order.updatedAt = datetime.utcnow()
            await order.save()
        else:
            order.shippingStatus = "Shipping Sync Failed"
            await order.save()
            raise RuntimeError(data.get("message") or resp.text)
    return data


async def track_shipment(order: Order) -> dict:
    token = await _get_token()
    if not token or not order.awb:
        return {"status": order.shippingStatus or "unknown", "awb": order.awb}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://apiv2.shiprocket.in/v1/external/courier/track/awb/{order.awb}",
            headers={"Authorization": f"Bearer {token}"},
        )
        return resp.json() if resp.content else {}
