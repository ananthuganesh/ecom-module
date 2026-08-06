"""Public contact form → staff inbox email."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.email_quality import QualityEmail
from app.services.email_resend import send_contact_inquiry
from app.services.rate_limit import client_ip, enforce_rate_limit, rate_limit_dependency

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: QualityEmail
    phone: str | None = Field(default=None, max_length=40)
    message: str = Field(min_length=1, max_length=4000)


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

    await enforce_rate_limit(
        f"contact-email:{email}:{client_ip(request)}",
        limit=3,
        window_seconds=15 * 60,
    )

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
