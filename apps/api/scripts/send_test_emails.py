"""
Send all Resend email templates to a test inbox (does not mark orders as sent).

Usage (from apps/api, or via Docker):
  python scripts/send_test_emails.py urbanaana2026@gmail.com
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_env() -> None:
    here = Path(__file__).resolve()
    candidates = []
    if len(here.parents) > 2:
        candidates.append(here.parents[2] / ".env")
    candidates.append(ROOT / ".env")
    candidates.append(Path("/app/.env"))
    env = next((p for p in candidates if p.is_file()), None)
    if not env:
        return
    for line in env.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

from app.db import init_db  # noqa: E402
from app.documents import AbandonedCheckout, Order, User  # noqa: E402
from app.services import cart_recovery  # noqa: E402
from app.services import email_resend as email_svc  # noqa: E402


async def main(to: str) -> None:
    await init_db()
    to = to.strip().lower()
    if not to or "@" not in to:
        raise SystemExit("Usage: send_test_emails.py you@example.com")

    if not email_svc._resend_api_key():
        raise SystemExit("RESEND_API_KEY is not configured")

    order = (
        await Order.find({"paymentStatus": "paid"})
        .sort([("createdAt", -1)])
        .first_or_none()
    )
    if not order:
        order = await Order.find_all().sort([("createdAt", -1)]).first_or_none()
    if not order:
        raise SystemExit("No orders found to render email templates")

    user = None
    if order.customerId:
        try:
            user = await User.get(order.customerId)
        except Exception:
            user = None

    checkout = (
        await AbandonedCheckout.find({"status": "abandoned"})
        .sort([("lastActivityAt", -1)])
        .first_or_none()
    )

    print(f"to={to}")
    print(f"order={order.orderNumber or order.id}")
    print(f"checkout={checkout.id if checkout else None}")
    print(f"from={email_svc._resend_from()}")
    print("---")

    results: list[tuple[str, dict]] = []

    # Prefer a fulfilled order with AWB + productId so shipped template shows names + tracking.
    shipped_order = None
    candidates = (
        await Order.find({"awb": {"$nin": [None, ""]}})
        .sort([("createdAt", -1)])
        .to_list()
    )
    for cand in candidates:
        if any(getattr(it, "productId", None) for it in (cand.items or [])):
            shipped_order = cand
            break
    if not shipped_order and candidates:
        shipped_order = candidates[0]
    if shipped_order:
        order_for_ship = shipped_order
        print(
            f"ship_order={shipped_order.orderNumber or shipped_order.id} "
            f"awb={shipped_order.awb} inv={shipped_order.invoiceNumber}"
        )
    else:
        order_for_ship = order

    for email_type in ("CONFIRMED", "SHIPPED", "DELIVERED"):
        if email_type == "SHIPPED":
            src = order_for_ship
        elif email_type == "DELIVERED":
            delivered = (
                await Order.find({"isDelivered": True})
                .sort([("deliveredAt", -1)])
                .first_or_none()
            )
            src = delivered or order_for_ship or order
        else:
            src = order
        subject, html = await email_svc.build_order_email_html(
            src, email_type=email_type, user=user
        )
        subject = f"[TEST {email_type}] {subject}"
        result = await email_svc.send_email(to=to, subject=subject, html_body=html)
        results.append((email_type, result))
        print(email_type, result.get("ok") or result)

    subject, html = await email_svc.build_staff_new_order_email_html(order, user)
    subject = f"[TEST STAFF] {subject}"
    result = await email_svc.send_email(to=to, subject=subject, html_body=html)
    results.append(("STAFF_NEW_ORDER", result))
    print("STAFF_NEW_ORDER", result.get("ok") or result)

    if checkout:
        await cart_recovery.ensure_recovery_token(checkout)
        if checkout.recoveryToken and not getattr(checkout, "id", None) is False:
            # persist token if newly minted
            try:
                await checkout.save()
            except Exception:
                pass
        cart_link = (
            cart_recovery.recovery_cart_url(checkout)
            or f"{os.environ.get('PUBLIC_WEB_URL', 'https://urbanaana.com').rstrip('/')}/cart"
        )
        subject, html = await email_svc.build_abandoned_cart_email_html(
            checkout, cart_link=cart_link, user=user
        )
        subject = f"[TEST ABANDONED] {subject}"
        result = await email_svc.send_email(to=to, subject=subject, html_body=html)
        results.append(("ABANDONED_CART", result))
        print("ABANDONED_CART", result.get("ok") or result)
    else:
        print("ABANDONED_CART skipped (no abandoned checkout)")

    ok = sum(1 for _, r in results if r.get("ok"))
    fail = sum(1 for _, r in results if not r.get("ok") and not r.get("skipped"))
    print("---")
    print(f"Done: ok={ok} fail={fail} total={len(results)}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "urbanaana2026@gmail.com"
    asyncio.run(main(target))
