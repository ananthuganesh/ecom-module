"""Server-side conversion events: GA4 Measurement Protocol and Meta Conversions API.

The storefront already pushes `purchase` to the dataLayer, but only from the
success page — lost when a shopper closes the tab after paying, loses network,
or blocks tag scripts. Sending the same event from the server, keyed on the
same id, closes that gap without double counting:

- GA4 deduplicates `purchase` on `transaction_id`.
- Meta deduplicates on `event_name` + `event_id`.

Both use the order's database id, which is what the browser sends as
`transaction_id`. Everything here is best-effort: a failed send is logged and
recorded, never raised into the payment or refund path that called it.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import datetime
from typing import Any

import httpx
from fastapi import Request

from app.config import get_settings
from app.documents import Order, Product, User

logger = logging.getLogger(__name__)

GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect"
CURRENCY = "INR"


# --------------------------------------------------------------------------
# Browser context captured at checkout
# --------------------------------------------------------------------------


def ga_client_id_from_cookie(value: str | None) -> str | None:
    """`_ga` is "GA1.1.<random>.<timestamp>"; GA4 wants the last two parts."""
    parts = str(value or "").strip().split(".")
    if len(parts) >= 4 and parts[-2].isdigit() and parts[-1].isdigit():
        return f"{parts[-2]}.{parts[-1]}"
    return None


def browser_context_from_request(request: Request | None) -> dict[str, Any]:
    """Identifiers the ad platforms need to join a server event to a visit.

    Read at order creation because the payment webhook arrives from Razorpay,
    not the shopper's browser, and has none of them.
    """
    if request is None:
        return {}
    cookies = request.cookies or {}
    headers = request.headers or {}
    forwarded = str(headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = forwarded or (request.client.host if request.client else "")
    context = {
        "gaClientId": ga_client_id_from_cookie(cookies.get("_ga")),
        "fbp": cookies.get("_fbp") or None,
        "fbc": cookies.get("_fbc") or None,
        "ip": ip or None,
        "userAgent": str(headers.get("user-agent") or "")[:512] or None,
    }
    return {k: v for k, v in context.items() if v}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _sha256(value: str | None) -> str | None:
    text = str(value or "").strip().lower()
    return hashlib.sha256(text.encode("utf-8")).hexdigest() if text else None


def _normalize_phone(value: Any) -> str | None:
    """Meta wants digits with country code and no symbols."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 10:
        digits = f"91{digits}"
    return digits or None


def _config() -> dict[str, str]:
    s = get_settings()
    return {
        "ga4_measurement_id": str(s.ga4_measurement_id or "").strip(),
        "ga4_api_secret": str(s.ga4_api_secret or "").strip(),
        "meta_pixel_id": str(s.meta_pixel_id or "").strip(),
        "meta_token": str(s.meta_capi_access_token or "").strip(),
        "meta_test_code": str(s.meta_capi_test_event_code or "").strip(),
        "meta_version": str(s.meta_graph_version or "v23.0").strip() or "v23.0",
    }


def ga4_configured(cfg: dict | None = None) -> bool:
    cfg = cfg or _config()
    return bool(cfg["ga4_measurement_id"] and cfg["ga4_api_secret"])


def meta_configured(cfg: dict | None = None) -> bool:
    cfg = cfg or _config()
    return bool(cfg["meta_pixel_id"] and cfg["meta_token"])


def event_id_for(order: Order) -> str:
    """The id the browser sends as transaction_id — must match for dedup."""
    return str(order.id)


def _order_value(order: Order) -> float:
    return round(float(order.finalPrice or order.total or 0), 2)


async def _items(order: Order) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in order.items or []:
        product_id = str(getattr(line, "productId", "") or "")
        name = getattr(line, "productName", None) or ""
        category = ""
        if product_id and not name:
            try:
                from bson import ObjectId

                if ObjectId.is_valid(product_id):
                    product = await Product.get(ObjectId(product_id))
                    if product:
                        name = product.productName or ""
                        category = str(product.category or "")
            except Exception:  # noqa: BLE001
                pass
        out.append(
            {
                "item_id": product_id or name or "item",
                "item_name": name or "Item",
                "item_variant": getattr(line, "size", "") or None,
                "item_category": category or None,
                "price": round(float(getattr(line, "price", 0) or 0), 2),
                "quantity": int(getattr(line, "quantity", 1) or 1),
            }
        )
    return out


def _context(order: Order) -> dict[str, Any]:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    ctx = details.get("browserContext")
    return ctx if isinstance(ctx, dict) else {}


def _ga_client_id(order: Order) -> str:
    """Falls back to a stable per-order id so the event still lands.

    Without the browser's `_ga` it will not join the original session, but a
    reported purchase beats a missing one.
    """
    return _context(order).get("gaClientId") or f"server.{int(order.id.generation_time.timestamp())}"


def _already_sent(order: Order, key: str, channel: str) -> bool:
    details = order.transactionDetails if isinstance(order.transactionDetails, dict) else {}
    record = (details.get("serverConversions") or {}).get(key) or {}
    return bool((record.get(channel) or {}).get("ok"))


async def _record(order: Order, key: str, channel: str, result: dict[str, Any]) -> None:
    """Persist the send outcome on the order, touching only that field."""
    try:
        await Order.get_pymongo_collection().update_one(
            {"_id": order.id},
            {
                "$set": {
                    f"transactionDetails.serverConversions.{key}.{channel}": {
                        **result,
                        "at": datetime.utcnow().isoformat(),
                    }
                }
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not record %s %s conversion: %s", key, channel, exc)


# --------------------------------------------------------------------------
# GA4
# --------------------------------------------------------------------------


async def _send_ga4(payload: dict[str, Any], cfg: dict[str, str]) -> dict[str, Any]:
    params = {"measurement_id": cfg["ga4_measurement_id"], "api_secret": cfg["ga4_api_secret"]}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(GA4_ENDPOINT, params=params, json=payload)
        # The collect endpoint answers 2xx with an empty body even for bad
        # payloads; only the debug endpoint validates. A 2xx means accepted.
        if resp.status_code < 300:
            return {"ok": True, "status": resp.status_code}
        return {"ok": False, "status": resp.status_code, "error": resp.text[:300]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


async def build_ga4_purchase(order: Order, user: User | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "client_id": _ga_client_id(order),
        "events": [
            {
                "name": "purchase",
                "params": {
                    "transaction_id": event_id_for(order),
                    "value": _order_value(order),
                    "currency": CURRENCY,
                    "shipping": round(float(order.deliveryAmount or 0), 2),
                    "coupon": order.couponCode or None,
                    "items": await _items(order),
                },
            }
        ],
    }
    if user and user.id:
        payload["user_id"] = str(user.id)
    return payload


def build_ga4_refund(order: Order, user: User | None, amount: float | None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "transaction_id": event_id_for(order),
        "currency": CURRENCY,
    }
    # A value makes it a partial refund; omitting it refunds the whole order.
    if amount is not None:
        params["value"] = round(float(amount), 2)
    payload: dict[str, Any] = {
        "client_id": _ga_client_id(order),
        "events": [{"name": "refund", "params": params}],
    }
    if user and user.id:
        payload["user_id"] = str(user.id)
    return payload


# --------------------------------------------------------------------------
# Meta
# --------------------------------------------------------------------------


async def build_meta_purchase(order: Order, user: User | None) -> dict[str, Any]:
    ctx = _context(order)
    addr = order.shippingAddress or {}
    email = (user.email if user else None) or addr.get("email")
    phone = _normalize_phone(addr.get("phone") or (user.phone if user else None))

    user_data: dict[str, Any] = {
        "client_ip_address": ctx.get("ip"),
        "client_user_agent": ctx.get("userAgent"),
        "fbp": ctx.get("fbp"),
        "fbc": ctx.get("fbc"),
    }
    if email:
        user_data["em"] = [_sha256(email)]
    if phone:
        user_data["ph"] = [_sha256(phone)]
    if user and user.id:
        user_data["external_id"] = [_sha256(str(user.id))]
    user_data = {k: v for k, v in user_data.items() if v}

    items = await _items(order)
    event: dict[str, Any] = {
        "event_name": "Purchase",
        "event_time": int(time.time()),
        "event_id": event_id_for(order),
        "action_source": "website",
        "user_data": user_data,
        "custom_data": {
            "currency": CURRENCY,
            "value": _order_value(order),
            "order_id": order.orderNumber or event_id_for(order),
            "content_type": "product",
            "contents": [
                {"id": i["item_id"], "quantity": i["quantity"], "item_price": i["price"]}
                for i in items
            ],
        },
    }
    return {"data": [event]}


async def _send_meta(payload: dict[str, Any], cfg: dict[str, str]) -> dict[str, Any]:
    url = f"https://graph.facebook.com/{cfg['meta_version']}/{cfg['meta_pixel_id']}/events"
    body = dict(payload)
    if cfg["meta_test_code"]:
        body["test_event_code"] = cfg["meta_test_code"]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, params={"access_token": cfg["meta_token"]}, json=body)
        data = resp.json() if resp.content else {}
        if resp.status_code < 300 and "error" not in data:
            return {"ok": True, "received": data.get("events_received")}
        err = (data.get("error") or {}).get("message") if isinstance(data, dict) else None
        return {"ok": False, "status": resp.status_code, "error": (err or resp.text)[:300]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


# --------------------------------------------------------------------------
# Public entry points
# --------------------------------------------------------------------------


async def send_purchase(order: Order, user: User | None = None) -> dict[str, Any]:
    """Report a paid order to GA4 and Meta. Safe to call more than once."""
    cfg = _config()
    result: dict[str, Any] = {}

    if ga4_configured(cfg) and not _already_sent(order, "purchase", "ga4"):
        outcome = await _send_ga4(await build_ga4_purchase(order, user), cfg)
        await _record(order, "purchase", "ga4", outcome)
        result["ga4"] = outcome

    if meta_configured(cfg) and not _already_sent(order, "purchase", "meta"):
        outcome = await _send_meta(await build_meta_purchase(order, user), cfg)
        await _record(order, "purchase", "meta", outcome)
        result["meta"] = outcome

    return result


async def send_refund(
    order: Order, user: User | None = None, *, amount: float | None = None, key: str = "refund"
) -> dict[str, Any]:
    """Report a refund to GA4 so revenue stops counting it.

    Meta's Conversions API has no refund event, so only GA4 is told. `key`
    distinguishes separate partial refunds on the same order.
    """
    cfg = _config()
    if not ga4_configured(cfg) or _already_sent(order, key, "ga4"):
        return {}
    outcome = await _send_ga4(build_ga4_refund(order, user, amount), cfg)
    await _record(order, key, "ga4", outcome)
    return {"ga4": outcome}
