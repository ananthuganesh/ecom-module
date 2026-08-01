"""AiSensy WhatsApp — API campaigns + optional contact helpers."""

from __future__ import annotations

import asyncio
import os
import re
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.config import get_settings as get_env_settings
from app.documents import AbandonedCheckout, Product, Setting, User
from app.services.aisensy_project import (
    AiSensyProjectClient,
    price_to_minor_units,
    retailer_id_for_variant,
)
SETTING_KEY = "aisensy"
CAMPAIGN_URL = "https://backend.aisensy.com/campaign/t1/api/v2"
# Legacy Direct Contact API fallback when Project ID is missing.
CONTACT_URL_DEFAULT = "https://backend.aisensy.com/direct-apis/t1/contacts"
DEFAULT_ABANDONED_MINUTES = 15
ABANDONED_POLL_SECONDS = 60
DEFAULT_PUBLIC_SITE = "https://urbanaana.com"


def absolute_http_url(value: str | None, *, base: str | None = None) -> str | None:
    """Meta/AiSensy require absolute http(s) URIs for product url / image_url."""
    raw = str(value or "").strip()
    if not raw:
        return None
    if re.match(r"^https?://", raw, flags=re.I):
        return raw
    root = str(base or "").strip().rstrip("/")
    if not root:
        return None
    if not re.match(r"^https?://", root, flags=re.I):
        root = f"https://{root}"
    if raw.startswith("/"):
        return f"{root}{raw}"
    return f"{root}/{raw}"


def resolve_public_site_url(cfg: dict | None = None) -> str:
    cfg = cfg or {}
    candidates = [
        cfg.get("siteUrl"),
        os.environ.get("PUBLIC_WEB_URL"),
        os.environ.get("NEXT_PUBLIC_SITE_URL"),
        os.environ.get("FRONTEND_URL"),
        DEFAULT_PUBLIC_SITE,
    ]
    for c in candidates:
        url = absolute_http_url(str(c or "").strip().rstrip("/"))
        if url:
            return url.rstrip("/")
    return DEFAULT_PUBLIC_SITE


EVENTS = (
    "abandoned",
    "orderPlaced",
    "orderPaid",
    "orderShipped",
    "orderDelivered",
)


def env_secrets() -> dict[str, str]:
    s = get_env_settings()
    return {
        "apiKey": str(s.aisensy_api_key or os.environ.get("AISENSY_API_KEY") or "").strip(),
        "projectId": str(
            getattr(s, "aisensy_project_id", None) or os.environ.get("AISENSY_PROJECT_ID") or ""
        ).strip(),
        "projectApiKey": str(
            s.aisensy_project_api_key or os.environ.get("AISENSY_PROJECT_API_KEY") or ""
        ).strip(),
    }


def project_client_from_cfg(cfg: dict | None = None) -> AiSensyProjectClient:
    cfg = cfg or {}
    secrets = env_secrets()
    return AiSensyProjectClient(
        cfg.get("projectId") or secrets["projectId"],
        cfg.get("projectApiKey") or secrets["projectApiKey"],
    )


def is_messaging_configured(cfg: dict) -> bool:
    """Campaign send works with Project API or legacy API key."""
    client = project_client_from_cfg(cfg)
    return client.configured or bool(str(cfg.get("apiKey") or "").strip())


async def get_settings() -> dict:
    """Merge DB prefs with env secrets. Credentials always come from env."""
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    db = dict(s.value) if s and isinstance(s.value, dict) else {}
    secrets = env_secrets()
    out = {**db, **{k: v for k, v in secrets.items() if v}}
    # Prefer env even when empty so DB keys are never used once migrated.
    out["apiKey"] = secrets["apiKey"]
    out["projectId"] = secrets["projectId"]
    out["projectApiKey"] = secrets["projectApiKey"]
    if not out.get("siteUrl"):
        out["siteUrl"] = (
            os.environ.get("PUBLIC_WEB_URL")
            or os.environ.get("NEXT_PUBLIC_SITE_URL")
            or os.environ.get("FRONTEND_URL")
            or ""
        ).rstrip("/")
    return out


def public_settings(raw: dict | None) -> dict:
    raw = dict(raw or {})
    campaigns = dict(raw.get("campaigns") or {})
    enabled = dict(raw.get("enabled") or {})
    try:
        abandoned_minutes = int(raw.get("abandonedMinutes") or DEFAULT_ABANDONED_MINUTES)
    except (TypeError, ValueError):
        abandoned_minutes = DEFAULT_ABANDONED_MINUTES
    abandoned_minutes = max(1, min(abandoned_minutes, 24 * 60))
    has_api = bool(raw.get("apiKey"))
    has_project = bool(raw.get("projectId") and raw.get("projectApiKey"))
    return {
        "hasApiKey": has_api,
        "isConnected": has_api or has_project,
        "isFromEnv": True,
        "hasProjectId": bool(raw.get("projectId")),
        "hasProjectApiKey": bool(raw.get("projectApiKey")),
        "projectConfigured": has_project,
        "messagingEnabled": bool(raw.get("messagingEnabled", True)),
        "catalogId": raw.get("catalogId") or "",
        "siteUrl": raw.get("siteUrl") or "",
        "abandonedMinutes": abandoned_minutes,
        "campaigns": {k: campaigns.get(k) or "" for k in EVENTS},
        "enabled": {k: bool(enabled.get(k, True)) for k in EVENTS},
        "lastSyncedAt": raw.get("lastSyncedAt"),
        "lastSyncCount": raw.get("lastSyncCount"),
        "lastCatalogSyncedAt": raw.get("lastCatalogSyncedAt"),
        "lastCatalogSyncCount": raw.get("lastCatalogSyncCount"),
        "lastCatalogError": raw.get("lastCatalogError"),
        "lastError": raw.get("lastError"),
        "lastAbandonedScanAt": raw.get("lastAbandonedScanAt"),
        "lastAbandonedSent": raw.get("lastAbandonedSent"),
    }


async def save_prefs(body: dict) -> dict:
    """Persist only non-secret preferences. API keys always come from env."""
    # Drop secrets from what we persist
    db_current = {}
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    if s and isinstance(s.value, dict):
        db_current = dict(s.value)

    campaigns_in = dict(body.get("campaigns") or {})
    enabled_in = dict(body.get("enabled") or {})
    campaigns = {
        k: str(
            campaigns_in.get(k)
            if k in campaigns_in
            else (db_current.get("campaigns") or {}).get(k) or ""
        ).strip()
        for k in EVENTS
    }
    enabled = {
        k: bool(enabled_in.get(k, (db_current.get("enabled") or {}).get(k, True)))
        for k in EVENTS
    }

    try:
        abandoned_minutes = int(
            body.get("abandonedMinutes")
            if body.get("abandonedMinutes") is not None
            else db_current.get("abandonedMinutes") or DEFAULT_ABANDONED_MINUTES
        )
    except (TypeError, ValueError):
        abandoned_minutes = DEFAULT_ABANDONED_MINUTES
    abandoned_minutes = max(1, min(abandoned_minutes, 24 * 60))

    if "messagingEnabled" in body:
        messaging_enabled = bool(body.get("messagingEnabled"))
    else:
        messaging_enabled = bool(db_current.get("messagingEnabled", True))

    value = {
        "siteUrl": str(
            body.get("siteUrl") if body.get("siteUrl") is not None else db_current.get("siteUrl") or ""
        ).strip(),
        "abandonedMinutes": abandoned_minutes,
        "messagingEnabled": messaging_enabled,
        "campaigns": campaigns,
        "enabled": enabled,
        "contactApiUrl": str(
            (db_current.get("contactApiUrl") or "")
        ).strip(),  # env/default only — ignore admin-supplied URLs (SSRF)
        "catalogId": str(db_current.get("catalogId") or "").strip(),
        "lastError": db_current.get("lastError"),
        "lastSyncedAt": db_current.get("lastSyncedAt"),
        "lastSyncCount": db_current.get("lastSyncCount"),
        "lastCatalogSyncedAt": db_current.get("lastCatalogSyncedAt"),
        "lastCatalogSyncCount": db_current.get("lastCatalogSyncCount"),
        "lastCatalogError": db_current.get("lastCatalogError"),
        "lastAbandonedScanAt": db_current.get("lastAbandonedScanAt"),
        "lastAbandonedSent": db_current.get("lastAbandonedSent"),
    }
    if s:
        s.value = value
        await s.save()
    else:
        await Setting(key=SETTING_KEY, value=value).insert()
    return public_settings(await get_settings())


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if not digits:
        return None
    if len(digits) == 10:
        return f"91{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"91{digits[1:]}"
    return digits


async def send_campaign(
    *,
    event: str,
    phone: str | None,
    user_name: str,
    template_params: list[str] | None = None,
    source: str = "urban-aana",
    tags: list[str] | None = None,
    attributes: dict | None = None,
) -> dict[str, Any]:
    cfg = await get_settings()
    if not is_messaging_configured(cfg):
        return {"skipped": True, "reason": "not_configured"}
    if not bool(cfg.get("messagingEnabled", True)):
        return {"skipped": True, "reason": "messaging_disabled"}

    enabled = dict(cfg.get("enabled") or {})
    if not bool(enabled.get(event, True)):
        return {"skipped": True, "reason": "event_disabled"}

    campaigns = dict(cfg.get("campaigns") or {})
    campaign_name = str(campaigns.get(event) or "").strip()
    if not campaign_name:
        return {"skipped": True, "reason": "campaign_not_mapped"}

    destination = normalize_phone(phone)
    if not destination:
        return {"skipped": True, "reason": "no_phone"}

    client = project_client_from_cfg(cfg)
    if client.configured:
        result = await client.send_campaign(
            campaign_name=campaign_name,
            phone_number=destination,
            name=user_name or "Customer",
            template_params=template_params,
            source=source,
            tags=tags,
            attributes=attributes,
        )
        if result.get("ok"):
            await _store_error(None)
            return {
                "ok": True,
                "response": result.get("response"),
                "campaignName": campaign_name,
                "destination": destination,
                "via": "project_api",
            }
        err = str(result.get("error") or "project_send_failed")[:500]
        await _store_error(err)
        return {
            "ok": False,
            "error": err,
            "status": result.get("status"),
            "via": "project_api",
        }

    api_key = str(cfg.get("apiKey") or "").strip()
    payload: dict[str, Any] = {
        "apiKey": api_key,
        "campaignName": campaign_name,
        "destination": destination,
        "userName": (user_name or "Customer")[:80],
        "source": source,
    }
    if template_params:
        payload["templateParams"] = [str(p) for p in template_params]
    if tags:
        payload["tags"] = tags
    if attributes:
        payload["attributes"] = {str(k): str(v) for k, v in attributes.items() if v is not None}

    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(CAMPAIGN_URL, json=payload)
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                err = data.get("message") or data.get("error") or resp.text
                await _store_error(str(err)[:500])
                return {"ok": False, "error": str(err)[:500], "status": resp.status_code, "via": "legacy"}
            await _store_error(None)
            return {
                "ok": True,
                "response": data,
                "campaignName": campaign_name,
                "destination": destination,
                "via": "legacy",
            }
    except Exception as exc:
        await _store_error(str(exc)[:500])
        return {"ok": False, "error": str(exc)[:500], "via": "legacy"}


async def _store_error(message: str | None) -> None:
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    if not s:
        return
    value = dict(s.value or {})
    value["lastError"] = message
    s.value = value
    await s.save()


async def create_contact(
    *,
    name: str,
    phone: str | None,
    email: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Create/update contact via Project API when project id + password are set.
    Falls back to legacy Direct Contact API if only projectApiKey is set.
    """
    cfg = await get_settings()
    mobile = normalize_phone(phone)
    if not mobile:
        return {"skipped": True, "reason": "no_phone"}

    client = project_client_from_cfg(cfg)
    if client.configured:
        return await client.create_contact(name=name or "Customer", mobile_number=mobile)

    project_key = str(cfg.get("projectApiKey") or "").strip()
    if not project_key:
        return {"skipped": True, "reason": "project_api_or_phone_missing"}

    url = (os.environ.get("AISENSY_CONTACT_API_URL") or CONTACT_URL_DEFAULT).strip()
    country = "91"
    local = mobile
    if mobile.startswith("91") and len(mobile) > 10:
        local = mobile[2:]

    body = {
        "name": name or "Customer",
        "mobile_number": local,
        "countryCode": country,
        "country_code": country,
        "phone": mobile,
        "email": email or "",
        "tags": tags or ["urban-aana"],
        "source": "urban-aana",
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-AiSensy-Project-API-Pwd": project_key,
        "Authorization": f"Bearer {project_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(url, json=body, headers=headers)
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "error": data.get("message") or resp.text[:300],
                    "status": resp.status_code,
                }
            return {"ok": True, "response": data}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}


def _product_display_name(product: Product) -> str:
    return str(
        product.productName
        or product.name
        or product.product
        or product.productId
        or "Product"
    ).strip()


def _product_unit_price(product: Product) -> tuple[float, float | None]:
    """Return (list_price, sale_price). Sale is Selling when MRP is higher."""
    pricing = product.pricing
    selling = None
    mrp = None
    if pricing is not None:
        selling = getattr(pricing, "sellingPrice", None)
        mrp = getattr(pricing, "mrp", None)
    if selling is None:
        selling = product.price
    try:
        selling_f = float(selling or 0)
    except (TypeError, ValueError):
        selling_f = 0.0
    try:
        mrp_f = float(mrp) if mrp is not None else None
    except (TypeError, ValueError):
        mrp_f = None
    if mrp_f is not None and mrp_f > selling_f > 0:
        return mrp_f, selling_f
    return selling_f, None


def _variant_image(product: Product, variant: dict | None, *, site: str) -> str | None:
    images = list((variant or {}).get("images") or [])
    for img in images:
        abs_url = absolute_http_url(img, base=site)
        if abs_url:
            return abs_url
    for img in product.thumbnails or []:
        abs_url = absolute_http_url(img, base=site)
        if abs_url:
            return abs_url
    return None


def _variant_label(product: Product, variant: dict | None) -> str:
    base = _product_display_name(product)
    if not variant:
        return base
    bits = [
        str(variant.get("color") or "").strip(),
        str(variant.get("size") or "").strip(),
        str(variant.get("customValue") or "").strip(),
    ]
    bits = [b for b in bits if b]
    return f"{base} — {' / '.join(bits)}" if bits else base


async def _persist_catalog_prefs(**updates: Any) -> None:
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    prefs = dict(s.value) if s and isinstance(s.value, dict) else {}
    prefs.update(updates)
    # Never persist secrets
    prefs.pop("apiKey", None)
    prefs.pop("projectApiKey", None)
    prefs.pop("projectId", None)
    if s:
        s.value = prefs
        await s.save()
    else:
        await Setting(key=SETTING_KEY, value=prefs).insert()


async def sync_catalog() -> dict[str, Any]:
    """Ensure catalog exists and upsert one AiSensy product per active variant."""
    cfg = await get_settings()
    client = project_client_from_cfg(cfg)
    if not client.configured:
        return {
            "skipped": True,
            "reason": "project_not_configured",
            **public_settings(cfg),
        }

    site = resolve_public_site_url(cfg)
    catalog_placeholder = absolute_http_url("/banner.webp", base=site) or f"{site}/banner.webp"
    ensured = await client.ensure_catalog_id(
        preferred_id=str(cfg.get("catalogId") or "").strip() or None,
        default_image_url=catalog_placeholder,
    )
    if not ensured.get("ok"):
        err = str(ensured.get("error") or "catalog_ensure_failed")[:500]
        await _persist_catalog_prefs(lastCatalogError=err)
        return {"ok": False, "error": err, **public_settings(await get_settings())}

    catalog_id = str(ensured["catalogId"])
    products = await Product.find(Product.status == "active").to_list()

    created = 0
    failed = 0
    skipped = 0
    errors: list[str] = []

    for product in products:
        pid = str(product.productId or product.id)
        slug = str(product.slug or pid)
        product_url = absolute_http_url(f"/product/{slug}", base=site)
        if not product_url:
            failed += 1
            if len(errors) < 5:
                errors.append(f"{pid}: missing absolute product url (set Store URL)")
            continue
        price, sale = _product_unit_price(product)
        category = str(product.category or product.type or "General")[:200] or "General"
        brand = str(product.brand or "Urban Aana")[:100]
        description = str(product.description or _product_display_name(product))[:4000]
        variants = list(product.variants or [])
        rows = variants if variants else [None]

        for index, variant in enumerate(rows):
            if variant is None:
                vdict: dict = {}
            elif isinstance(variant, dict):
                vdict = variant
            elif hasattr(variant, "model_dump"):
                vdict = variant.model_dump()
            else:
                vdict = {
                    "color": getattr(variant, "color", "") or "",
                    "size": getattr(variant, "size", "") or "",
                    "customValue": getattr(variant, "customValue", "") or "",
                    "sku": getattr(variant, "sku", None),
                    "images": list(getattr(variant, "images", None) or []),
                }

            image_url = _variant_image(product, vdict if variant is not None else None, site=site)
            if not image_url:
                skipped += 1
                continue
            payload: dict[str, Any] = {
                "catalogId": catalog_id,
                "name": _variant_label(product, vdict if variant is not None else None)[:200],
                "category": category,
                "currency": "INR",
                "image_url": image_url,
                "price": price_to_minor_units(price),
                "retailer_id": retailer_id_for_variant(
                    product_id=pid,
                    variant=vdict if variant is not None else None,
                    index=index,
                ),
                "description": description,
                "url": product_url,
                "brand": brand,
            }
            if sale is not None:
                payload["sale_price"] = price_to_minor_units(sale)

            result = await client.create_product(payload)
            if result.get("ok"):
                created += 1
            else:
                failed += 1
                msg = str(result.get("error") or "create_product_failed")[:200]
                if len(errors) < 5:
                    errors.append(f"{payload['retailer_id']}: {msg}")

    sync_meta = await client.sync_catalog_products()
    if not sync_meta.get("ok"):
        # Non-fatal if products were created; Meta sync may need connected catalog.
        if len(errors) < 5:
            errors.append(str(sync_meta.get("error") or "sync_catalog_products_failed")[:200])

    await client.sync_catalog()

    await _persist_catalog_prefs(
        catalogId=catalog_id,
        siteUrl=site,
        lastCatalogSyncedAt=datetime.utcnow().isoformat(),
        lastCatalogSyncCount=created,
        lastCatalogError="; ".join(errors) if errors else None,
    )

    out = public_settings(await get_settings())
    return {
        "ok": failed == 0,
        "catalogId": catalog_id,
        "created": created,
        "failed": failed,
        "skipped": skipped,
        "productCount": len(products),
        "errors": errors,
        **out,
    }

def _order_phone(order, user=None) -> str | None:
    addr = order.shippingAddress or {}
    return (
        addr.get("phone")
        or addr.get("contact")
        or (user.phone if user else None)
        or (order.transactionDetails or {}).get("customerDetails", {}).get("phone")
    )


def _order_name(order, user=None) -> str:
    addr = order.shippingAddress or {}
    return (
        addr.get("name")
        or (user.name if user else None)
        or "Customer"
    )


async def notify_order_event(event: str, order, user=None) -> dict:
    """WhatsApp toggles live in AiSensy settings (master + per-event)."""
    phone = _order_phone(order, user)
    name = _order_name(order, user)
    order_no = order.orderNumber or str(order.id)[-8:]
    amount = f"{float(order.finalPrice or 0):.2f}"
    awb = order.awb or ""
    params_by_event = {
        "orderPlaced": [name, str(order_no), amount],
        "orderPaid": [name, str(order_no), amount],
        "orderShipped": [name, str(order_no), awb or "pending"],
        "orderDelivered": [name, str(order_no)],
    }
    return await send_campaign(
        event=event,
        phone=phone,
        user_name=name,
        template_params=params_by_event.get(event) or [name, str(order_no)],
        source="urban-aana-orders",
        tags=["order", event],
        attributes={
            "OrderId": str(order.id),
            "OrderNumber": str(order_no),
            "Amount": amount,
            "AWB": awb,
        },
    )


async def notify_order_event_once(event: str, order, user=None) -> dict:
    """Send once per order+event (idempotent across verify + webhook)."""
    details = dict(order.transactionDetails or {})
    sent = dict(details.get("aisensy") or {})
    if sent.get(event):
        return {"skipped": True, "reason": "already_sent"}
    try:
        result = await notify_order_event(event, order, user)
    except Exception as exc:
        print(f"[AiSensy] {event} failed: {exc}")
        return {"ok": False, "error": str(exc)[:300]}
    if result.get("ok"):
        sent[event] = datetime.utcnow().isoformat()
        details["aisensy"] = sent
        order.transactionDetails = details
        try:
            await order.save()
        except Exception:
            pass
    return result


async def notify_abandoned(checkout) -> dict:
    details = dict(checkout.customerDetails or {})
    phone = details.get("phone")
    name = details.get("name") or "Customer"

    if not phone and checkout.userId:
        try:
            from bson import ObjectId

            uid = checkout.userId
            if not isinstance(uid, ObjectId) and ObjectId.is_valid(str(uid)):
                uid = ObjectId(str(uid))
            user = await User.get(uid)
        except Exception:
            user = None
        if user:
            phone = getattr(user, "phone", None) or phone
            name = details.get("name") or getattr(user, "name", None) or name
            if phone or getattr(user, "email", None):
                if phone:
                    details["phone"] = phone
                if getattr(user, "email", None) and not details.get("email"):
                    details["email"] = user.email
                if name and not details.get("name"):
                    details["name"] = name
                checkout.customerDetails = details
                try:
                    await checkout.save()
                except Exception:
                    pass

    cfg = await get_settings()
    site = str(cfg.get("siteUrl") or os.environ.get("PUBLIC_WEB_URL") or os.environ.get("NEXT_PUBLIC_SITE_URL") or "").rstrip("/")
    from app.services import cart_recovery

    await cart_recovery.ensure_recovery_token(checkout)
    await checkout.save()
    token = checkout.recoveryToken
    cart_link = f"{site}/cart/recover?token={token}" if site else f"/cart/recover?token={token}"
    amount = f"{float(checkout.totalAmount or 0):.2f}"
    item_count = str(len(checkout.items or []))
    return await send_campaign(
        event="abandoned",
        phone=phone,
        user_name=name,
        template_params=[name, amount, item_count, cart_link],
        source="urban-aana-abandoned",
        tags=["abandoned_cart"],
        attributes={
            "CartTotal": amount,
            "CartLink": cart_link,
            "Email": details.get("email") or "",
        },
    )


async def process_due_abandoned_recoveries() -> dict[str, Any]:
    """
    Auto-send WhatsApp + email for abandoned checkouts idle longer than abandonedMinutes.
    Sends once per checkout (recoverySentAt). Email works even when WhatsApp is not mapped.
    """
    cfg = await get_settings()
    wa_ready = (
        is_messaging_configured(cfg)
        and bool(cfg.get("messagingEnabled", True))
        and bool((cfg.get("enabled") or {}).get("abandoned", True))
        and bool(str((cfg.get("campaigns") or {}).get("abandoned") or "").strip())
    )
    # Always attempt email path when Resend is configured; WA optional.
    from app.services import email_resend as email_svc

    email_ready = bool(email_svc._resend_api_key())
    if not wa_ready and not email_ready:
        return {"skipped": True, "reason": "not_configured"}

    try:
        minutes = int(cfg.get("abandonedMinutes") or DEFAULT_ABANDONED_MINUTES)
    except (TypeError, ValueError):
        minutes = DEFAULT_ABANDONED_MINUTES
    minutes = max(1, min(minutes, 24 * 60))
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)

    rows = await AbandonedCheckout.find(
        AbandonedCheckout.status == "abandoned",
        AbandonedCheckout.recoverySentAt == None,  # noqa: E711
        AbandonedCheckout.lastActivityAt <= cutoff,
    ).limit(50).to_list()

    sent = 0
    failed = 0
    skipped = 0
    for checkout in rows:
        details = checkout.customerDetails or {}
        has_phone = bool(normalize_phone(details.get("phone")))
        has_email = bool(str(details.get("email") or "").strip())
        user = None
        if checkout.userId:
            try:
                from bson import ObjectId

                uid = checkout.userId
                if not isinstance(uid, ObjectId) and ObjectId.is_valid(str(uid)):
                    uid = ObjectId(str(uid))
                user = await User.get(uid)
            except Exception:
                user = None
            if user:
                has_phone = has_phone or bool(normalize_phone(getattr(user, "phone", None)))
                has_email = has_email or bool(str(getattr(user, "email", None) or "").strip())

        if not has_phone and not has_email:
            skipped += 1
            continue

        checkout.recoverySentAt = datetime.utcnow()
        await checkout.save()

        wa_result: dict[str, Any] = {"skipped": True, "reason": "whatsapp_unavailable"}
        email_result: dict[str, Any] = {"skipped": True, "reason": "no_email"}

        try:
            if has_phone and wa_ready:
                wa_result = await notify_abandoned(checkout)
        except Exception as exc:
            wa_result = {"ok": False, "error": str(exc)[:300]}

        try:
            from app.services import cart_recovery

            await cart_recovery.ensure_recovery_token(checkout)
            await checkout.save()
            site = str(
                cfg.get("siteUrl")
                or os.environ.get("PUBLIC_WEB_URL")
                or os.environ.get("NEXT_PUBLIC_SITE_URL")
                or ""
            ).rstrip("/")
            token = checkout.recoveryToken
            cart_link = (
                f"{site}/cart/recover?token={token}" if site else f"/cart/recover?token={token}"
            )
            if has_email and email_ready:
                email_result = await email_svc.notify_abandoned_cart_email(
                    checkout, cart_link=cart_link, user=user
                )
        except Exception as exc:
            email_result = {"ok": False, "error": str(exc)[:300]}

        ok = bool(wa_result.get("ok") or email_result.get("ok"))
        checkout.recoveryLastResult = {
            "whatsapp": {k: v for k, v in (wa_result or {}).items() if k != "response"},
            "email": {k: v for k, v in (email_result or {}).items() if k != "response"},
            **({"emailSentAt": datetime.utcnow().isoformat()} if email_result.get("ok") else {}),
        }
        if ok:
            sent += 1
            await checkout.save()
        else:
            checkout.recoverySentAt = None
            await checkout.save()
            if wa_result.get("skipped") and email_result.get("skipped"):
                skipped += 1
            else:
                failed += 1

    scan = {
        "scanned": len(rows),
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "cutoffMinutes": minutes,
        "whatsappReady": wa_ready,
        "emailReady": email_ready,
    }
    try:
        s = await Setting.find_one(Setting.key == SETTING_KEY)
        if s:
            value = dict(s.value or {})
            value["lastAbandonedScanAt"] = datetime.utcnow().isoformat()
            value["lastAbandonedSent"] = sent
            s.value = value
            await s.save()
    except Exception:
        pass
    return scan


async def abandoned_recovery_loop(stop_event: asyncio.Event) -> None:
    """Background poller started from app lifespan."""
    while not stop_event.is_set():
        try:
            from app.services import order_abandon

            mark_result = await order_abandon.mark_stale_unpaid_orders_abandoned()
            if mark_result.get("marked"):
                print(f"[Orders] Marked unpaid gateway exits abandoned: {mark_result}")
        except Exception as exc:
            print(f"[Orders] Abandon unpaid scan error: {exc}")
        try:
            result = await process_due_abandoned_recoveries()
            if result.get("sent"):
                print(f"[AiSensy] Abandoned auto-recovery: {result}")
        except Exception as exc:
            print(f"[AiSensy] Abandoned scan error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=ABANDONED_POLL_SECONDS)
        except asyncio.TimeoutError:
            pass
