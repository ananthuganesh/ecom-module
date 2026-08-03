"""
Renumber all orders to short UA ids: UA1000, UA1001, ...

Usage (from apps/api):
  .venv/bin/python scripts/renumber_orders.py
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def load_env() -> None:
    root = Path(__file__).resolve().parents[2]
    env = root / ".env" if (root / ".env").is_file() else Path(__file__).resolve().parents[1] / ".env"
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
    prefix = os.environ.get("ORDER_NUMBER_PREFIX", "UA")
    start = int(os.environ.get("ORDER_NUMBER_START", "1000"))

    client = AsyncIOMotorClient(uri)
    db = client[dbn]

    cursor = db.orders.find({}).sort([("createdAt", 1), ("_id", 1)])
    orders = [doc async for doc in cursor]
    print(f"Renumbering {len(orders)} orders as {prefix}{start}, {prefix}{start + 1}, …")

    n = start
    for doc in orders:
        new_num = f"{prefix}{n}"
        old = doc.get("orderNumber")
        if old != new_num:
            await db.orders.update_one({"_id": doc["_id"]}, {"$set": {"orderNumber": new_num}})
            print(f"  {doc['_id']}: {old!r} → {new_num}")
        n += 1

    last = n - 1
    await db.settings.update_one(
        {"key": "seq_order_number"},
        {"$set": {"value": {"seq": last}}},
        upsert=True,
    )
    await db.settings.update_one(
        {"key": "company_profile"},
        {
            "$set": {
                "value.orderPrefix": prefix,
                "value.orderSuffix": "",
            }
        },
        upsert=True,
    )
    print(f"Done. Last = {prefix}{last}; next new order → {prefix}{last + 1}")


if __name__ == "__main__":
    asyncio.run(main())
