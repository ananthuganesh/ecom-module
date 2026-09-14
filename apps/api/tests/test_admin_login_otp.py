from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.documents import AdminAccount
from app.main import create_app
from app.security import create_admin_login_challenge, hash_password
from app.services import email_resend, otp_auth

PASSWORD = "Adm1n-Str0ng-Pass!"


@pytest.fixture
def mail(monkeypatch):
    """Capture codes instead of emailing them."""
    sent: list[dict] = []
    codes = iter(["111111", "222222", "333333", "444444"])
    monkeypatch.setattr(otp_auth, "generate_otp_code", lambda: next(codes))

    async def fake_send(*, to, subject, html_body, reply_to=None):
        sent.append({"to": to, "subject": subject})
        return {"ok": True}

    monkeypatch.setattr(email_resend, "send_email", fake_send)
    return sent


@pytest.fixture
async def admin(db):
    account = AdminAccount(name="Owner", email="owner@urbanaana.com", password=hash_password(PASSWORD), isAdmin=True)
    await account.insert()
    return account


@pytest.fixture
async def client(db):
    async with AsyncClient(
        transport=ASGITransport(app=create_app(with_lifespan=False)), base_url="http://test"
    ) as ac:
        yield ac


async def _password_step(client):
    res = await client.post("/api/users/admin/login", json={"email": "owner@urbanaana.com", "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res


async def test_password_alone_does_not_open_the_admin(client, admin, mail):
    res = await _password_step(client)
    body = res.json()
    assert body["otpRequired"] is True
    assert body["challenge"]
    assert body["email"] == "ow•••@urbanaana.com"
    assert "_id" not in body
    assert "ua_admin_session" not in res.headers.get("set-cookie", "")
    assert (await client.get("/api/admin/reviews")).status_code == 401
    assert mail == [{"to": "owner@urbanaana.com", "subject": "Your Urban Aana admin sign-in code"}]


async def test_correct_code_starts_the_admin_session(client, admin, mail):
    challenge = (await _password_step(client)).json()["challenge"]
    res = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert res.status_code == 200, res.text
    assert res.json()["_id"] == str(admin.id)
    cookie = res.headers.get("set-cookie", "").lower()
    assert "ua_admin_session=" in cookie and "httponly" in cookie
    assert "token" not in res.json()
    assert (await client.get("/api/admin/reviews")).status_code == 200


async def test_code_works_only_once(client, admin, mail):
    challenge = (await _password_step(client)).json()["challenge"]
    ok = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert ok.status_code == 200
    again = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert again.status_code == 400


async def test_wrong_codes_lock_out_after_five(client, admin, mail):
    challenge = (await _password_step(client)).json()["challenge"]
    statuses = [
        (await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "999999"})).status_code
        for _ in range(5)
    ]
    assert statuses[:4] == [400, 400, 400, 400]
    assert statuses[4] == 429
    # The real code no longer works either; they must start over.
    late = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert late.status_code == 400


async def test_challenge_is_not_a_session(client, admin, mail):
    challenge = (await _password_step(client)).json()["challenge"]
    as_bearer = await client.get("/api/admin/reviews", headers={"Authorization": f"Bearer {challenge}"})
    assert as_bearer.status_code == 401
    client.cookies.set("ua_admin_session", challenge)
    assert (await client.get("/api/admin/reviews")).status_code == 401


async def test_tampered_or_foreign_challenge_is_refused(client, admin, mail):
    from app.security import create_access_token

    session_token = create_access_token(admin.id)  # a real session token is not a challenge
    res = await client.post("/api/users/admin/login/verify", json={"challenge": session_token, "code": "111111"})
    assert res.status_code == 401
    res = await client.post("/api/users/admin/login/verify", json={"challenge": "x" * 40, "code": "111111"})
    assert res.status_code == 401


async def test_customer_code_for_the_same_email_cannot_unlock_admin(client, admin, mail):
    # A customer OTP stored under the bare email must not satisfy the admin step.
    await otp_auth.issue_login_otp("owner@urbanaana.com")  # code 111111, customer key
    challenge = create_admin_login_challenge(admin.id)
    res = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert res.status_code == 400


async def test_resend_replaces_the_code(client, admin, mail):
    challenge = (await _password_step(client)).json()["challenge"]  # 111111
    assert (await client.post("/api/users/admin/login/resend", json={"challenge": challenge})).status_code == 200
    old = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert old.status_code == 400
    new = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "222222"})
    assert new.status_code == 200


async def test_revoked_access_is_refused_at_the_code_step(client, admin, mail):
    challenge = (await _password_step(client)).json()["challenge"]
    admin.isAdmin = False
    await admin.save()
    res = await client.post("/api/users/admin/login/verify", json={"challenge": challenge, "code": "111111"})
    assert res.status_code == 403


async def test_wrong_password_sends_no_code(client, admin, mail):
    res = await client.post("/api/users/admin/login", json={"email": "owner@urbanaana.com", "password": "nope"})
    assert res.status_code == 401
    assert mail == []


async def test_emergency_switch_restores_password_only(client, admin, mail, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_login_otp", False)
    res = await _password_step(client)
    assert "otpRequired" not in res.json()
    assert "ua_admin_session=" in res.headers.get("set-cookie", "")
    assert mail == []
