"""Unguessable abandoned-cart recovery tokens."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any

from app.documents import AbandonedCheckout

RECOVERY_TOKEN_BYTES = 32
RECOVERY_TOKEN_TTL_DAYS = 14


def new_recovery_token() -> str:
    return secrets.token_urlsafe(RECOVERY_TOKEN_BYTES)


def recovery_expiry(*, days: int = RECOVERY_TOKEN_TTL_DAYS) -> datetime:
    return datetime.utcnow() + timedelta(days=days)


def token_is_valid(checkout: AbandonedCheckout) -> bool:
    if not checkout or not (checkout.recoveryToken or "").strip():
        return False
    if (checkout.status or "").strip().lower() != "abandoned":
        return False
    expires = checkout.recoveryTokenExpiresAt
    if expires and expires < datetime.utcnow():
        return False
    return True


async def ensure_recovery_token(checkout: AbandonedCheckout) -> AbandonedCheckout:
    """Mint or refresh a recovery token. Caller should save if needed."""
    if token_is_valid(checkout):
        return checkout
    checkout.recoveryToken = new_recovery_token()
    checkout.recoveryTokenExpiresAt = recovery_expiry()
    return checkout


def public_checkout_dict(checkout: AbandonedCheckout) -> dict[str, Any]:
    """Serialize for browser upsert responses — never expose recoveryToken."""
    from app.serializers import doc_to_dict

    data = doc_to_dict(checkout)
    data.pop("recoveryToken", None)
    data.pop("recoveryTokenExpiresAt", None)
    return data


def recovery_site_base() -> str:
    import os

    return str(
        os.environ.get("PUBLIC_WEB_URL")
        or os.environ.get("NEXT_PUBLIC_SITE_URL")
        or ""
    ).rstrip("/")


def recovery_cart_url(checkout: AbandonedCheckout, *, site: str | None = None) -> str | None:
    token = (checkout.recoveryToken or "").strip()
    if not token:
        return None
    base = (site if site is not None else recovery_site_base()).rstrip("/")
    path = f"/cart/recover?token={token}"
    return f"{base}{path}" if base else path


def _channel_status(channel: Any) -> str | None:
    """Map a channel result dict to sent | skipped | failed."""
    if not isinstance(channel, dict):
        return None
    if channel.get("ok"):
        return "sent"
    if channel.get("skipped"):
        return "skipped"
    if channel.get("error") is not None or channel.get("ok") is False:
        return "failed"
    return None


def admin_checkout_dict(checkout: AbandonedCheckout, *, site: str | None = None) -> dict[str, Any]:
    """Admin list/detail payload — includes recoveryUrl, never raw recoveryToken."""
    data = public_checkout_dict(checkout)
    data["recoveryUrl"] = recovery_cart_url(checkout, site=site)

    last = dict(getattr(checkout, "recoveryLastResult", None) or {})
    email_ch = last.get("email") if isinstance(last.get("email"), dict) else None
    wa_ch = last.get("whatsapp") if isinstance(last.get("whatsapp"), dict) else None

    email_status = _channel_status(email_ch)
    email_sent_at = last.get("emailSentAt")
    if not email_sent_at and email_ch and email_ch.get("ok"):
        email_sent_at = last.get("at") or getattr(checkout, "recoverySentAt", None)

    # Legacy flat WhatsApp-only recoveryLastResult (manual send-recovery)
    wa_status = _channel_status(wa_ch)
    wa_sent_at = last.get("whatsappSentAt")
    if wa_status is None and email_ch is None and wa_ch is None:
        flat = _channel_status(last)
        if flat:
            wa_status = flat
            if flat == "sent":
                wa_sent_at = wa_sent_at or getattr(checkout, "recoverySentAt", None)

    if email_status is None and email_sent_at:
        email_status = "sent"
    if wa_status is None and wa_sent_at:
        wa_status = "sent"

    data["emailStatus"] = email_status
    data["emailSentAt"] = (
        email_sent_at.isoformat()
        if hasattr(email_sent_at, "isoformat")
        else email_sent_at
    )
    data["whatsappStatus"] = wa_status
    data["whatsappSentAt"] = (
        wa_sent_at.isoformat()
        if hasattr(wa_sent_at, "isoformat")
        else wa_sent_at
    )
    return data


def map_items_for_cart(items: list | None) -> list[dict[str, Any]]:
    """Map abandoned item shape → cart store shape (_id, qty, price, …)."""
    mapped: list[dict[str, Any]] = []
    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        product_id = raw.get("productId") or raw.get("_id") or raw.get("product")
        if not product_id:
            continue
        qty = int(raw.get("quantity") or raw.get("qty") or 1)
        if qty < 1:
            qty = 1
        mapped.append(
            {
                "_id": str(product_id),
                "name": raw.get("name") or raw.get("productName") or "Product",
                "productName": raw.get("productName") or raw.get("name") or "Product",
                "price": float(raw.get("price") or 0),
                "qty": qty,
                "color": raw.get("color") or "",
                "size": raw.get("size") or "",
                "image": raw.get("image") or "",
                "countInStock": int(raw.get("countInStock") or raw.get("quantity") or qty or 1),
            }
        )
    return mapped


def shipping_from_customer_details(details: dict | None) -> dict[str, Any]:
    d = details or {}
    address = str(d.get("address") or "").strip()
    return {
        "name": d.get("name") or "",
        "phone": d.get("phone") or "",
        "email": d.get("email") or "",
        "address": address,
        "city": d.get("city") or "",
        "state": d.get("state") or "",
        "postalCode": d.get("postalCode") or d.get("pincode") or "",
        "country": d.get("country") or "India",
    }
