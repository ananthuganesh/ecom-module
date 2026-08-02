"""Auth session cookie helpers (HttpOnly; Bearer still accepted for tests/API clients).

Customer storefront and admin panel use separate cookies so logging into one
does not authenticate the other.
"""

from __future__ import annotations

from typing import Literal

from fastapi import Request, Response

from app.config import get_settings

COOKIE_NAME = "ua_session"
ADMIN_COOKIE_NAME = "ua_admin_session"

AuthScope = Literal["customer", "admin"]


def cookie_secure() -> bool:
    return get_settings().is_production()


def cookie_max_age(*, hours: int | None = None) -> int:
    settings = get_settings()
    if hours is not None:
        return max(3600, int(hours) * 3600)
    return max(3600, int(settings.jwt_expire_days) * 86400)


def _cookie_name(scope: AuthScope = "customer") -> str:
    return ADMIN_COOKIE_NAME if scope == "admin" else COOKIE_NAME


def set_auth_cookie(
    response: Response,
    token: str,
    *,
    hours: int | None = None,
    scope: AuthScope = "customer",
) -> None:
    response.set_cookie(
        key=_cookie_name(scope),
        value=token,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        max_age=cookie_max_age(hours=hours),
        path="/",
    )


def clear_auth_cookie(response: Response, *, scope: AuthScope = "customer") -> None:
    # Match set_auth_cookie flags so browsers actually clear the session.
    response.delete_cookie(
        key=_cookie_name(scope),
        path="/",
        secure=cookie_secure(),
        samesite="lax",
        httponly=True,
    )


def token_from_request(
    request: Request,
    bearer: str | None = None,
    *,
    scope: AuthScope = "customer",
) -> str | None:
    # Prefer the scoped HttpOnly cookie; Bearer remains for tests/API clients.
    raw = request.cookies.get(_cookie_name(scope))
    if raw and str(raw).strip():
        return str(raw).strip()
    if bearer:
        return bearer
    return None
