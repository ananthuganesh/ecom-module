"""Notification email preference gating."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import email_resend as email_svc
from app.services import store_settings


def _order(**kwargs):
    base = {
        "paymentMethod": "razorpay",
        "paymentStatus": "pending",
        "shippingAddress": {"email": "customer@example.com", "name": "Test"},
        "transactionDetails": {},
        "orderNumber": "UA1001",
        "items": [],
        "finalPrice": 499,
        "total": 499,
        "deliveryAmount": 0,
        "discountAmount": 0,
        "giftFee": 0,
        "updatedAt": None,
        "save": AsyncMock(),
    }
    base.update(kwargs)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def _clear_prefs_cache():
    store_settings._invalidate_notification_prefs_cache()
    yield
    store_settings._invalidate_notification_prefs_cache()


@pytest.mark.asyncio
async def test_notify_order_email_skips_when_confirmation_disabled(monkeypatch):
    monkeypatch.setattr(
        email_svc,
        "get_notification_prefs",
        AsyncMock(
            return_value={
                **store_settings.NOTIFICATION_PREF_DEFAULTS,
                "emailOrderConfirmation": False,
            }
        ),
    )
    send = AsyncMock(return_value={"ok": True, "id": "msg_1"})
    monkeypatch.setattr(email_svc, "send_email", send)

    result = await email_svc.notify_order_email("CONFIRMED", _order(paymentStatus="paid"))
    assert result == {"skipped": True, "reason": "emailOrderConfirmation_disabled"}
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_order_email_skips_shipped_when_disabled(monkeypatch):
    monkeypatch.setattr(
        email_svc,
        "get_notification_prefs",
        AsyncMock(
            return_value={
                **store_settings.NOTIFICATION_PREF_DEFAULTS,
                "emailOrderShipped": False,
            }
        ),
    )
    send = AsyncMock(return_value={"ok": True, "id": "msg_1"})
    monkeypatch.setattr(email_svc, "send_email", send)

    result = await email_svc.notify_order_email("SHIPPED", _order(paymentStatus="paid"))
    assert result == {"skipped": True, "reason": "emailOrderShipped_disabled"}
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_notify_abandoned_skips_when_disabled(monkeypatch):
    monkeypatch.setattr(
        email_svc,
        "get_notification_prefs",
        AsyncMock(
            return_value={
                **store_settings.NOTIFICATION_PREF_DEFAULTS,
                "emailAbandonedCart": False,
            }
        ),
    )
    send = AsyncMock(return_value={"ok": True, "id": "msg_1"})
    monkeypatch.setattr(email_svc, "send_email", send)

    checkout = SimpleNamespace(
        customerDetails={"email": "customer@example.com", "name": "Test"},
        recoveryLastResult={},
        items=[],
        totalAmount=199,
    )
    result = await email_svc.notify_abandoned_cart_email(
        checkout, cart_link="https://example.com/cart/recover?token=abc"
    )
    assert result == {"skipped": True, "reason": "emailAbandonedCart_disabled"}
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_staff_alert_skips_when_disabled(monkeypatch):
    monkeypatch.setattr(
        email_svc,
        "get_notification_prefs",
        AsyncMock(
            return_value={
                **store_settings.NOTIFICATION_PREF_DEFAULTS,
                "adminNewOrderAlert": False,
            }
        ),
    )
    send = AsyncMock(return_value={"ok": True, "id": "msg_1"})
    monkeypatch.setattr(email_svc, "send_email", send)

    result = await email_svc.notify_staff_new_order(_order())
    assert result == {"skipped": True, "reason": "admin_new_order_alert_disabled"}
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_prepaid_placed_awaits_payment_confirmation_email(monkeypatch):
    monkeypatch.setattr(
        email_svc,
        "get_notification_prefs",
        AsyncMock(return_value=dict(store_settings.NOTIFICATION_PREF_DEFAULTS)),
    )
    send = AsyncMock(return_value={"ok": True, "id": "msg_1"})
    monkeypatch.setattr(email_svc, "send_email", send)

    result = await email_svc.notify_order_email_once(
        "PLACED", _order(paymentMethod="razorpay", paymentStatus="pending")
    )
    assert result == {"skipped": True, "reason": "awaiting_payment_confirmation_email"}
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_confirmation_emails_share_once_marker(monkeypatch):
    monkeypatch.setattr(
        email_svc,
        "get_notification_prefs",
        AsyncMock(return_value=dict(store_settings.NOTIFICATION_PREF_DEFAULTS)),
    )
    send = AsyncMock(return_value={"ok": True, "id": "msg_1"})
    monkeypatch.setattr(email_svc, "send_email", send)
    monkeypatch.setattr(
        email_svc,
        "build_order_email_html",
        lambda *a, **k: ("Subject", "<p>Hi</p>"),
    )

    order = _order(paymentMethod="cod", paymentStatus="pending")
    first = await email_svc.notify_order_email_once("PLACED", order)
    assert first.get("ok") is True
    assert order.transactionDetails["resend"].get("orderConfirmation")

    second = await email_svc.notify_order_email_once("CONFIRMED", order)
    assert second == {"skipped": True, "reason": "already_sent"}
    assert send.await_count == 1
