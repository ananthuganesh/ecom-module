"""
Backfill sales invoices for orders that don't have one.

Skips abandoned orders. Idempotent — existing invoices are linked, not duplicated.

Usage (from apps/api):
  .venv/bin/python scripts/backfill_order_invoices.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import init_db  # noqa: E402
from app.documents import Order, SalesInvoice  # noqa: E402
from app.services import erp_ops  # noqa: E402


SKIP_STATUSES = {"abandoned"}


async def main() -> None:
    await init_db()

    orders = await Order.find_all().sort([("createdAt", 1), ("_id", 1)]).to_list()
    created = 0
    already = 0
    skipped = 0
    failed = 0
    no_items = 0

    before_count = await SalesInvoice.count()

    for order in orders:
        status = str(order.status or "").strip().lower()
        if status in SKIP_STATUSES:
            skipped += 1
            continue

        had_invoice = bool(getattr(order, "invoiceId", None))
        if had_invoice:
            try:
                inv = await erp_ops.ensure_order_invoice(order, actor=None)
            except Exception as exc:
                failed += 1
                print(f"  FAIL {order.orderNumber or order.id}: {exc}")
                continue
            if inv:
                already += 1
            else:
                no_items += 1
            continue

        try:
            inv = await erp_ops.ensure_order_invoice(order, actor=None)
        except Exception as exc:
            failed += 1
            print(f"  FAIL {order.orderNumber or order.id}: {exc}")
            continue

        if inv is None:
            no_items += 1
            print(f"  SKIP (no items) {order.orderNumber or order.id}")
            continue

        created += 1
        print(f"  OK {order.orderNumber or order.id} → {inv.number}")

    after_count = await SalesInvoice.count()
    print(
        f"Done at {datetime.utcnow().isoformat()}Z | "
        f"new_invoices={after_count - before_count} assigned={created} "
        f"already_had={already} skipped_abandoned={skipped} no_items={no_items} "
        f"failed={failed} total_orders={len(orders)} sales_invoices={after_count}"
    )


if __name__ == "__main__":
    asyncio.run(main())
