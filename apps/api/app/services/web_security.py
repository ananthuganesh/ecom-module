"""Browser-facing hardening: CSRF origin check and security headers.

Sessions are HttpOnly cookies with SameSite=Lax, which already stops most
cross-site form posts. Lax still treats sibling subdomains as the same site,
so a state-changing request that carries a session cookie must also come from
an origin we trust. Server-to-server calls (Razorpay webhooks, carriers) send
no Origin and no session cookie, so they are unaffected.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from app.services.auth_cookie import ADMIN_COOKIE_NAME, COOKIE_NAME

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_SESSION_COOKIES = (COOKIE_NAME, ADMIN_COOKIE_NAME)

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
]
HSTS_HEADER = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")


def _origin_key(value: str) -> str:
    parts = urlsplit(value.strip().lower())
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""


def _host_only(value: str) -> str:
    return value.strip().lower().split(",")[0].strip()


def is_trusted_origin(origin: str, *, allowed: set[str], hosts: set[str]) -> bool:
    key = _origin_key(origin)
    if not key:
        return False
    if key in allowed:
        return True
    # Same origin as the host the browser addressed (direct, or via the Next proxy).
    return urlsplit(key).netloc in hosts


class BrowserSecurityMiddleware:
    def __init__(self, app, *, allowed_origins: list[str], production: bool):
        self.app = app
        self.allowed = {_origin_key(o) for o in allowed_origins if _origin_key(o)}
        self.production = production

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        if scope["method"].upper() in UNSAFE_METHODS and self._blocked(headers):
            await self._forbidden(send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                extra = [h for h in SECURITY_HEADERS if h[0] not in existing]
                if self.production and HSTS_HEADER[0] not in existing:
                    extra.append(HSTS_HEADER)
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receive, send_with_headers)

    def _blocked(self, headers: dict[str, str]) -> bool:
        cookie = headers.get("cookie", "")
        if not any(f"{name}=" in cookie for name in _SESSION_COOKIES):
            return False  # no ambient credentials, nothing to forge
        # Fetch metadata is set by the browser and cannot be forged by page script.
        if headers.get("sec-fetch-site") == "cross-site":
            return True
        origin = headers.get("origin") or ""
        if not origin:
            referer = headers.get("referer") or ""
            origin = _origin_key(referer)
        if not origin:
            # Non-browser clients (curl, server jobs) send neither header.
            return False
        hosts = {
            _host_only(headers[h]) for h in ("host", "x-forwarded-host") if headers.get(h)
        }
        return not is_trusted_origin(origin, allowed=self.allowed, hosts=hosts)

    @staticmethod
    async def _forbidden(send):
        body = b'{"detail":"Request origin not allowed"}'
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
