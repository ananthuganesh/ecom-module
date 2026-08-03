"""
Assign 12-digit customerUrlId to storefront customers (isAdmin != true).

Picks a random start in [100000000000, 899999999999] on first run
(or CUSTOMER_URL_ID_START), then increments sequentially.

Usage (from apps/api):
  .venv/bin/python scripts/assign_customer_url_ids.py
"""

from __future__ import annotations

import asyncio
import os
import random
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

_START_MIN = 100_000_000_000
_START_MAX = 899_999_999_999
_SEQ_KEY = "seq_customer_url_id"


def load_env() -> None:
    root = Path(__file__).resolve().parents[2]
    env = root / ".env" if (root / ".env").is_file() else Path(__file__).resolve().parents[1] / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def resolve_start(db_seq: int | None) -> int:
    env_start = os.environ.get("CUSTOMER_URL_ID_START", "").strip()
    if env_start.isdigit() and len(env_start) <= 12:
        return int(env_start)
    if db_seq is not None and db_seq >= _START_MIN:
        return db_seq + 1
    return random.randint(_START_MIN, _START_MAX)


async def main() -> None:
    load_env()
    uri = os.environ["MONGO_URI"]
    dbn = uri.split("/")[-1].split("?")[0]

    client = AsyncIOMotorClient(uri)
    db = client[dbn]

    counter = await db.settings.find_one({"key": _SEQ_KEY})
    db_seq = None
    if counter:
        db_seq = int((counter.get("value") or {}).get("seq") or 0) or None

    cursor = db.users.find({"isAdmin": {"$ne": True}}).sort(
        [("createdAt", 1), ("_id", 1)]
    )
    users = [doc async for doc in cursor]
    print(f"Found {len(users)} storefront customers…")

    # Continue after max existing url id if any, else resolve_start
    existing_nums = []
    for doc in users:
        cid = doc.get("customerUrlId")
        if isinstance(cid, str) and cid.isdigit() and len(cid) == 12:
            existing_nums.append(int(cid))
    if existing_nums:
        start = max(existing_nums) + 1
        if db_seq is not None and db_seq + 1 > start:
            start = db_seq + 1
    else:
        start = resolve_start(db_seq)

    print(f"Assigning from {start:012d}…")

    n = start
    assigned = 0
    for doc in users:
        cid = doc.get("customerUrlId")
        if isinstance(cid, str) and cid.isdigit() and len(cid) == 12:
            continue
        url_id = f"{n:012d}"
        await db.users.update_one(
            {"_id": doc["_id"]},
            {"$set": {"customerUrlId": url_id}},
        )
        print(f"  {doc.get('email') or doc.get('phone') or doc['_id']}: → {url_id}")
        assigned += 1
        n += 1

    last = n - 1 if assigned else (max(existing_nums) if existing_nums else start - 1)
    if last >= _START_MIN:
        await db.settings.update_one(
            {"key": _SEQ_KEY},
            {"$set": {"value": {"seq": last}}},
            upsert=True,
        )
        print(f"Done. Assigned {assigned}. Last customerUrlId = {last:012d}; next → {last + 1:012d}")
    else:
        print(f"Done. Assigned {assigned}. No counter update.")


if __name__ == "__main__":
    asyncio.run(main())
