"""Saved-address book on a customer ``User``.

Shared by the customer account routes (``/api/users/addresses``) and the admin
customer page (``/api/admin/users/{id}/addresses``) so both apply the same
validation and default-address rules. Callers save the user afterwards.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel

from app.documents import Address, User


class AddressBody(BaseModel):
    label: str | None = None
    name: str | None = None
    phone: str | None = None
    house: str | None = None
    address: str | None = None  # checkout alias for house
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    postalCode: str | None = None  # checkout alias
    country: str | None = None
    isDefault: bool | None = None


def normalize_indian_mobile(value: str | None) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if digits.startswith("91") and len(digits) >= 12:
        digits = digits[-10:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits[:10]


def ensure_address_ids(user: User) -> bool:
    changed = False
    next_addrs: list[Address] = []
    for a in list(user.addresses or []):
        data = a.model_dump() if hasattr(a, "model_dump") else dict(a or {})
        if not str(data.get("id") or "").strip():
            data["id"] = uuid4().hex
            changed = True
        next_addrs.append(Address(**data))
    if changed:
        user.addresses = next_addrs
    return changed


def find_address_index(user: User, address_id: str) -> int:
    aid = str(address_id or "").strip()
    for i, a in enumerate(user.addresses or []):
        if str(getattr(a, "id", "") or "") == aid:
            return i
    # legacy-{i} ids from serializer when DB row has no id yet
    if aid.startswith("legacy-"):
        try:
            idx = int(aid.split("-", 1)[1])
        except ValueError:
            idx = -1
        if 0 <= idx < len(user.addresses or []):
            return idx
    raise HTTPException(status_code=404, detail="Address not found")


def address_from_body(body: AddressBody, *, fallback_name: str = "", fallback_phone: str = "") -> Address:
    house = str(body.house or body.address or "").strip()
    pincode = str(body.pincode or body.postalCode or "").strip()
    city = str(body.city or "").strip()
    state = str(body.state or "").strip()
    if len(house) < 5:
        raise HTTPException(status_code=400, detail="Enter a complete street address.")
    if not (len(pincode) == 6 and pincode.isdigit()):
        raise HTTPException(status_code=400, detail="Enter a valid 6-digit PIN code.")
    if not city or not state:
        raise HTTPException(status_code=400, detail="City and state are required.")
    phone = normalize_indian_mobile(body.phone) or normalize_indian_mobile(fallback_phone)
    name = str(body.name or fallback_name or "").strip()
    return Address(
        id=uuid4().hex,
        label=str(body.label or "").strip()[:40],
        name=name,
        phone=phone,
        house=house,
        city=city,
        state=state,
        pincode=pincode,
        country=str(body.country or "India").strip() or "India",
        isDefault=bool(body.isDefault),
    )


def set_default_index(user: User, index: int) -> None:
    for i, a in enumerate(user.addresses or []):
        a.isDefault = i == index


def add_address(user: User, body: AddressBody) -> Address:
    ensure_address_ids(user)
    addr = address_from_body(
        body,
        fallback_name=str(user.name or ""),
        fallback_phone=str(user.phone or ""),
    )
    addrs = list(user.addresses or [])
    make_default = bool(body.isDefault) or not addrs
    if make_default:
        for a in addrs:
            a.isDefault = False
    addr.isDefault = make_default
    addrs.append(addr)
    user.addresses = addrs
    user.updatedAt = datetime.utcnow()
    return addr


def update_address(user: User, address_id: str, body: AddressBody) -> Address:
    ensure_address_ids(user)
    idx = find_address_index(user, address_id)
    current = user.addresses[idx]
    patch = address_from_body(
        body,
        fallback_name=str(current.name or user.name or ""),
        fallback_phone=str(current.phone or user.phone or ""),
    )
    patch.id = current.id or patch.id
    if body.isDefault is None:
        patch.isDefault = bool(current.isDefault)
    user.addresses[idx] = patch
    if patch.isDefault:
        set_default_index(user, idx)
    user.updatedAt = datetime.utcnow()
    return patch


def make_default(user: User, address_id: str) -> None:
    ensure_address_ids(user)
    set_default_index(user, find_address_index(user, address_id))
    user.updatedAt = datetime.utcnow()


def delete_address(user: User, address_id: str) -> None:
    ensure_address_ids(user)
    idx = find_address_index(user, address_id)
    was_default = bool(user.addresses[idx].isDefault)
    user.addresses = [a for i, a in enumerate(user.addresses) if i != idx]
    if was_default and user.addresses:
        user.addresses[0].isDefault = True
    user.updatedAt = datetime.utcnow()
