#!/usr/bin/env python3
"""
Read-only import: Urban Aana (live) → Urban Aana MongoDB.

HARD RULES:
- Never insert/update/delete on the SOURCE database.
- Never touch Cloudflare R2; keep existing public image URLs.
- Do not commit SOURCE_MONGO_URI secrets.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

# Allow `python scripts/import_urbanaana.py` from apps/api
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import close_db, init_db  # noqa: E402
from app.documents import (  # noqa: E402
    Address,
    Category,
    Order,
    OrderItem,
    Pricing,
    Product,
    User,
    Variant,
)
from app.services.erp_ops import ensure_default_roles  # noqa: E402


STATUS_MAP = {
    "Processing": "order placed",
    "Shipped": "shipped",
    "Delivered": "delivered",
    "Cancelled": "cancelled",
}


def _shipping_status(*, status: str, payment_status: str, awb: str | None, is_delivered: bool) -> str:
    """Map Urban order state → Urban Aana DTDC shippingStatus used by admin shipment tabs."""
    st = (status or "").strip().lower()
    paid = (payment_status or "").strip().lower() == "paid"
    has_awb = bool((awb or "").strip())
    if is_delivered or st == "delivered":
        return "Delivered"
    if st == "out for delivery":
        return "Out for Delivery"
    if st == "shipped":
        return "In Transit"
    if st == "cancelled":
        return "Cancelled"
    if st == "returned":
        return "Returned"
    if not paid:
        return "Payment Pending"
    if has_awb:
        return "In Transit"
    # Paid, no AWB yet — Unfulfilled (empty shippingStatus)
    return ""


def _force_read_only_uri(uri: str) -> str:
    """Append secondaryPreferred so we never prefer a writable primary needlessly."""
    parts = urlparse(uri)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("readPreference", "secondaryPreferred")
    return urlunparse(parts._replace(query=urlencode(query)))


def _oid(value) -> ObjectId | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    s = str(value)
    return ObjectId(s) if ObjectId.is_valid(s) else None


def _dt(value, fallback: datetime | None = None) -> datetime:
    if isinstance(value, datetime):
        return value
    return fallback or datetime.utcnow()


async def import_all(*, source_uri: str, dry_run: bool = False) -> dict:
    source_uri = _force_read_only_uri(source_uri)
    source = AsyncIOMotorClient(source_uri, connectTimeoutMS=20000, serverSelectionTimeoutMS=20000)
    src_db = source.get_default_database()
    if src_db is None:
        # fallback name from path
        path = urlparse(source_uri).path.lstrip("/").split("?")[0] or "urbanaana"
        src_db = source[path]

    # Safety: refuse if source looks like target
    target_name = os.environ.get("TARGET_DB_NAME") or "urbanaana_db"
    if src_db.name == target_name:
        raise RuntimeError(f"Refusing to use source DB name equal to target ({target_name})")

    await init_db()
    await ensure_default_roles()

    stats = {
        "categories": 0,
        "products": 0,
        "users": 0,
        "orders": 0,
        "skipped_orders": 0,
        "dry_run": dry_run,
        "source_db": src_db.name,
    }

    category_map: dict[str, ObjectId] = {}
    product_map: dict[str, ObjectId] = {}
    user_map: dict[str, ObjectId] = {}

    # --- Categories ---
    async for cat in src_db.categories.find({"isDeleted": {"$ne": True}}):
        old_id = str(cat["_id"])
        name = (cat.get("name") or "Category").strip()
        slug = (cat.get("slug") or name.lower().replace(" ", "-")).strip()
        if dry_run:
            category_map[old_id] = ObjectId()
            stats["categories"] += 1
            continue
        existing = await Category.find_one(Category.slug == slug)
        if existing:
            category_map[old_id] = existing.id
            continue
        doc = Category(
            name=name,
            slug=slug,
            isActive=True,
            createdAt=_dt(cat.get("createdAt")),
            updatedAt=_dt(cat.get("updatedAt")),
        )
        await doc.insert()
        category_map[old_id] = doc.id
        stats["categories"] += 1

    # --- Products ---
    async for prod in src_db.products.find({"isDeleted": {"$ne": True}}):
        old_id = str(prod["_id"])
        name = (prod.get("name") or "Product").strip()
        slug = (prod.get("slug") or "").strip() or None
        main_image = prod.get("mainImage") or ""
        thumbnails = [main_image] if main_image else []
        variants_out: list[Variant] = []
        prices: list[float] = []
        total_stock = 0

        for variant in prod.get("variants") or []:
            if variant.get("isDeleted"):
                continue
            color = (variant.get("color") or "").strip()
            images = [u for u in (variant.get("images") or []) if u]
            for size_row in variant.get("sizes") or []:
                size = str(size_row.get("size") or "").strip()
                qty = int(size_row.get("stock") or 0)
                price = float(size_row.get("price") or 0)
                total_stock += max(qty, 0)
                if price > 0:
                    prices.append(price)
                variants_out.append(
                    Variant(
                        color=color,
                        size=size,
                        quantity=max(qty, 0),
                        images=images or ([main_image] if main_image else []),
                    )
                )
            # color-only row if no sizes
            if not (variant.get("sizes") or []):
                variants_out.append(
                    Variant(color=color, size="", quantity=0, images=images or ([main_image] if main_image else []))
                )

        sell = min(prices) if prices else float(prod.get("price") or 0)
        cat_ref = prod.get("category")
        cat_key = str(cat_ref) if cat_ref else None
        new_cat = category_map.get(cat_key) if cat_key else None

        if dry_run:
            product_map[old_id] = ObjectId()
            stats["products"] += 1
            continue

        if slug:
            existing = await Product.find_one(Product.slug == slug)
            if existing:
                product_map[old_id] = existing.id
                continue

        doc = Product(
            productName=name,
            name=name,
            product=name,
            slug=slug,
            category=str(new_cat) if new_cat else (cat_key or None),
            description=(prod.get("mainDescription") or prod.get("shortDescription") or "")[:5000],
            pricing=Pricing(sellingPrice=sell, offerPrice=sell, mrp=sell) if sell else None,
            variants=variants_out,
            thumbnails=thumbnails,
            totalStock=total_stock,
            status="active",
            createdAt=_dt(prod.get("createdAt")),
            updatedAt=_dt(prod.get("updatedAt")),
        )
        await doc.insert()
        product_map[old_id] = doc.id
        stats["products"] += 1

    # --- Customers (non-admin) ---
    # password is select:false in mongoose but raw Mongo still has the field
    async for user in src_db.users.find({"role": {"$ne": "admin"}}):
        old_id = str(user["_id"])
        email = (user.get("email") or "").strip().lower()
        if not email:
            continue
        if email == "admin@urbanaana.com":
            continue

        addresses = []
        phone = None
        for addr in user.get("addresses") or []:
            full_name = f"{addr.get('firstName') or ''} {addr.get('lastName') or ''}".strip()
            phone = phone or (addr.get("phone") or None)
            addresses.append(
                Address(
                    name=full_name or (user.get("name") or ""),
                    phone=str(addr.get("phone") or ""),
                    house=str(addr.get("address") or ""),
                    city=str(addr.get("city") or ""),
                    state=str(addr.get("state") or ""),
                    pincode=str(addr.get("postalCode") or ""),
                    country="India",
                    isDefault=bool(addr.get("isDefault")),
                )
            )

        if dry_run:
            user_map[old_id] = ObjectId()
            stats["users"] += 1
            continue

        existing = await User.find_one(User.email == email)
        if existing:
            user_map[old_id] = existing.id
            continue

        pwd = user.get("password")
        # Keep bcrypt hash as-is when present; otherwise leave unset
        doc = User(
            name=(user.get("name") or email.split("@")[0]).strip(),
            email=email,
            phone=phone,
            password=pwd if isinstance(pwd, str) and pwd.startswith("$2") else None,
            addresses=addresses,
            isAdmin=False,
            createdAt=_dt(user.get("createdAt")),
            updatedAt=_dt(user.get("updatedAt")),
        )
        from app.services.customer_url_id import next_customer_url_id

        doc.customerUrlId = await next_customer_url_id()
        await doc.insert()
        user_map[old_id] = doc.id
        stats["users"] += 1

    # --- Orders ---
    async for order in src_db.orders.find({}):
        old_user = str(order.get("user") or "")
        customer_id = user_map.get(old_user)
        if not customer_id:
            # create placeholder customer if missing
            if dry_run:
                stats["skipped_orders"] += 1
                continue
            placeholder = User(
                name=f"Imported {old_user[-6:]}" if old_user else "Imported guest",
                email=None,
                isAdmin=False,
            )
            from app.services.customer_url_id import next_customer_url_id

            placeholder.customerUrlId = await next_customer_url_id()
            await placeholder.insert()
            customer_id = placeholder.id
            if old_user:
                user_map[old_user] = customer_id

        items: list[OrderItem] = []
        for line in order.get("orderItems") or []:
            src_pid = str(line.get("product") or "")
            items.append(
                OrderItem(
                    productId=product_map.get(src_pid),
                    color=str(line.get("color") or ""),
                    size=str(line.get("size") or ""),
                    quantity=int(line.get("quantity") or 1),
                    price=float(line.get("price") or 0),
                )
            )

        ship = order.get("shippingAddress") or {}
        shipping_address = {
            "name": f"{ship.get('firstName') or ''} {ship.get('lastName') or ''}".strip(),
            "phone": ship.get("phone") or "",
            "address": ship.get("address") or "",
            "street": ship.get("address") or "",
            "city": ship.get("city") or "",
            "state": ship.get("state") or "",
            "pincode": ship.get("postalCode") or "",
            "postalCode": ship.get("postalCode") or "",
            "country": "India",
        }

        ua_status = order.get("orderStatus") or "Processing"
        status = STATUS_MAP.get(ua_status, "order placed")
        is_paid = bool(order.get("isPaid"))
        payment_method = str(order.get("paymentMethod") or "razorpay").lower()
        if payment_method == "razorpay":
            payment_method = "razorpay"
        payment_status = "paid" if is_paid else "pending"
        if status == "cancelled" and not is_paid:
            payment_status = "pending"

        total_price = float(order.get("totalPrice") or 0)
        shipping_price = float(order.get("shippingPrice") or 0)
        tax_price = float(order.get("taxPrice") or 0)
        subtotal = max(0.0, total_price - shipping_price)
        awb = (order.get("trackingId") or "").strip() or None
        is_delivered = bool(order.get("isDelivered")) or status == "delivered"
        shipping_status = _shipping_status(
            status=status,
            payment_status=payment_status,
            awb=awb,
            is_delivered=is_delivered,
        )

        if dry_run:
            stats["orders"] += 1
            continue

        doc = Order(
            customerId=customer_id,
            orderNumber=f"UA-{str(order.get('_id'))[-8:].upper()}",
            items=items,
            shippingAddress=shipping_address,
            status=status,
            shippingStatus=shipping_status,
            total=subtotal,
            finalPrice=total_price,
            deliveryAmount=shipping_price,
            discount=0,
            discountAmount=0,
            paymentMethod=payment_method,
            paymentStatus=payment_status,
            razorpayOrderId=order.get("razorpayOrderId"),
            razorpayPaymentId=order.get("razorpayPaymentId"),
            courier=order.get("courierPartner") or None,
            awb=awb,
            isDelivered=is_delivered,
            deliveredAt=order.get("deliveredAt"),
            transactionDetails={
                "paymentMethod": payment_method,
                "paymentStatus": payment_status,
                "importedFrom": "urbanaana",
                "sourceOrderId": str(order.get("_id")),
                "taxPrice": tax_price,
                "paidAt": order.get("paidAt").isoformat() if isinstance(order.get("paidAt"), datetime) else order.get("paidAt"),
            },
            createdAt=_dt(order.get("createdAt")),
            updatedAt=_dt(order.get("updatedAt")),
        )
        await doc.insert()
        stats["orders"] += 1

    source.close()
    await close_db()
    return stats


def _load_dotenv_value(path: Path, key: str) -> str | None:
    if not path.is_file():
        return None
    for line in path.read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


async def _amain() -> None:
    parser = argparse.ArgumentParser(description="Import Urban Aana data into Urban Aana (source read-only)")
    parser.add_argument("--dry-run", action="store_true", help="Count/map only; no writes to Urban Aana")
    parser.add_argument("--source-env", default="", help="Path to Urban Aana .env for MONGO_URI")
    args = parser.parse_args()

    source_uri = os.environ.get("SOURCE_MONGO_URI", "").strip()
    if not source_uri and args.source_env:
        source_uri = _load_dotenv_value(Path(args.source_env), "MONGO_URI") or ""
    if not source_uri:
        # Convenient local default path (not committed)
        default_env = Path("/Users/ananthuganesh/Documents/urban-code/urban-aana-backend/.env")
        source_uri = _load_dotenv_value(default_env, "MONGO_URI") or ""

    if not source_uri:
        raise SystemExit("SOURCE_MONGO_URI is required (or --source-env pointing at Urban Aana .env)")

    # Never print the URI
    stats = await import_all(source_uri=source_uri, dry_run=args.dry_run)
    print("import_complete", stats)


if __name__ == "__main__":
    asyncio.run(_amain())
