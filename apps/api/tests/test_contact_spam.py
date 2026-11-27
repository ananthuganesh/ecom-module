from __future__ import annotations

import time

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import create_app
from app.routers import contact as contact_router
from app.services import spam_guard


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []

    async def _send(**kwargs):
        sent.append(kwargs)
        return {"ok": True}

    monkeypatch.setattr(contact_router, "send_contact_inquiry", _send)
    return sent


def _body(**overrides):
    body = {
        "name": "Asha",
        "email": "asha@gmail.com",
        "message": "Where is my order UA1001?",
        "startedAt": time.time() * 1000 - 10_000,
    }
    body.update(overrides)
    return body


async def _post(body):
    app = create_app(with_lifespan=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/api/contact", json=body)


def test_link_counting():
    assert spam_guard.count_links("see https://a.com and http://b.com and www.c.com") == 3
    assert spam_guard.count_links("order UA1001, size M") == 0


def test_automation_signals():
    now = 1_000_000.0
    assert spam_guard.looks_automated(honeypot="", started_at=now - 10_000, now_ms=now) is None
    assert spam_guard.looks_automated(honeypot="http://spam", started_at=now - 10_000, now_ms=now) == "honeypot"
    assert spam_guard.looks_automated(honeypot=None, started_at=now - 500, now_ms=now) == "too_fast"
    assert spam_guard.looks_automated(honeypot=None, started_at=now + 60_000, now_ms=now) == "too_fast"
    assert spam_guard.looks_automated(honeypot=None, started_at=None, now_ms=now) == "no_timestamp"


@pytest.mark.usefixtures("db")
async def test_real_message_is_sent(outbox):
    res = await _post(_body())
    assert res.status_code == 200, res.text
    assert len(outbox) == 1


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    "overrides",
    [
        {"website": "https://cheap-pills.example"},
        {"startedAt": "now"},
        {"startedAt": None},
    ],
)
async def test_bots_get_a_quiet_success_and_nothing_is_sent(outbox, overrides):
    if overrides.get("startedAt") == "now":
        overrides = {"startedAt": time.time() * 1000}  # submitted instantly
    res = await _post(_body(**overrides))
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert outbox == []


@pytest.mark.usefixtures("db")
async def test_link_heavy_messages_are_refused(outbox):
    res = await _post(_body(message="buy https://a.com https://b.com https://c.com"))
    assert res.status_code == 400
    assert "links" in res.json()["detail"]
    assert outbox == []


@pytest.mark.usefixtures("db")
async def test_daily_cap_applies_across_senders(outbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "contact_daily_cap", 2)
    for i in range(2):
        assert (await _post(_body(email=f"person{i}@gmail.com"))).status_code == 200
    res = await _post(_body(email="person9@gmail.com"))
    assert res.status_code == 429
    assert "email us directly" in res.json()["detail"]
    assert len(outbox) == 2


@pytest.mark.usefixtures("db")
async def test_turnstile_is_required_when_configured(outbox, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "turnstile_site_key", "site-key")
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    verdicts: list[str] = []

    class FakeResponse:
        def __init__(self, ok):
            self._ok = ok

        def json(self):
            return {"success": self._ok}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, data=None):
            verdicts.append(data["response"])
            return FakeResponse(data["response"] == "good-token")

    monkeypatch.setattr(spam_guard.httpx, "AsyncClient", FakeClient)

    app = create_app(with_lifespan=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        config = (await client.get("/api/contact/config")).json()
    assert config == {"turnstileSiteKey": "site-key"}

    assert (await _post(_body())).status_code == 400
    assert (await _post(_body(turnstileToken="bad-token"))).status_code == 400
    assert (await _post(_body(turnstileToken="good-token"))).status_code == 200
    assert verdicts == ["bad-token", "good-token"]
    assert len(outbox) == 1


@pytest.mark.usefixtures("db")
async def test_turnstile_off_by_default():
    app = create_app(with_lifespan=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        config = (await client.get("/api/contact/config")).json()
    assert config == {"turnstileSiteKey": ""}
