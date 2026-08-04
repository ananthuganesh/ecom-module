"""
Delete empty storefront customers:

  - no phone (user.phone and address phones empty)
  - no location (no city/state/pincode/house on addresses)
  - zero orders (excluding abandoned/cancelled — same as admin Customers list)
  - never deletes isAdmin users

Usage:
  python scripts/cleanup_empty_customers.py           # dry-run
  python scripts/cleanup_empty_customers.py --execute
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_env() -> None:
    import os

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


def _addr_get(addr, *keys: str) -> str:
    for key in keys:
        if isinstance(addr, dict):
            val = addr.get(key)
        else:
            val = getattr(addr, key, None)
        if val is not None and str(val).strip():
            return str(val).strip()
    return ""


def has_phone(user: User) -> bool:
    if str(user.phone or "").strip():
        return True
    for addr in user.addresses or []:
        if _addr_get(addr, "phone", "mobile", "contact"):
            return True
    return False


def has_location(user: User) -> bool:
    for addr in user.addresses or []:
        if _addr_get(addr, "city", "state", "pincode", "postalCode", "zip", "zipcode", "house", "address", "address1", "line1", "addressLine1"):
            return True
    return False


async def order_counts_by_customer() -> dict[str, int]:
    col = Order.get_pymongo_collection()
    pipeline = [
        {
            "$match": {
                "status": {"$nin": ["abandoned", "cancelled"]},
                "customerId": {"$ne": None},
            }
        },
        {"$group": {"_id": "$customerId", "n": {"$sum": 1}}},
    ]
    out: dict[str, int] = {}
    async for row in col.aggregate(pipeline):
        out[str(row["_id"])] = int(row["n"] or 0)
    return out


async def main(*, execute: bool) -> None:
    await init_db()
    counts = await order_counts_by_customer()
    users = await User.find({"isAdmin": {"$ne": True}}).to_list()

    targets: list[User] = []
    for user in users:
        if has_phone(user) or has_location(user):
            continue
        if counts.get(str(user.id), 0) > 0:
            continue
        targets.append(user)

    print(f"scanned={len(users)} empty={len(targets)} execute={execute}")
    for user in targets[:25]:
        print(
            f"  {user.id} name={user.name!r} email={user.email!r} "
            f"phone={user.phone!r} addrs={len(user.addresses or [])}"
        )
    if len(targets) > 25:
        print(f"  ... and {len(targets) - 25} more")

    if not execute:
        print("Dry-run only. Re-run with --execute to delete.")
        return

    deleted = 0
    ac_cleared = 0
    ids = [u.id for u in targets if u.id is not None]
    if ids:
        # Detach abandoned checkouts so we don't leave dangling userIds
        ac_col = AbandonedCheckout.get_pymongo_collection()
        res = await ac_col.update_many(
            {"userId": {"$in": ids}},
            {"$set": {"userId": None}},
        )
        ac_cleared = int(res.modified_count or 0)

    for user in targets:
        await user.delete()
        deleted += 1

    print(f"Deleted customers={deleted} abandoned_userId_cleared={ac_cleared}")


if __name__ == "__main__":
    do_execute = "--execute" in sys.argv
    asyncio.run(main(execute=do_execute))
