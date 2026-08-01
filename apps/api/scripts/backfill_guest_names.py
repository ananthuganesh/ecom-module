"""Backfill User.name when it is still 'Guest User'.

Priority:
1. Latest order shippingAddress.name
2. User address book name
3. Email local-part (humanized)
Also fills missing phone from shipping when possible.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime

from app.db import init_db
from app.documents import Order, User

BAD_NAMES = {
    "",
    "guest",
    "guest user",
    "guestuser",
    "customer",
    "admin user",
    "imported guest",
}


def clean_name(value: object) -> str | None:
    name = " ".join(str(value or "").split()).strip()
    if not name or name.lower() in BAD_NAMES:
        return None
    if re.fullmatch(r"[\d\s+\-()]+", name):
        return None
    if len(name) < 2:
        return None
    return name


def name_from_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    local = email.split("@", 1)[0].strip()
    if not local or "guest" in local.lower():
        return None
    # skip pure numbers / very short
    if local.isdigit() or len(local) < 3:
        return None
    human = local.replace(".", " ").replace("_", " ").replace("-", " ")
    human = re.sub(r"\d+", " ", human)
    human = " ".join(human.split()).strip()
    if len(human) < 2:
        return None
    return human.title()


def clean_phone(value: object) -> str | None:
    raw = re.sub(r"\D+", "", str(value or ""))
    if len(raw) < 10:
        return None
    # ignore obvious placeholders
    if raw in {"0000000000", "9999999999", "1234567890"} or raw.startswith("0000"):
        return None
    return raw[-10:] if len(raw) >= 10 else raw


async def resolve_from_orders(user: User) -> tuple[str | None, str | None]:
    orders = (
        await Order.find(Order.customerId == user.id)
        .sort([("createdAt", -1)])
        .limit(15)
        .to_list()
    )
    best_name = None
    best_phone = None
    for order in orders:
        ship = order.shippingAddress or {}
        best_name = clean_name(ship.get("name")) or clean_name(ship.get("fullName")) or best_name
        if not best_name:
            first = ship.get("firstName") or ""
            last = ship.get("lastName") or ""
            best_name = clean_name(f"{first} {last}") or best_name
        best_phone = best_phone or clean_phone(ship.get("phone") or ship.get("mobile"))
        if best_name and best_phone:
            break
    return best_name, best_phone


async def resolve_from_addresses(user: User) -> tuple[str | None, str | None]:
    best_name = None
    best_phone = None
    for addr in user.addresses or []:
        best_name = clean_name(getattr(addr, "name", None)) or best_name
        best_phone = best_phone or clean_phone(getattr(addr, "phone", None))
        if best_name and best_phone:
            break
    return best_name, best_phone


async def main() -> None:
    await init_db()
    guests = await User.find({"name": {"$regex": "^guest user$", "$options": "i"}}).to_list()
    updated = 0
    phone_filled = 0
    skipped = 0

    for user in guests:
        name = None
        phone = clean_phone(user.phone)

        ship_name, ship_phone = await resolve_from_orders(user)
        addr_name, addr_phone = await resolve_from_addresses(user)

        name = ship_name or addr_name or name_from_email(user.email)
        phone = phone or ship_phone or addr_phone

        if not name and not phone:
            skipped += 1
            continue

        changed = False
        if name and clean_name(user.name) is None:
            user.name = name
            changed = True
            updated += 1
        if phone and not clean_phone(user.phone):
            user.phone = phone
            changed = True
            phone_filled += 1
        if changed:
            user.updatedAt = datetime.utcnow()
            await user.save()

    print(
        {
            "guests": len(guests),
            "names_updated": updated,
            "phones_filled": phone_filled,
            "skipped": skipped,
        }
    )


if __name__ == "__main__":
    asyncio.run(main())
