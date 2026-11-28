"""Razorpay credentials from environment only (same pattern as GTM / DTDC secrets)."""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException

from app.config import get_settings
from app.documents import Setting

SETTING_KEY = "razorpay_settings"


def env_creds() -> dict[str, str]:
    s = get_settings()
    return {
        "keyId": str(s.razorpay_live_api_key or "").strip(),
        "keySecret": str(s.razorpay_live_key_secret or "").strip(),
        "webhookSecret": str(s.razorpay_webhook_secret or "").strip(),
    }


def require_creds() -> tuple[str, str]:
    c = env_creds()
    if not c["keyId"] or not c["keySecret"]:
        raise HTTPException(
            status_code=503,
            detail="Razorpay is not configured. Set RAZORPAY_LIVE_API_KEY and RAZORPAY_LIVE_KEY_SECRET in the API environment.",
        )
    return c["keyId"], c["keySecret"]


def webhook_secret() -> str:
    return env_creds()["webhookSecret"]


def public_api_base(db: dict | None = None) -> str:
    raw = db or {}
    return (
        str(raw.get("publicApiBaseUrl") or "").strip()
        or os.environ.get("PUBLIC_API_URL")
        or os.environ.get("NEXT_PUBLIC_API_URL")
        or ""
    ).rstrip("/")


async def get_prefs() -> dict[str, Any]:
    """Non-secret Razorpay prefs (public API URL) may live in DB."""
    s = await Setting.find_one(Setting.key == SETTING_KEY)
    db = dict(s.value) if s and isinstance(s.value, dict) else {}
    api_base = public_api_base(db)
    creds = env_creds()
    key_id = creds["keyId"]
    return {
        "keyId": key_id,
        "keyIdMasked": (f"{key_id[:12]}…" if len(key_id) > 12 else key_id) if key_id else "",
        "environment": "live" if key_id.startswith("rzp_live") else ("test" if key_id else "test"),
        "publicApiBaseUrl": api_base,
        "isConnected": bool(creds["keyId"] and creds["keySecret"]),
        "isFromEnv": True,
        "hasSecret": bool(creds["keySecret"]),
        "hasWebhookSecret": bool(creds["webhookSecret"]),
    }
