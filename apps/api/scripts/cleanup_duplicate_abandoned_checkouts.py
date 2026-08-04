"""
DEPRECATED for unpaid duplicates.

Abandoned carts list shows AbandonedCheckout IDs only. Convert checkouts when
payment succeeds — not when an unpaid/abandoned Order exists.

Prefer:
  scripts/restore_unpaid_converted_checkouts.py

This script remains for one-off cleanup against PAID orders only.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_env() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    env = repo_root / ".env" if (repo_root / ".env").is_file() else ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

from bson import ObjectId  # noqa: E402

from app.db import init_db  # noqa: E402
from app.documents import AbandonedCheckout, Order  # noqa: E402

TIME_WINDOW = timedelta(days=7)
PAID_LIKE = {
    "paid",
    "captured",
    "authorized",
    "refunded",
    "partially_refunded",
    "refund_pending",
}


def _oid(value: Any) -> ObjectId | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    text = str(value).strip()
    if ObjectId.is_valid(text):
        return ObjectId(text)
    return None


def _norm_email(value: Any) -> str:
    return str(value or "").strip().lower()


def _norm_phone(value: Any) -> str:
    digits = re.sub(r"\D+", "", str(value or ""))
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def _checkout_email(checkout: AbandonedCheckout) -> str:
    details = checkout.customerDetails or {}
    return _norm_email(details.get("email"))


def _checkout_phone(checkout: AbandonedCheckout) -> str:
    details = checkout.customerDetails or {}
    return _norm_phone(details.get("phone") or details.get("contact"))


def _order_email(order: Order) -> str:
    ship = order.shippingAddress or {}
    td = order.transactionDetails or {}
    return _norm_email(ship.get("email") or td.get("email"))


def _order_phone(order: Order) -> str:
    ship = order.shippingAddress or {}
    td = order.transactionDetails or {}
    return _norm_phone(ship.get("phone") or ship.get("contact") or td.get("phone"))


def _is_paid(order: Order) -> bool:
    pay = str(
        order.paymentStatus
        or (order.transactionDetails or {}).get("paymentStatus")
        or ""
    ).strip().lower()
    return pay in PAID_LIKE


def _matches(checkout: AbandonedCheckout, order: Order) -> bool:
    cuid = _oid(checkout.userId)
    oid = _oid(order.customerId)
    user_match = bool(cuid and oid and cuid == oid)

    ce = _checkout_email(checkout)
    oe = _order_email(order)
    if ce and oe and ce != oe:
        return user_match
    if user_match:
        return True
    if ce and oe and ce == oe:
        return True
    cp = _checkout_phone(checkout)
    op = _order_phone(order)
    if cp and op and len(cp) >= 10 and cp == op:
        return True
    return False


def _within_window(checkout: AbandonedCheckout, order: Order) -> bool:
    c_at = checkout.lastActivityAt or datetime.utcnow()
    o_at = order.createdAt or order.updatedAt or datetime.utcnow()
    if c_at.tzinfo:
        c_at = c_at.replace(tzinfo=None)
    if o_at.tzinfo:
        o_at = o_at.replace(tzinfo=None)
    return abs(c_at - o_at) <= TIME_WINDOW


async def main(*, apply: bool) -> None:
    await init_db()

    checkouts = (
        await AbandonedCheckout.find({"status": "abandoned"})
        .sort([("lastActivityAt", -1)])
        .to_list()
    )
    # Only close checkouts when a matching PAID order exists.
    orders = (
        await Order.find(
            {
                "$or": [
                    {"paymentStatus": {"$in": list(PAID_LIKE)}},
                    {"transactionDetails.paymentStatus": {"$in": list(PAID_LIKE)}},
                ]
            }
        )
        .sort([("createdAt", -1)])
        .to_list()
    )
    paid_orders = [o for o in orders if _is_paid(o)]

    print(
        f"{'APPLY' if apply else 'DRY-RUN'} | "
        f"abandoned_checkouts={len(checkouts)} paid_orders={len(paid_orders)}"
    )

    matched = 0
    updated = 0
    skipped = 0

    for checkout in checkouts:
        candidates = [
            o for o in paid_orders if _matches(checkout, o) and _within_window(checkout, o)
        ]
        if not candidates:
            skipped += 1
            continue
        candidates.sort(
            key=lambda o: abs(
                (
                    (checkout.lastActivityAt or datetime.utcnow()).replace(tzinfo=None)
                    - (o.createdAt or datetime.utcnow()).replace(tzinfo=None)
                ).total_seconds()
            )
        )
        order = candidates[0]
        matched += 1
        print(
            f"  MATCH checkout={checkout.id} → order={order.orderNumber or order.id} "
            f"(paid)"
        )
        if not apply:
            continue
        checkout.status = "converted"
        checkout.orderId = order.id
        checkout.lastActivityAt = datetime.utcnow()
        details = dict(checkout.customerDetails or {})
        details["cleanup"] = {
            "reason": "paid_order_converted_checkout",
            "matchedOrderId": str(order.id),
            "matchedOrderNumber": order.orderNumber,
            "at": datetime.utcnow().isoformat() + "Z",
        }
        checkout.customerDetails = details
        await checkout.save()
        updated += 1

    print(
        f"Done | matched={matched} updated={updated} unmatched={skipped} "
        f"mode={'apply' if apply else 'dry-run'}"
    )
    if not apply and matched:
        print("Re-run with --apply to write changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Mark AbandonedCheckout converted only when a paid Order matches."
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(apply=args.apply))
