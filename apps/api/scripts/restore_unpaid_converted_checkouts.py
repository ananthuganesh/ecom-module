"""
Restore AbandonedCheckout rows that were closed against unpaid/abandoned Orders.

Earlier cleanup marked checkouts converted when a matching Order existed. Abandoned
carts should keep checkout IDs until payment succeeds — so reopen those rows when
the matched order was never paid.

Usage (from apps/api):
  .venv/bin/python scripts/restore_unpaid_converted_checkouts.py
  .venv/bin/python scripts/restore_unpaid_converted_checkouts.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime
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


def _is_paid(order: Order) -> bool:
    pay = str(
        order.paymentStatus
        or (order.transactionDetails or {}).get("paymentStatus")
        or ""
    ).strip().lower()
    return pay in PAID_LIKE


async def main(*, apply: bool) -> None:
    await init_db()

    checkouts = await AbandonedCheckout.find(
        {
            "status": "converted",
            "customerDetails.cleanup.reason": "duplicate_abandoned_checkout",
        }
    ).to_list()

    print(
        f"{'APPLY' if apply else 'DRY-RUN'} | "
        f"cleanup_converted_checkouts={len(checkouts)}"
    )

    restored = 0
    kept = 0
    missing_order = 0

    for checkout in checkouts:
        details = dict(checkout.customerDetails or {})
        cleanup = details.get("cleanup") or {}
        order_id = _oid(cleanup.get("matchedOrderId") or checkout.orderId)
        order = await Order.get(order_id) if order_id else None
        if not order:
            missing_order += 1
            print(f"  SKIP checkout={checkout.id} (matched order missing)")
            continue

        if _is_paid(order):
            kept += 1
            print(
                f"  KEEP checkout={checkout.id} → {order.orderNumber} "
                f"(order paid)"
            )
            continue

        label = (
            f"checkout={checkout.id} ← order={order.orderNumber or order.id} "
            f"status={order.status} pay={order.paymentStatus}"
        )
        print(f"  RESTORE {label}")
        if not apply:
            restored += 1
            continue

        checkout.status = "abandoned"
        checkout.orderId = None
        checkout.lastActivityAt = datetime.utcnow()
        details.pop("cleanup", None)
        checkout.customerDetails = details
        await checkout.save()
        restored += 1

    print(
        f"Done | restore_candidates={restored} kept_paid={kept} "
        f"missing_order={missing_order} mode={'apply' if apply else 'dry-run'}"
    )
    if not apply and restored:
        print("Re-run with --apply to write changes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Reopen checkouts converted against unpaid/abandoned orders."
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(apply=args.apply))
