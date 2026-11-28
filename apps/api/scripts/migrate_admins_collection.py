"""
Move staff/admin accounts from `users` → `admins`, then remove them from `users`.

Keeps the same Mongo _id so existing admin session JWTs keep working.

Usage:
  python scripts/migrate_admins_collection.py           # dry-run
  python scripts/migrate_admins_collection.py --execute
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime
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
from app.documents import AdminAccount, Role, User  # noqa: E402
from app.services import erp_ops  # noqa: E402


def _is_staff(user: User, active_role_ids: set[str]) -> bool:
    if bool(getattr(user, "isAdmin", False)):
        return True
    rid = str(getattr(user, "roleId", None) or "").strip()
    return bool(rid and rid in active_role_ids)


async def main(*, execute: bool) -> None:
    await init_db()
    roles = await Role.find_all().to_list()
    # Ensure roles exist without wiping customer flags first
    if not any(r.name == "Admin" for r in roles) or not any(r.name == "Staff" for r in roles):
        await erp_ops.ensure_default_roles()
        roles = await Role.find_all().to_list()
    admin_role = next((r for r in roles if r.name == "Admin"), None)
    active_role_ids = {
        str(r.id) for r in roles if r.name in erp_ops.ACTIVE_ROLE_NAMES
    }

    candidates = await User.find(
        {
            "$or": [
                {"isAdmin": True},
                {"roleId": {"$nin": [None, ""]}},
                {"email": {"$regex": "^(admin|zero@|info@brid|staff@)", "$options": "i"}},
                {"name": {"$regex": "^Admin$", "$options": "i"}},
            ]
        }
    ).to_list()
    staff = []
    for u in candidates:
        if _is_staff(u, active_role_ids):
            staff.append(u)
            continue
        email = str(u.email or "").lower()
        name = str(u.name or "").strip().lower()
        # Recover known owner/admin accounts whose flags were cleared
        if name == "admin" and u.password:
            staff.append(u)
        elif email.startswith("zero@") and u.password:
            staff.append(u)

    # de-dupe
    seen = set()
    unique = []
    for u in staff:
        if str(u.id) in seen:
            continue
        seen.add(str(u.id))
        unique.append(u)
    staff = unique

    print(f"staff_in_users={len(staff)} execute={execute}")
    for u in staff:
        print(
            f"  {u.id} email={u.email!r} name={u.name!r} "
            f"isAdmin={u.isAdmin} roleId={u.roleId!r} hasPassword={bool(u.password)}"
        )

    if not execute:
        print("Dry-run only. Re-run with --execute to migrate.")
        return

    moved = 0
    skipped = 0
    for user in staff:
        existing = await AdminAccount.get(user.id)
        is_owner = bool(user.isAdmin) or str(user.name or "").strip().lower() == "admin"
        role_id = user.roleId
        if is_owner and admin_role:
            role_id = str(admin_role.id)
        if existing:
            print(f"  skip existing admin id={user.id}")
            skipped += 1
        else:
            account = AdminAccount(
                id=user.id,
                name=user.name or (user.email or "Admin"),
                email=user.email,
                phone=user.phone,
                password=user.password,
                isAdmin=is_owner,
                roleId=role_id,
                createdAt=getattr(user, "createdAt", None) or datetime.utcnow(),
                updatedAt=datetime.utcnow(),
            )
            await account.insert()
            moved += 1
        await user.delete()

    remaining_admins = await AdminAccount.find_all().count()
    leftover_staff = await User.find(
        {
            "$or": [
                {"isAdmin": True},
                {"roleId": {"$nin": [None, ""]}},
            ]
        }
    ).count()
    print(
        f"Done: moved={moved} skipped_existing={skipped} "
        f"admins_collection={remaining_admins} leftover_staff_in_users={leftover_staff}"
    )


if __name__ == "__main__":
    asyncio.run(main(execute="--execute" in sys.argv))
