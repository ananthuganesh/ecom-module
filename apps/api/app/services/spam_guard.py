"""Cheap bot filters for public forms (contact today; reusable elsewhere).

- Honeypot: a field hidden from people. Anything typed there is a bot.
- Fill time: the form reports when it was rendered; a submit faster than a
  person can type is a bot.
- Links: spam carries links; real support messages rarely need more than two.
- Turnstile: Cloudflare's bot check, when keys are configured.

Honeypot / fill-time hits are dropped *silently* (the caller pretends success)
so a bot gets no signal to adapt to.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

MIN_FILL_MS = 2500
MAX_LINKS = 2
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

_LINK = re.compile(r"(https?://|www\.)", re.IGNORECASE)


def count_links(text: str | None) -> int:
    return len(_LINK.findall(str(text or "")))


def looks_automated(*, honeypot: Any, started_at: Any, now_ms: float | None = None) -> str | None:
    """Reason this submit looks like a bot, or None. Never shown to the sender."""
    if str(honeypot or "").strip():
        return "honeypot"
    try:
        started = float(started_at)
    except (TypeError, ValueError):
        return "no_timestamp"
    now = time.time() * 1000 if now_ms is None else now_ms
    elapsed = now - started
    if elapsed < MIN_FILL_MS:
        # Also catches a timestamp from the future.
        return "too_fast"
    return None


def turnstile_site_key() -> str:
    return str(get_settings().turnstile_site_key or "").strip()


def turnstile_enabled() -> bool:
    settings = get_settings()
    return bool(str(settings.turnstile_secret_key or "").strip() and turnstile_site_key())


async def verify_turnstile(token: str | None, remote_ip: str | None = None) -> bool:
    """True when Turnstile is off, or Cloudflare accepts the token.

    If Cloudflare can't be reached the check fails open (logged): the rate
    limits and filters above still apply, and an outage shouldn't silence the
    contact form.
    """
    if not turnstile_enabled():
        return True
    if not str(token or "").strip():
        return False
    data = {"secret": get_settings().turnstile_secret_key, "response": str(token)}
    if remote_ip and remote_ip != "unknown":
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(TURNSTILE_VERIFY_URL, data=data)
        return bool(res.json().get("success"))
    except Exception:
        logger.exception("Turnstile verify failed; allowing the request")
        return True
