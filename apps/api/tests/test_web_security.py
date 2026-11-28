from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.documents import Product
from app.main import create_app
from app.services.html_sanitize import sanitize_rich_text
from app.services.web_security import BrowserSecurityMiddleware, is_trusted_origin


# ---------------------------------------------------------------- sanitising


@pytest.mark.parametrize(
    "dirty",
    [
        "<img src=x onerror=alert(1)>",
        "<script>alert(1)</script>",
        "<svg><animate onbegin=alert(1)></svg>",
        "<iframe srcdoc='<script>alert(1)</script>'></iframe>",
        "<p onclick='steal()'>hi</p>",
        "<a href='javascript:alert(1)'>x</a>",
        "<a href='JaVaScRiPt:alert(1)'>x</a>",
        "<a href='data:text/html;base64,PHNjcmlwdD4='>x</a>",
        "<form action='https://evil.example'><input name=p></form>",
        "<style>body{display:none}</style>",
    ],
)
def test_dangerous_markup_is_removed(dirty):
    clean = sanitize_rich_text(dirty)
    lowered = clean.lower()
    for needle in ("<script", "onerror", "onbegin", "onclick", "javascript:", "data:", "<iframe", "<form", "<style", "<svg"):
        assert needle not in lowered, (dirty, clean)


def test_formatting_survives():
    html = "<p>Soft <strong>cotton</strong>, <em>relaxed</em> fit<br></p><ul><li>240 GSM</li></ul>"
    assert sanitize_rich_text(html) == html


def test_links_keep_safe_href_and_gain_rel():
    out = sanitize_rich_text('<p><a href="https://urbanaana.com/size-guide">Size guide</a></p>')
    assert 'href="https://urbanaana.com/size-guide"' in out
    assert 'rel="noopener noreferrer nofollow"' in out


def test_plain_text_is_left_alone():
    assert sanitize_rich_text("Cotton & Linen <3") == "Cotton & Linen <3"
    assert sanitize_rich_text(None) is None


@pytest.mark.usefixtures("db")
def test_product_model_sanitises_on_write_and_on_load():
    product = Product(productName="Tee", description="<p>ok</p><img src=x onerror=alert(1)>")
    assert product.description == "<p>ok</p>"
    loaded = Product.model_validate({"productName": "Tee", "description": "<script>x</script><p>ok</p>"})
    assert loaded.description == "<p>ok</p>"


# ---------------------------------------------------------------- origin check


def test_trusted_origin_rules():
    allowed = {"https://urbanaana.com"}
    assert is_trusted_origin("https://urbanaana.com", allowed=allowed, hosts=set())
    assert is_trusted_origin("https://urbanaana.com/", allowed=allowed, hosts=set())
    assert is_trusted_origin("https://abc.ngrok.app", allowed=allowed, hosts={"abc.ngrok.app"})
    assert not is_trusted_origin("https://images.urbanaana.com", allowed=allowed, hosts={"urbanaana.com"})
    assert not is_trusted_origin("http://urbanaana.com", allowed=allowed, hosts=set())
    assert not is_trusted_origin("null", allowed=allowed, hosts=set())


def _app():
    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    return BrowserSecurityMiddleware(app, allowed_origins=["https://urbanaana.com"], production=True)


async def _post(headers):
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="https://api.test") as client:
        return await client.post("/api/orders", headers=headers)


async def test_cross_origin_write_with_session_is_refused():
    res = await _post({"cookie": "ua_session=abc", "origin": "https://evil.example"})
    assert res.status_code == 403


async def test_sibling_subdomain_is_refused():
    res = await _post({"cookie": "ua_admin_session=abc", "origin": "https://images.urbanaana.com"})
    assert res.status_code == 403


async def test_cross_site_fetch_metadata_is_refused_without_origin():
    res = await _post({"cookie": "ua_session=abc", "sec-fetch-site": "cross-site"})
    assert res.status_code == 403


async def test_referer_is_used_when_origin_is_missing():
    res = await _post({"cookie": "ua_session=abc", "referer": "https://evil.example/page"})
    assert res.status_code == 403


async def test_own_site_write_is_allowed():
    res = await _post({"cookie": "ua_session=abc", "origin": "https://urbanaana.com"})
    assert res.status_code == 200


async def test_requests_without_a_session_are_untouched():
    """Razorpay webhooks and carrier callbacks carry no session cookie."""
    res = await _post({"origin": "https://evil.example"})
    assert res.status_code == 200
    res = await _post({"cookie": "ua_session=abc"})  # curl / server job
    assert res.status_code == 200


async def test_reads_are_never_blocked():
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="https://api.test") as client:
        res = await client.get("/api/products", headers={"cookie": "ua_session=abc", "origin": "https://evil.example"})
    assert res.status_code == 200


async def test_security_headers_are_added():
    res = await _post({})
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert "max-age" in res.headers["strict-transport-security"]


# ---------------------------------------------------------------- token exposure


@pytest.mark.usefixtures("db")
async def test_session_endpoints_do_not_return_the_token_in_the_body():
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as client:
        res = await client.post("/api/users/checkout-email", json={"email": "shopper@example.com", "name": "Shopper"})
    assert res.status_code == 200, res.text
    assert "token" not in res.json()
    assert res.json()["_id"]
    cookie = res.headers.get("set-cookie", "").lower()
    assert "ua_session=" in cookie and "httponly" in cookie


# ---------------------------------------------------------------- checkout email takeover


@pytest.mark.usefixtures("db")
async def test_existing_customer_email_does_not_open_their_account():
    from app.documents import User

    victim = User(name="Victim", email="victim@example.com", phone="9876543210", emailSubscribed=True)
    await victim.insert()
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as client:
        res = await client.post(
            "/api/users/checkout-email",
            json={"email": "victim@example.com", "emailSubscribed": False},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["requiresLogin"] is True
        assert body["verifyWithCode"] is True
        assert "_id" not in body and "phone" not in res.text
        assert "ua_session" not in res.headers.get("set-cookie", "")
        # No session was granted, so the account stays closed.
        assert (await client.get("/api/users/profile")).status_code == 401
        assert (await client.get("/api/orders/myorders")).status_code == 401
    # And their marketing preferences were not changed by a stranger.
    assert (await User.get(victim.id)).emailSubscribed is True


@pytest.mark.usefixtures("db")
async def test_signed_in_customer_continues_without_a_code():
    from app.documents import User
    from app.security import create_access_token

    user = User(name="Buyer", email="buyer@example.com")
    await user.insert()
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as client:
        res = await client.post(
            "/api/users/checkout-email",
            json={"email": "buyer@example.com"},
            headers={"Authorization": f"Bearer {create_access_token(user.id)}"},
        )
    assert res.status_code == 200
    assert res.json()["_id"] == str(user.id)
    assert res.json()["requiresLogin"] is False


@pytest.mark.usefixtures("db")
async def test_signed_in_as_someone_else_still_needs_a_code():
    from app.documents import User
    from app.security import create_access_token

    me = User(name="Me", email="me@example.com")
    other = User(name="Other", email="other@example.com")
    await me.insert()
    await other.insert()
    async with AsyncClient(transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test") as client:
        res = await client.post(
            "/api/users/checkout-email",
            json={"email": "other@example.com"},
            headers={"Authorization": f"Bearer {create_access_token(me.id)}"},
        )
    assert res.json()["verifyWithCode"] is True
    assert "_id" not in res.json()
