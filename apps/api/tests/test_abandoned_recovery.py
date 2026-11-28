from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.documents import AbandonedCheckout
from app.services import abandoned_recovery
from app.services import email_resend


@pytest.fixture
def emails(monkeypatch):
    sent: list[str] = []

    async def _send(checkout, *, cart_link, user=None):
        sent.append(cart_link)
        return {"ok": True}

    monkeypatch.setattr(email_resend, "_resend_api_key", lambda: "re_test")
    monkeypatch.setattr(email_resend, "notify_abandoned_cart_email", _send)
    return sent


async def _checkout(**fields) -> AbandonedCheckout:
    doc = AbandonedCheckout(
        status="abandoned",
        items=[{"name": "Tee"}],
        totalAmount=999,
        customerDetails=fields.pop("details", {"email": "asha@gmail.com"}),
        lastActivityAt=datetime.utcnow() - timedelta(minutes=fields.pop("idle", 30)),
        **fields,
    )
    await doc.insert()
    return doc


@pytest.mark.usefixtures("db")
async def test_idle_checkout_gets_one_recovery_email(emails):
    doc = await _checkout()
    first = await abandoned_recovery.process_due_abandoned_recoveries()
    second = await abandoned_recovery.process_due_abandoned_recoveries()

    assert first["sent"] == 1 and second["sent"] == 0
    assert len(emails) == 1 and "/cart/recover?token=" in emails[0]
    stored = await AbandonedCheckout.get(doc.id)
    assert stored.recoverySentAt is not None
    assert "emailSentAt" in stored.recoveryLastResult


@pytest.mark.usefixtures("db")
async def test_recent_or_emailless_checkouts_are_left_alone(emails):
    await _checkout(idle=2)
    await _checkout(details={"phone": "9876543210"})
    result = await abandoned_recovery.process_due_abandoned_recoveries()
    assert result["sent"] == 0
    assert emails == []


@pytest.mark.usefixtures("db")
async def test_without_resend_nothing_runs(monkeypatch):
    monkeypatch.setattr(email_resend, "_resend_api_key", lambda: "")
    assert (await abandoned_recovery.process_due_abandoned_recoveries())["skipped"] is True
