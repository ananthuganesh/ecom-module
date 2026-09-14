"""Email OTP auth for storefront customers (Resend)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException

from app.config import get_settings
from app.documents import LoginOtp
from app.services import email_resend as email_svc

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_LENGTH = 6


def _pepper() -> bytes:
    return (get_settings().jwt_secret or "otp").encode("utf-8")


def hash_otp(code: str) -> str:
    normalized = str(code or "").strip()
    return hmac.new(_pepper(), normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_otp_hash(code: str, code_hash: str | None) -> bool:
    if not code_hash:
        return False
    expected = hash_otp(code)
    return hmac.compare_digest(expected, str(code_hash))


def generate_otp_code() -> str:
    # Cryptographic 6-digit code (000000–999999), zero-padded.
    return f"{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}"


def admin_otp_key(email: str) -> str:
    """Admin codes live under their own key so a customer code can never unlock admin."""
    return f"admin:{str(email or '').strip().lower()}"


async def issue_login_otp(email: str, *, key: str | None = None, audience: str = "customer") -> dict[str, Any]:
    """Create/replace OTP for email and send via Resend. Always succeeds for caller shape."""
    email = str(email or "").strip().lower()
    store_key = key or email
    code = generate_otp_code()
    code_hash = hash_otp(code)
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)

    existing = await LoginOtp.find_one(LoginOtp.email == store_key)
    if existing:
        existing.codeHash = code_hash
        existing.expiresAt = expires_at
        existing.attempts = 0
        existing.createdAt = datetime.utcnow()
        await existing.save()
    else:
        await LoginOtp(
            email=store_key,
            codeHash=code_hash,
            expiresAt=expires_at,
            attempts=0,
        ).insert()

    subject, html_body = email_svc.build_login_otp_email_html(
        code, ttl_minutes=OTP_TTL_MINUTES, audience=audience
    )
    result = await email_svc.send_email(
        to=email,
        subject=subject,
        html_body=html_body,
    )
    if result.get("skipped") and result.get("reason") == "resend_not_configured":
        # Dev without Resend: still store OTP; log for local testing.
        print(f"[OTP] Resend not configured — code for {email}: {code}")
    elif result.get("ok") is False:
        print(f"[OTP] Send failed for {email}: {result}")
        raise HTTPException(
            status_code=502,
            detail="Could not send verification email. Try again shortly.",
        )
    return {"ok": True}


async def consume_login_otp(email: str, code: str) -> None:
    """Verify OTP or raise 400/429. Deletes the OTP doc on success.

    `email` is the storage key: the customer's email, or admin_otp_key(email).
    """
    email = str(email or "").strip().lower()
    code = str(code or "").strip()
    if not code.isdigit() or len(code) != OTP_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    doc = await LoginOtp.find_one(LoginOtp.email == email)
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    if doc.expiresAt and doc.expiresAt < datetime.utcnow():
        await doc.delete()
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    if int(doc.attempts or 0) >= OTP_MAX_ATTEMPTS:
        await doc.delete()
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Request a new code.",
        )

    if not verify_otp_hash(code, doc.codeHash):
        doc.attempts = int(doc.attempts or 0) + 1
        if doc.attempts >= OTP_MAX_ATTEMPTS:
            await doc.delete()
            raise HTTPException(
                status_code=429,
                detail="Too many incorrect attempts. Request a new code.",
            )
        await doc.save()
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    await doc.delete()
