"""Abandoned-checkout follow-up, run by a background loop from app lifespan.

Each pass:
1. marks unpaid gateway orders that went stale as abandoned (order_abandon);
2. emails a cart-recovery link (Resend) for abandoned checkouts idle longer
   than ABANDONED_MINUTES — once per checkout (``recoverySentAt``).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId

from app.documents import AbandonedCheckout, User

ABANDONED_MINUTES = 15
POLL_SECONDS = 60


async def _checkout_user(checkout: AbandonedCheckout) -> User | None:
    uid = getattr(checkout, "userId", None)
    if uid is None:
        return None
    try:
        if not isinstance(uid, ObjectId) and ObjectId.is_valid(str(uid)):
            uid = ObjectId(str(uid))
        return await User.get(uid)
    except Exception:
        return None


async def send_recovery_email(checkout: AbandonedCheckout, user: User | None = None) -> dict[str, Any]:
    """Email one checkout its recovery link. Returns the Resend result dict."""
    from app.services import cart_recovery
    from app.services import email_resend as email_svc

    await cart_recovery.ensure_recovery_token(checkout)
    await checkout.save()
    cart_link = cart_recovery.recovery_cart_url(checkout)
    return await email_svc.notify_abandoned_cart_email(checkout, cart_link=cart_link, user=user)


async def process_due_abandoned_recoveries() -> dict[str, Any]:
    from app.services import email_resend as email_svc

    if not email_svc._resend_api_key():
        return {"skipped": True, "reason": "not_configured"}

    cutoff = datetime.utcnow() - timedelta(minutes=ABANDONED_MINUTES)
    rows = (
        await AbandonedCheckout.find(
            AbandonedCheckout.status == "abandoned",
            AbandonedCheckout.recoverySentAt == None,  # noqa: E711
            AbandonedCheckout.lastActivityAt <= cutoff,
        )
        .limit(50)
        .to_list()
    )

    sent = failed = skipped = 0
    for checkout in rows:
        details = checkout.customerDetails or {}
        user = await _checkout_user(checkout)
        has_email = bool(str(details.get("email") or "").strip()) or bool(
            str(getattr(user, "email", None) or "").strip()
        )
        if not has_email:
            skipped += 1
            continue

        # Claim it first so a second worker doesn't send the same email.
        checkout.recoverySentAt = datetime.utcnow()
        await checkout.save()
        try:
            result = await send_recovery_email(checkout, user)
        except Exception as exc:
            result = {"ok": False, "error": str(exc)[:300]}

        now_iso = datetime.utcnow().isoformat()
        checkout.recoveryLastResult = {
            "email": {k: v for k, v in (result or {}).items() if k != "response"},
            **({"emailSentAt": now_iso} if result.get("ok") else {}),
        }
        if result.get("ok"):
            sent += 1
        else:
            checkout.recoverySentAt = None
            if result.get("skipped"):
                skipped += 1
            else:
                failed += 1
        await checkout.save()

    return {"scanned": len(rows), "sent": sent, "failed": failed, "skipped": skipped, "cutoffMinutes": ABANDONED_MINUTES}


async def abandoned_recovery_loop(stop_event: asyncio.Event) -> None:
    """Background poller started from app lifespan."""
    while not stop_event.is_set():
        try:
            from app.services import order_abandon

            mark_result = await order_abandon.mark_stale_unpaid_orders_abandoned()
            if mark_result.get("marked"):
                print(f"[Orders] Marked unpaid gateway exits abandoned: {mark_result}")
        except Exception as exc:
            print(f"[Orders] Abandon unpaid scan error: {exc}")
        try:
            result = await process_due_abandoned_recoveries()
            if result.get("sent"):
                print(f"[Recovery] Abandoned cart emails: {result}")
        except Exception as exc:
            print(f"[Recovery] Abandoned scan error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=POLL_SECONDS)
        except asyncio.TimeoutError:
            pass
