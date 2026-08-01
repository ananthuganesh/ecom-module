"""Auth session cookie helpers (HttpOnly; Bearer still accepted for tests/API clients)."""

from __future__ import annotations

from fastapi import Request, Response

from app.config import get_settings

COOKIE_NAME = "ua_session"


def cookie_secure() -> bool:
    return get_settings().is_production()


def cookie_max_age(*, hours: int | None = None) -> int:
    settings = get_settings()
    if hours is not None:
        return max(3600, int(hours) * 3600)
    return max(3600, int(settings.jwt_expire_days) * 86400)


def set_auth_cookie(response: Response, token: str, *, hours: int | None = None) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        max_age=cookie_max_age(hours=hours),
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def token_from_request(request: Request, bearer: str | None = None) -> str | None:
    if bearer:
        return bearer
    raw = request.cookies.get(COOKIE_NAME)
    return str(raw).strip() if raw else None
