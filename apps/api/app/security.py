from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    if not hashed.startswith("$2"):
        # legacy plaintext migration path
        return plain == hashed
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
