"""Public contact form → staff inbox email."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services import spam_guard
from app.services.email_quality import QualityEmail
from app.services.email_resend import send_contact_inquiry
from app.services.rate_limit import client_ip, enforce_rate_limit, rate_limit_dependency

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: QualityEmail
    phone: str | None = Field(default=None, max_length=40)
    message: str = Field(min_length=1, max_length=4000)
    # Bot filters (services/spam_guard.py). `website` is the hidden honeypot.
    website: str | None = Field(default=None, max_length=200)
    startedAt: float | None = None
    turnstileToken: str | None = Field(default=None, max_length=4096)


@router.get("/config")
async def contact_config():
    """Public: the Turnstile site key the form should render (empty = off)."""
    return {"turnstileSiteKey": spam_guard.turnstile_site_key() if spam_guard.turnstile_enabled() else ""}


@router.post("")
async def submit_contact(
    body: ContactBody,
    request: Request,
    _: None = Depends(rate_limit_dependency("contact", limit=8, window_seconds=15 * 60)),
):
    name = body.name.strip()
    email = str(body.email).lower().strip()
    phone = str(body.phone or "").strip()
    message = body.message.strip()
    if not name or not message:
        raise HTTPException(status_code=400, detail="Name and message are required.")

    # Bots get a normal-looking success and nothing is sent.
    if spam_guard.looks_automated(honeypot=body.website, started_at=body.startedAt):
        return {"ok": True}

    if not await spam_guard.verify_turnstile(body.turnstileToken, client_ip(request)):
        raise HTTPException(
            status_code=400,
            detail="Please complete the verification and try again.",
        )

    if spam_guard.count_links(message) > spam_guard.MAX_LINKS:
        raise HTTPException(
            status_code=400,
            detail="Please remove some links from your message, or email us directly.",
        )

    await enforce_rate_limit(
        f"contact-email:{email}:{client_ip(request)}",
        limit=3,
        window_seconds=15 * 60,
    )
    # Ceiling across every sender, so rotating IPs can't flood the inbox.
    try:
        await enforce_rate_limit(
            "contact-global",
            limit=max(1, int(get_settings().contact_daily_cap)),
            window_seconds=24 * 60 * 60,
        )
    except HTTPException:
        raise HTTPException(
            status_code=429,
            detail="We're receiving a lot of messages right now. Please email us directly.",
        ) from None

    result = await send_contact_inquiry(
        name=name,
        email=email,
        phone=phone,
        message=message,
    )
    if result.get("skipped") and result.get("reason") == "resend_not_configured":
        raise HTTPException(
            status_code=503,
            detail="Messaging is temporarily unavailable. Please email us directly.",
        )
    if not result.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=result.get("error") or "Could not send your message. Please try again.",
        )
    return {"ok": True}
