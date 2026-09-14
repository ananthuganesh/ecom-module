from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.documents import AbandonedCheckout
from app.main import create_app
from app.routers.media import video_signature_matches
from app.services.rate_limit import client_ip


@pytest.fixture
async def client(db):
    async with AsyncClient(
        transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test"
    ) as ac:
        yield ac


# ---------------------------------------------------------------- NoSQL injection


async def test_guest_id_operator_cannot_read_another_shoppers_checkout(client):
    await AbandonedCheckout(
        guestId="victim-guest",
        status="abandoned",
        customerDetails={"name": "Victim", "email": "victim@example.com", "phone": "9876543210"},
    ).insert()

    res = await client.post(
        "/api/abandoned-checkout",
        json={"guestId": {"$ne": None}, "items": [], "totalAmount": 0},
    )
    assert res.status_code == 200
    assert "victim@example.com" not in res.text
    assert "9876543210" not in res.text


# ---------------------------------------------------------------- client IP


def _request(headers: dict[str, str], peer="10.0.0.5") -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (peer, 1234),
        }
    )


def test_spoofed_leftmost_forwarded_for_is_ignored(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    # Client sent "1.2.3.4"; our proxy appended the real address, then a private hop.
    req = _request({"x-forwarded-for": "1.2.3.4, 49.36.10.20, 172.18.0.3"})
    assert client_ip(req) == "49.36.10.20"


def test_cloudflare_header_wins(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    req = _request({"cf-connecting-ip": "49.36.10.20", "x-forwarded-for": "1.2.3.4, 162.158.1.1"})
    assert client_ip(req) == "49.36.10.20"


def test_proxy_headers_ignored_without_trust(monkeypatch):
    monkeypatch.delenv("TRUST_PROXY", raising=False)
    req = _request({"cf-connecting-ip": "49.36.10.20", "x-forwarded-for": "1.2.3.4"})
    assert client_ip(req) == "10.0.0.5"


# ---------------------------------------------------------------- uploads


@pytest.mark.parametrize(
    "ext,head,ok",
    [
        (".mp4", b"\x00\x00\x00\x20ftypisom", True),
        (".mov", b"\x00\x00\x00\x14ftypqt  ", True),
        (".webm", b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81", True),
        (".avi", b"RIFF\x00\x00\x00\x00AVI LIST", True),
        (".mp4", b"<html><script>alert(1)</script>", False),
        (".mp4", b"<svg xmlns='http://www.w3.org/2000/svg'>", False),
        (".webm", b"\x00\x00\x00\x20ftypisom", False),
        (".html", b"\x00\x00\x00\x20ftypisom", False),
    ],
)
def test_video_signature(ext, head, ok):
    assert video_signature_matches(ext, head) is ok


# ---------------------------------------------------------------- errors


async def test_malformed_id_is_a_400_not_a_500(client):
    from app.security import create_access_token
    from app.documents import User

    user = User(name="Shopper", email="s@example.com")
    await user.insert()
    res = await client.get(
        "/api/orders/not-an-object-id",
        headers={"Authorization": f"Bearer {create_access_token(user.id)}"},
    )
    assert res.status_code in (400, 404)
    assert "Traceback" not in res.text and "InvalidId" not in res.text
