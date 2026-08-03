"""Meta Conversions API (server events) — complements GTM browser Pixel."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any

import httpx

from app.documents import Order, User


def _env(key: str, default: str = "") -> str:
    return str(os.environ.get(key) or default).strip()


def is_configured() -> bool:
    return bool(_env("META_PIXEL_ID") and _env("META_CAPI_ACCESS_TOKEN"))


def _sha256_norm(value: str) -> str | None:
    text = str(value or "").strip().lower()
    if not text:
        return None
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _phone_e164ish(raw: str) -> str:
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if not digits:
        return ""
    # India storefront default: 10-digit mobiles → prefix 91
    if len(digits) == 10:
        return f"91{digits}"
    return digits


def _user_data_from_order(order: Order, user: User | None = None) -> dict[str, Any]:
    addr = dict(order.shippingAddress or {})
    email = (
        (user.email if user else None)
        or addr.get("email")
        or addr.get("Email")
        or ""
    )
    phone = (
        (user.phone if user else None)
        or addr.get("phone")
        or addr.get("Phone")
        or addr.get("mobile")
        or ""
    )
    first = addr.get("firstName") or addr.get("name") or ""
    last = addr.get("lastName") or ""
    if not last and isinstance(first, str) and " " in first.strip():
        parts = first.strip().split(None, 1)
        first, last = parts[0], parts[1]

    city = addr.get("city") or addr.get("City") or ""
    state = addr.get("state") or addr.get("State") or ""
    zip_code = addr.get("pincode") or addr.get("zip") or addr.get("postalCode") or ""
    country = (addr.get("country") or addr.get("Country") or "in").strip().lower()
    if country in {"india", "ind"}:
        country = "in"

    user_data: dict[str, Any] = {}
    em = _sha256_norm(str(email))
    ph = _sha256_norm(_phone_e164ish(str(phone)))
    fn = _sha256_norm(str(first))
    ln = _sha256_norm(str(last))
    ct = _sha256_norm(str(city))
    st = _sha256_norm(str(state))
    zp = _sha256_norm(str(zip_code))
    country_hash = _sha256_norm(country)

    if em:
        user_data["em"] = [em]
    if ph:
        user_data["ph"] = [ph]
    if fn:
        user_data["fn"] = [fn]
    if ln:
        user_data["ln"] = [ln]
    if ct:
        user_data["ct"] = [ct]
    if st:
        user_data["st"] = [st]
    if zp:
        user_data["zp"] = [zp]
    if country_hash:
        user_data["country"] = [country_hash]

    return user_data


def _contents_from_order(order: Order) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in order.items or []:
        pid = str(getattr(item, "productId", None) or "")
        qty = int(getattr(item, "quantity", 0) or 0)
        price = float(getattr(item, "price", 0) or 0)
        if not pid or qty <= 0:
            continue
        out.append(
            {
                "id": pid,
                "quantity": qty,
                "item_price": round(price, 2),
            }
        )
    return out


async def send_events(
    events: list[dict[str, Any]],
    *,
    test_event_code: str | None = None,
) -> dict[str, Any]:
    pixel_id = _env("META_PIXEL_ID")
    token = _env("META_CAPI_ACCESS_TOKEN")
    if not pixel_id or not token:
        return {"ok": False, "skipped": True, "reason": "meta_capi_not_configured"}
    if not events:
        return {"ok": False, "skipped": True, "reason": "no_events"}

    code = (test_event_code if test_event_code is not None else _env("META_TEST_EVENT_CODE")).strip()
    body: dict[str, Any] = {"data": events}
    if code:
        body["test_event_code"] = code

    url = f"https://graph.facebook.com/v21.0/{pixel_id}/events"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, params={"access_token": token}, json=body)
        payload = {}
        try:
            payload = res.json()
        except Exception:
            payload = {"raw": (res.text or "")[:500]}
        ok = res.status_code < 400 and not payload.get("error")
        return {
            "ok": ok,
            "status": res.status_code,
            "response": payload,
            "test_event_code": code or None,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def send_test_page_view(*, test_event_code: str | None = None) -> dict[str, Any]:
    """Fire a PageView for Events Manager → Test events (server)."""
    site = _env("PUBLIC_WEB_URL") or "https://urbanaana.com"
    event = {
        "event_name": "PageView",
        "event_time": int(time.time()),
        "event_id": f"test-pageview-{int(time.time())}",
        "event_source_url": site.rstrip("/") + "/",
        "action_source": "website",
        "user_data": {
            "client_user_agent": "urbanaana-capi-test",
        },
    }
    return await send_events([event], test_event_code=test_event_code)


async def notify_purchase_once(order: Order, user: User | None = None) -> dict[str, Any]:
    """Send Purchase to Meta CAPI once per paid order (deduped via transactionDetails)."""
    if not is_configured():
        return {"ok": False, "skipped": True, "reason": "meta_capi_not_configured"}
    if str(order.paymentStatus or "").lower() != "paid":
        return {"ok": False, "skipped": True, "reason": "not_paid"}

    details = dict(order.transactionDetails or {})
    if details.get("metaPurchaseSent"):
        return {"ok": True, "skipped": True, "reason": "already_sent"}

    site = (_env("PUBLIC_WEB_URL") or "https://urbanaana.com").rstrip("/")
    event_id = str(order.orderNumber or order.id)
    value = float(order.finalPrice or order.total or 0)
    contents = _contents_from_order(order)

    event = {
        "event_name": "Purchase",
        "event_time": int(time.time()),
        "event_id": event_id,
        "event_source_url": f"{site}/checkout/success",
        "action_source": "website",
        "user_data": _user_data_from_order(order, user),
        "custom_data": {
            "currency": "INR",
            "value": round(value, 2),
            "content_type": "product",
            "contents": contents,
            "num_items": sum(int(c.get("quantity") or 0) for c in contents),
            "order_id": event_id,
        },
    }

    result = await send_events([event])
    if result.get("ok"):
        col = Order.get_pymongo_collection()
        await col.update_one(
            {"_id": order.id},
            {
                "$set": {
                    "transactionDetails.metaPurchaseSent": True,
                    "transactionDetails.metaPurchaseAt": int(time.time()),
                    "transactionDetails.metaPurchaseEventId": event_id,
                }
            },
        )
    else:
        print(f"[Meta CAPI] Purchase failed for {order.id}: {result}")
    return result
