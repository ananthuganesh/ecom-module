"""
Align invoice numbers with order chronology:
  oldest non-draft order → INV-100000, next → INV-100001, …

Usage (from apps/api):
  .venv/bin/python scripts/align_invoice_numbers_to_orders.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_env() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    env = repo_root / ".env" if (repo_root / ".env").is_file() else ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


SKIP = {"draft", "abandoned"}
START = 100000


async def main() -> None:
    load_env()
    uri = os.environ["MONGO_URI"]
    dbn = uri.split("/")[-1].split("?")[0]
    client = AsyncIOMotorClient(uri)
    db = client[dbn]

    cursor = db.orders.find({}).sort([("createdAt", 1), ("_id", 1)])
    orders = [doc async for doc in cursor]
    eligible = [o for o in orders if str(o.get("status") or "").lower() not in SKIP]
    print(f"Aligning {len(eligible)} orders → INV-{START}…")

    # Collect invoice docs to renumber (by order)
    pairs: list[tuple[dict, dict | None]] = []
    for order in eligible:
        inv = None
        iid = order.get("invoiceId")
        if iid:
            from bson import ObjectId

            try:
                inv = await db.salesinvoices.find_one({"_id": ObjectId(str(iid))})
            except Exception:
                inv = None
        if not inv:
            inv = await db.salesinvoices.find_one({"orderId": str(order["_id"])})
        pairs.append((order, inv))

    missing = sum(1 for _, inv in pairs if not inv)
    if missing:
        print(f"WARNING: {missing} orders still have no invoice — run backfill first")

    # Pass 1: temp unique numbers to free unique index
    for order, inv in pairs:
        if not inv:
            continue
        temp = f"INV-TMP-{inv['_id']}"
        await db.salesinvoices.update_one({"_id": inv["_id"]}, {"$set": {"number": temp}})

    # Pass 2: chronological INV-100000+
    n = START
    for order, inv in pairs:
        if not inv:
            continue
        new_num = f"INV-{n:06d}"
        old = inv.get("number")
        await db.salesinvoices.update_one({"_id": inv["_id"]}, {"$set": {"number": new_num}})
        await db.orders.update_one(
            {"_id": order["_id"]},
            {"$set": {"invoiceId": str(inv["_id"]), "invoiceNumber": new_num}},
        )
        onum = order.get("orderNumber") or order["_id"]
        print(f"  {onum}: {old!r} → {new_num}")
        n += 1

    last = n - 1 if n > START else START - 1
    await db.settings.update_one(
        {"key": "seq_sales_invoice"},
        {"$set": {"value": {"seq": max(last, START - 1), "format": "INV-6"}}},
        upsert=True,
    )
    print(f"Done. First = INV-{START:06d}; last = INV-{last:06d}; next = INV-{last + 1:06d}")


if __name__ == "__main__":
    asyncio.run(main())
