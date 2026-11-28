from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    """Verify password against bcrypt hash only (no plaintext compare)."""
    if not hashed or not str(hashed).startswith("$2"):
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: Any, *, hours: int | None = None) -> str:
    settings = get_settings()
    if hours is not None:
        expire = datetime.now(timezone.utc) + timedelta(hours=max(1, int(hours)))
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"id": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


# ---------------------------------------------------------------- admin login challenge
#
# Issued after a correct admin password, before the emailed OTP is checked.
# Signed with a derived key so it can never pass decode_token() as a session.

ADMIN_CHALLENGE_MINUTES = 10


def _challenge_secret() -> str:
    return f"{get_settings().jwt_secret}:admin-login-otp"


def create_admin_login_challenge(admin_id: Any) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ADMIN_CHALLENGE_MINUTES)
    payload = {"id": str(admin_id), "purpose": "admin-login-otp", "exp": expire}
    return jwt.encode(payload, _challenge_secret(), algorithm="HS256")


def decode_admin_login_challenge(token: str) -> str | None:
    """Admin id from a valid, unexpired challenge; None otherwise."""
    try:
        payload = jwt.decode(str(token or ""), _challenge_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("purpose") != "admin-login-otp":
        return None
    return str(payload.get("id") or "") or None
