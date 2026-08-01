"""
Renumber sales invoices to INV-100000, INV-100001, …

Usage (from apps/api):
  .venv/bin/python scripts/renumber_invoices.py
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def load_env() -> None:
    env = Path(__file__).resolve().parents[1] / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


async def main() -> None:
    load_env()
    uri = os.environ["MONGO_URI"]
    dbn = uri.split("/")[-1].split("?")[0]
    start = int(os.environ.get("INVOICE_NUMBER_START", "100000"))

    client = AsyncIOMotorClient(uri)
    db = client[dbn]

    cursor = db.salesinvoices.find({}).sort([("createdAt", 1), ("_id", 1)])
    invoices = [doc async for doc in cursor]
    print(f"Renumbering {len(invoices)} invoices as INV-{start}, INV-{start + 1}, …")

    # Two-pass: temp numbers first to avoid unique collisions
    for i, doc in enumerate(invoices):
        temp = f"INV-TMP-{doc['_id']}"
        await db.salesinvoices.update_one({"_id": doc["_id"]}, {"$set": {"number": temp}})

    n = start
    for doc in invoices:
        new_num = f"INV-{n:06d}"
        await db.salesinvoices.update_one({"_id": doc["_id"]}, {"$set": {"number": new_num}})
        await db.orders.update_many(
            {"invoiceId": str(doc["_id"])},
            {"$set": {"invoiceNumber": new_num}},
        )
        # Also match by old number if invoiceId missing
        old = doc.get("number")
        if old:
            await db.orders.update_many(
                {"invoiceNumber": old},
                {"$set": {"invoiceNumber": new_num}},
            )
        print(f"  {doc['_id']}: {old!r} → {new_num}")
        n += 1

    last = n - 1 if invoices else start - 1
    await db.settings.update_one(
        {"key": "seq_sales_invoice"},
        {"$set": {"value": {"seq": max(last, start - 1), "format": "INV-6"}}},
        upsert=True,
    )
    print(f"Done. Last = INV-{last:06d}; next new invoice → INV-{last + 1:06d}")


if __name__ == "__main__":
    asyncio.run(main())
