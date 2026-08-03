"""
Assign 12-digit orderUrlId to all orders. Keeps display orderNumber (UA1000).

Usage (from apps/api):
  .venv/bin/python scripts/assign_order_url_ids.py
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
    start = int(os.environ.get("ORDER_URL_ID_START", "709021859801"))

    client = AsyncIOMotorClient(uri)
    db = client[dbn]

    cursor = db.orders.find({}).sort([("createdAt", 1), ("_id", 1)])
    orders = [doc async for doc in cursor]
    print(f"Assigning orderUrlId to {len(orders)} orders starting at {start}…")

    n = start
    for doc in orders:
        url_id = f"{n:012d}"
        old = doc.get("orderUrlId")
        if old != url_id:
            await db.orders.update_one({"_id": doc["_id"]}, {"$set": {"orderUrlId": url_id}})
            print(f"  {doc.get('orderNumber')}: {old!r} → {url_id}")
        n += 1

    last = n - 1
    await db.settings.update_one(
        {"key": "seq_order_url_id"},
        {"$set": {"value": {"seq": last}}},
        upsert=True,
    )
    print(f"Done. Last orderUrlId = {last:012d}; next → {n:012d}")


if __name__ == "__main__":
    asyncio.run(main())
