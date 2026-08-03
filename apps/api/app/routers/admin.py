import csv
from datetime import datetime
from io import StringIO
from pathlib import Path
import os
import re
from typing import Any, Literal
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile

from app.deps import (
    AdminUser,
    CustomersReader,
    CustomersWriter,
    OrdersReader,
    OrdersWriter,
    PaymentsWriter,
    RoleManager,
)
from app.config import get_settings
from app.documents import (
    AbandonedCheckout,
    Address,
    AiMediaJob,
    Brand,
    Category,
    Coupon,
    Order,
    OrderItem,
    Pricing,
    Product,
    Setting,
    TaxClass,
    User,
    Variant,
)
from app.serializers import doc_to_dict, enrich_orders, remap_order, user_public
from app.services import erp_ops
from app.services.rate_limit import rate_limit_dependency
from app.services.shipping_settings import get_shipping_settings as load_shipping_settings
from app.services.stock import apply_order_commitments, reserve_order_stock
from app.services.store_settings import (
    get_notification_prefs,
    get_payment_methods,
    save_notification_prefs,
    save_payment_methods,
    ensure_payment_method_enabled,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "products"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
AI_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "ai"
AI_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
HSN_RE = re.compile(r"^[0-9]{4,8}$")

DEFAULT_TAX_CLASSES = [
    {"name": "GST 0%", "rate": 0, "isDefault": False},
    {"name": "GST 5%", "rate": 5, "isDefault": False},
    {"name": "GST 12%", "rate": 12, "isDefault": False},
    {"name": "GST 18%", "rate": 18, "isDefault": True},
    {"name": "GST 28%", "rate": 28, "isDefault": False},
]

DEFAULT_COMPANY_PROFILE = {
    "legalName": "Urban Aana",
    "tradeName": "Urban Aana",
    "gstin": "",
    "email": "hello@urbanaana.com",
    "phone": "",
    "addressLine1": "",
    "addressLine2": "",
    "city": "",
    "stateName": "",
    "stateCode": "",
    "pincode": "",
    "country": "India",
    "currency": "INR",
    "defaultPriceTaxMode": "inclusive",
    "lowStockThreshold": 10,
    "orderPrefix": "#",
    "orderSuffix": "",
}


@router.get("/payment-methods")
async def get_payment_method_settings(_: AdminUser):
    return await get_payment_methods()


@router.put("/payment-methods")
async def save_payment_method_settings(body: dict, _: AdminUser):
    return await save_payment_methods(body)


@router.get("/notification-prefs")
async def get_notification_preferences(_: AdminUser):
    return await get_notification_prefs()


@router.put("/notification-prefs")
async def save_notification_preferences(body: dict, _: AdminUser):
    return await save_notification_prefs(body)


def _validate_gstin(gstin: str | None) -> str | None:
    if gstin is None or str(gstin).strip() == "":
        return None
    value = str(gstin).strip().upper()
    if not GSTIN_RE.match(value):
        raise HTTPException(status_code=400, detail="Invalid GSTIN format")
    return value


def _validate_hsn(hsn: str | None) -> str | None:
    if hsn is None or str(hsn).strip() == "":
        return None
    value = str(hsn).strip()
    if not HSN_RE.match(value):
        raise HTTPException(status_code=400, detail="HSN must be 4–8 digits")
    return value


async def _ensure_tax_classes() -> list[TaxClass]:
    existing = await TaxClass.find_all().sort([("rate", 1)]).to_list()
    if existing:
        return existing
    created: list[TaxClass] = []
    for row in DEFAULT_TAX_CLASSES:
        doc = TaxClass(
            name=row["name"],
            rate=row["rate"],
            isDefault=row["isDefault"],
            isActive=True,
        )
        await doc.insert()
        created.append(doc)
    return created


async def _clear_other_defaults(except_id: ObjectId | None = None) -> None:
    others = await TaxClass.find(TaxClass.isDefault == True).to_list()  # noqa: E712
    for other in others:
        if except_id and other.id == except_id:
            continue
        other.isDefault = False
        other.updatedAt = datetime.utcnow()
        await other.save()


@router.get("/users")
async def admin_users(
    _: CustomersReader,
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=200),
):
    from app.services.pagination import parse_pagination

    sk, lim, _pg = parse_pagination(page=page, skip=skip, limit=limit)
    users = await User.find_all().skip(sk).limit(lim).to_list()
    user_ids = [u.id for u in users if u.id is not None]
    stats_by_id: dict[str, dict] = {}
    ship_by_id: dict[str, dict] = {}
    if user_ids:
        collection = Order.get_pymongo_collection()
        match = {
            "customerId": {"$in": user_ids},
            "status": {"$nin": ["draft", "abandoned", "cancelled"]},
        }
        stats_pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": "$customerId",
                    "ordersCount": {"$sum": 1},
                    "amountSpent": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$in": [
                                        {"$toLower": {"$ifNull": ["$paymentStatus", ""]}},
                                        ["paid", "pay_on_delivery", "cod"],
                                    ]
                                },
                                {"$ifNull": ["$finalPrice", {"$ifNull": ["$total", 0]}]},
                                0,
                            ]
                        }
                    },
                }
            },
        ]
        ship_pipeline = [
            {"$match": match},
            {"$sort": {"createdAt": -1}},
            {
                "$group": {
                    "_id": "$customerId",
                    "shippingAddress": {"$first": "$shippingAddress"},
                }
            },
        ]
        try:
            rows = await collection.aggregate(stats_pipeline).to_list(length=None)
            for row in rows:
                key = str(row.get("_id"))
                stats_by_id[key] = {
                    "ordersCount": int(row.get("ordersCount") or 0),
                    "amountSpent": float(row.get("amountSpent") or 0),
                }
        except Exception:
            stats_by_id = {}
        try:
            ship_rows = await collection.aggregate(ship_pipeline).to_list(length=None)
            for row in ship_rows:
                ship = row.get("shippingAddress")
                if isinstance(ship, dict) and ship:
                    ship_by_id[str(row.get("_id"))] = ship
        except Exception:
            ship_by_id = {}

    def _ship_field(ship: dict, *keys: str) -> str:
        for key in keys:
            val = ship.get(key)
            if val is not None and str(val).strip():
                return str(val).strip()
        return ""

    def _enrich_customer(user: User) -> dict:
        data = user_public(user, stats=stats_by_id.get(str(user.id)))
        ship = ship_by_id.get(str(user.id)) or {}
        if not ship:
            # Fall back to address phone when top-level phone is empty.
            if not data.get("phone"):
                for addr in data.get("addresses") or []:
                    phone = str((addr or {}).get("phone") or "").strip()
                    if phone:
                        data["phone"] = phone
                        break
            return data

        if not data.get("phone"):
            data["phone"] = _ship_field(ship, "phone", "contact", "mobile") or None

        addresses = list(data.get("addresses") or [])
        primary = next((a for a in addresses if a.get("isDefault")), None) or (
            addresses[0] if addresses else None
        )
        city = (primary or {}).get("city") if primary else ""
        state = (primary or {}).get("state") if primary else ""
        pin = (
            (primary or {}).get("pincode")
            or (primary or {}).get("postalCode")
            or (primary or {}).get("zipCode")
            if primary
            else ""
        )
        needs_location = not (str(city or "").strip() and str(state or "").strip())
        needs_pin = not str(pin or "").strip()
        if needs_location or needs_pin or not addresses:
            filled = {
                "name": _ship_field(ship, "name") or data.get("name") or "",
                "phone": _ship_field(ship, "phone", "contact", "mobile") or data.get("phone") or "",
                "house": _ship_field(ship, "house", "street", "address", "line1"),
                "city": _ship_field(ship, "city") or str(city or ""),
                "state": _ship_field(ship, "state") or str(state or ""),
                "pincode": _ship_field(ship, "pincode", "postalCode", "zipCode", "zipcode")
                or str(pin or ""),
                "country": _ship_field(ship, "country") or "India",
                "isDefault": True,
            }
            if primary:
                # Overlay missing fields onto existing primary address for the response.
                merged = {**primary}
                for key, value in filled.items():
                    if key == "isDefault":
                        merged[key] = True
                        continue
                    if not str(merged.get(key) or "").strip() and value:
                        merged[key] = value
                data["addresses"] = [merged] + [a for a in addresses if a is not primary]
            else:
                data["addresses"] = [filled]
        return data

    return [_enrich_customer(u) for u in users]


@router.post("/users", status_code=201)
async def admin_create_customer(body: dict, _: CustomersWriter):
    """Create a storefront customer (not an admin). Used from Customers page only."""
    first_name = str(body.get("firstName") or "").strip()
    last_name = str(body.get("lastName") or "").strip()
    name = str(body.get("name") or "").strip() or f"{first_name} {last_name}".strip()
    phone = str(body.get("phone") or "").strip()
    email_raw = str(body.get("email") or "").strip().lower()
    email = email_raw or None

    if not name:
        raise HTTPException(status_code=400, detail="Customer name is required")
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        phone = digits
    elif len(digits) == 12 and digits.startswith("91"):
        phone = digits[-10:]
    else:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit phone number")

    if await User.find_one(User.phone == phone):
        raise HTTPException(status_code=400, detail="A customer with this phone already exists")
    if email:
        existing_email = await User.find_one(User.email == email)
        if existing_email:
            raise HTTPException(status_code=400, detail="A customer with this email already exists")

    addresses = []
    addr = body.get("address") if isinstance(body.get("address"), dict) else None
    street = str((addr or {}).get("street") or (addr or {}).get("house") or body.get("address") or "").strip()
    if isinstance(body.get("address"), str):
        street = body.get("address").strip()
    city = str((addr or {}).get("city") or body.get("city") or "").strip()
    state = str((addr or {}).get("state") or body.get("state") or "").strip()
    pincode = str(
        (addr or {}).get("pincode") or (addr or {}).get("zipCode") or body.get("pincode") or ""
    ).strip()
    if street or city or state or pincode:
        addresses.append(
            Address(
                name=name,
                phone=phone,
                house=street,
                city=city,
                state=state,
                pincode=pincode,
                country="India",
                isDefault=True,
            )
        )

    if not first_name and name:
        parts = name.split()
        first_name = parts[0]
        last_name = last_name or (" ".join(parts[1:]) if len(parts) > 1 else "")

    user = User(
        name=name,
        firstName=first_name or None,
        lastName=last_name or None,
        phone=phone,
        email=email,
        isAdmin=False,
        addresses=addresses,
        emailSubscribed=bool(body.get("emailSubscribed", True)),
        whatsappSubscribed=bool(body.get("whatsappSubscribed", True)),
    )
    from app.services.customer_url_id import next_customer_url_id

    user.customerUrlId = await next_customer_url_id()
    await user.insert()
    return user_public(user)


@router.get("/users/{user_id}")
async def admin_user(user_id: str, _: CustomersReader):
    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_public(user)


@router.get("/users/{user_id}/orders")
async def admin_user_orders(user_id: str, _: OrdersReader):
    orders = await Order.find(Order.customerId == ObjectId(user_id)).to_list()
    return await enrich_orders(orders)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, actor: RoleManager):
    user = await User.get(ObjectId(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.isAdmin or (getattr(user, "roleId", None) and str(user.roleId).strip()):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete Admin or Staff accounts from Customers",
        )
    if str(user.id) == str(actor.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await user.delete()
    return {"message": "User removed"}


@router.post("/upload/image")
async def upload_image(
    _: AdminUser,
    file: UploadFile | None = File(default=None),
    image: UploadFile | None = File(default=None),
):
    from app.services import image_optimize as img_opt
    from app.services import r2 as r2_svc

    upload = file or image
    if not upload:
        raise HTTPException(status_code=422, detail="file or image is required")
    content = await upload.read()
    webp_bytes, webp_name, content_type = img_opt.optimize_image_to_webp(
        content,
        filename=upload.filename,
    )
    if r2_svc.is_configured():
        result = r2_svc.upload_bytes(
            folder="products",
            data=webp_bytes,
            filename=webp_name,
            content_type=content_type,
        )
        return {
            "url": result["url"],
            "name": result.get("name"),
            "size": result.get("size") or len(webp_bytes),
            "contentType": content_type,
            "optimized": True,
            "format": "webp",
        }
    name = r2_svc.safe_storage_name(webp_name, default_ext=".webp")
    dest = UPLOAD_DIR / name
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(webp_bytes)
    return {
        "url": f"/uploads/products/{name}",
        "name": name,
        "size": len(webp_bytes),
        "contentType": content_type,
        "optimized": True,
        "format": "webp",
    }


@router.get("/products")
async def admin_products(
    _: AdminUser,
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=200),
    category: str | None = Query(default=None),
):
    from app.services.pagination import parse_pagination
    from app.services.product_url_id import ensure_product_url_id

    sk, lim, _pg = parse_pagination(page=page, skip=skip, limit=limit)
    query: dict[str, Any] = {}
    cat = (category or "").strip()
    if cat:
        # Products store category as name or id string — accept either.
        matches = [cat]
        if ObjectId.is_valid(cat):
            matches.append(cat)
            cat_doc = await Category.get(ObjectId(cat))
            if cat_doc and getattr(cat_doc, "name", None):
                matches.append(str(cat_doc.name))
        query["category"] = {"$in": list(dict.fromkeys(matches))}

    cursor = Product.find(query).sort([("createdAt", -1)]).skip(sk).limit(lim)
    products = await cursor.to_list()
    out = []
    for product in products:
        try:
            await ensure_product_url_id(product)
        except Exception:
            pass
        out.append(doc_to_dict(product))
    return out


def _normalize_product_payload(data: dict) -> dict:
    """Map legacy subcategory → type for product create/update bodies."""
    out = dict(data)
    if "type" not in out and "subcategory" in out:
        out["type"] = out.get("subcategory")
    out.pop("subcategory", None)
    # Never allow clients to set / overwrite the public URL id directly
    out.pop("productUrlId", None)
    if "pricing" in out and out["pricing"] is not None:
        out["pricing"] = _normalize_pricing(out["pricing"])
    return out


_PRICE_RE = re.compile(r"^\d+(\.\d{1,2})?$")


def _parse_price_value(value: Any, *, field: str) -> float | None:
    """Accept digits with optional up to 2 decimal places; reject everything else."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail=f"{field} must be a number")
    if isinstance(value, (int, float)):
        if value < 0 or value != value:  # NaN
            raise HTTPException(status_code=400, detail=f"{field} must be a non-negative number")
        return round(float(value), 2)
    s = str(value).strip()
    if not s:
        return None
    if not _PRICE_RE.match(s):
        raise HTTPException(
            status_code=400,
            detail=f"{field} must contain digits only (optional .xx)",
        )
    return round(float(s), 2)


def _normalize_pricing(pricing: Any) -> dict:
    if not isinstance(pricing, dict):
        raise HTTPException(status_code=400, detail="pricing must be an object")
    out: dict[str, float | None] = {}
    for key in ("buyingPrice", "mrp", "sellingPrice", "offerPrice"):
        if key not in pricing:
            continue
        parsed = _parse_price_value(pricing.get(key), field=key)
        if parsed is not None or key in pricing:
            out[key] = parsed
    return out


PRODUCT_COLORS_KEY = "product_colors"


def _normalize_color_name(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


async def _load_product_colors() -> list[str]:
    s = await Setting.find_one(Setting.key == PRODUCT_COLORS_KEY)
    raw = []
    if s and isinstance(s.value, dict):
        raw = s.value.get("colors") or []
    elif s and isinstance(s.value, list):
        raw = s.value
    colors: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = _normalize_color_name(item)
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        colors.append(name)
    return colors


async def _save_product_colors(colors: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in colors:
        name = _normalize_color_name(item)
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        cleaned.append(name)
    cleaned.sort(key=lambda c: c.lower())
    s = await Setting.find_one(Setting.key == PRODUCT_COLORS_KEY)
    if not s:
        s = Setting(key=PRODUCT_COLORS_KEY, value={"colors": cleaned})
        await s.insert()
    else:
        s.value = {"colors": cleaned}
        await s.save()
    return cleaned


async def _ensure_product_colors(values: Any) -> list[str]:
    names: list[str] = []
    if isinstance(values, list):
        names = values
    elif values:
        names = [values]
    colors = await _load_product_colors()
    changed = False
    for value in names:
        name = _normalize_color_name(value)
        if not name:
            continue
        if any(c.lower() == name.lower() for c in colors):
            continue
        colors.append(name)
        changed = True
    if changed:
        return await _save_product_colors(colors)
    return colors


async def _ensure_product_color(value: Any) -> list[str]:
    return await _ensure_product_colors([value] if value else [])


@router.post("/products", status_code=201)
async def admin_create_product(body: dict, _: AdminUser):
    from app.services.product_url_id import ensure_product_url_id

    data = _normalize_product_payload({k: v for k, v in body.items() if k not in ("_id", "id")})
    if "hsnCode" in data:
        data["hsnCode"] = _validate_hsn(data.get("hsnCode"))
    if data.get("priceTaxMode") and data["priceTaxMode"] not in ("inclusive", "exclusive"):
        raise HTTPException(status_code=400, detail="priceTaxMode must be inclusive or exclusive")
    product = Product(**data)
    await product.insert()
    try:
        await ensure_product_url_id(product)
    except Exception:
        pass
    try:
        await _ensure_product_colors(
            getattr(product, "colors", None) or getattr(product, "color", None)
        )
    except Exception:
        pass
    return doc_to_dict(product)


@router.get("/products/{product_id}")
async def admin_get_product(product_id: str, _: AdminUser):
    from app.services.product_resolve import resolve_product
    from app.services.product_url_id import ensure_product_url_id

    product = await resolve_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        await ensure_product_url_id(product)
    except Exception:
        pass
    return doc_to_dict(product)


@router.get("/products/{product_id}/neighbors")
async def admin_product_neighbors(product_id: str, _: AdminUser):
    """Previous (newer) / next (older) product for detail-page ↑ ↓ navigation."""
    from app.services.product_resolve import resolve_product
    from app.services.product_url_id import ensure_product_url_id

    product = await resolve_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        await ensure_product_url_id(product)
    except Exception:
        pass

    created = product.createdAt or datetime.utcnow()
    col = Product.get_pymongo_collection()

    newer = await col.find_one(
        {
            "$or": [
                {"createdAt": {"$gt": created}},
                {"createdAt": created, "_id": {"$gt": product.id}},
            ],
        },
        sort=[("createdAt", 1), ("_id", 1)],
    )
    older = await col.find_one(
        {
            "$or": [
                {"createdAt": {"$lt": created}},
                {"createdAt": created, "_id": {"$lt": product.id}},
            ],
        },
        sort=[("createdAt", -1), ("_id", -1)],
    )

    def _nav(doc: dict | None) -> dict | None:
        if not doc:
            return None
        url_id = doc.get("productUrlId")
        oid = str(doc.get("_id"))
        return {
            "_id": oid,
            "productUrlId": str(url_id) if url_id is not None else None,
            "productName": doc.get("productName") or doc.get("name"),
            "key": str(url_id).strip() if url_id not in (None, "") else oid,
        }

    return {"previous": _nav(newer), "next": _nav(older)}


@router.put("/products/{product_id}")
async def admin_update_product(product_id: str, body: dict, _: AdminUser):
    from app.services.product_resolve import resolve_product

    product = await resolve_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in _normalize_product_payload(body).items():
        if k in ("_id", "id"):
            continue
        if k == "hsnCode":
            v = _validate_hsn(v)
        if k == "priceTaxMode" and v and v not in ("inclusive", "exclusive"):
            raise HTTPException(status_code=400, detail="priceTaxMode must be inclusive or exclusive")
        setattr(product, k, v)
    product.updatedAt = datetime.utcnow()
    await product.save()
    try:
        await _ensure_product_colors(
            getattr(product, "colors", None) or getattr(product, "color", None)
        )
    except Exception:
        pass
    return doc_to_dict(product)


@router.delete("/products/{product_id}")
async def admin_delete_product(product_id: str, _: AdminUser):
    from app.services.product_resolve import resolve_product

    product = await resolve_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    await product.delete()
    return {"message": "Product removed"}


@router.patch("/products/bulk-update")
async def bulk_products(body: dict, _: AdminUser):
    products = body.get("products") or []
    if products:
        count = 0
        for entry in products:
            product_id = str(entry.get("productId") or "").strip()
            if not product_id:
                continue
            product = await Product.find_one(Product.productId == product_id)
            if not product and ObjectId.is_valid(product_id):
                product = await Product.get(ObjectId(product_id))
            if not product:
                continue

            pricing = entry.get("pricing")
            if isinstance(pricing, dict):
                pricing_update = _normalize_pricing(pricing)
                pricing_update = {
                    key: value
                    for key, value in pricing_update.items()
                    if key in {"buyingPrice", "mrp", "sellingPrice", "offerPrice"}
                    and value is not None
                }
                if pricing_update:
                    product.pricing = (
                        product.pricing.model_copy(update=pricing_update)
                        if product.pricing
                        else Pricing(**pricing_update)
                    )
            if "status" in entry:
                product.status = entry["status"]

            for variant_data in entry.get("variants") or []:
                color = str(variant_data.get("color") or "")
                variant = next((item for item in product.variants if item.color == color), None)
                if not variant:
                    variant = Variant(color=color)
                    product.variants.append(variant)
                if "quantity" in variant_data:
                    try:
                        variant.quantity = int(variant_data["quantity"] or 0)
                    except (TypeError, ValueError):
                        pass
                if "sku" in variant_data:
                    variant.sku = variant_data["sku"] or None

            if product.variants:
                product.totalStock = sum(int(v.quantity or 0) for v in product.variants)

            product.updatedAt = datetime.utcnow()
            await product.save()
            count += 1
        return {"updated": count}

    ids = body.get("ids") or []
    updates = body.get("updates") or {}
    count = 0
    for pid in ids:
        product = await Product.get(ObjectId(pid))
        if not product:
            continue
        for k, v in updates.items():
            setattr(product, k, v)
        await product.save()
        count += 1
    return {"updated": count}


@router.post("/products/import")
async def import_products(_: AdminUser, file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required")
    try:
        content = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc

    created = 0
    skipped = 0
    errors: list[str] = []
    for row_number, row in enumerate(csv.DictReader(StringIO(content)), start=2):
        values = {
            re.sub(r"[\s_-]", "", (key or "").strip().lower()): (value or "").strip()
            for key, value in row.items()
        }
        name = values.get("productname") or values.get("name")
        if not name:
            skipped += 1
            errors.append(f"Row {row_number}: productName or name is required")
            continue
        try:
            price = float(values.get("sellingprice") or values.get("price") or 0)
            quantity = int(values.get("quantity") or 0)
        except ValueError:
            skipped += 1
            errors.append(f"Row {row_number}: price and quantity must be numbers")
            continue
        sku = values.get("sku") or None
        product = Product(
            productName=name,
            pricing=Pricing(sellingPrice=price, mrp=price),
            variants=[Variant(sku=sku, quantity=quantity)] if sku or quantity else [],
            totalStock=quantity,
        )
        await product.insert()
        try:
            from app.services.product_url_id import ensure_product_url_id

            await ensure_product_url_id(product)
        except Exception:
            pass
        created += 1
    return {"created": created, "skipped": skipped, "errors": errors}


def _empty_awb_clause() -> dict[str, Any]:
    return {
        "$and": [
            {"$or": [{"awb": {"$in": [None, ""]}}, {"awb": {"$exists": False}}]},
            {"$or": [{"awbCode": {"$in": [None, ""]}}, {"awbCode": {"$exists": False}}]},
        ]
    }


def _exclude_incomplete_checkout_clause() -> dict[str, Any]:
    """Hide Razorpay checkouts that never paid (still 'Payment Pending').

    These rows are created before payment for stock hold; they belong under
    Abandoned carts (and Unpaid until marked abandoned), not the main Orders list.
    """
    return {
        "$or": [
            {
                "paymentStatus": {
                    "$in": [
                        "paid",
                        "Paid",
                        "PAID",
                        "pay_on_delivery",
                        "partially_refunded",
                        "refunded",
                    ]
                }
            },
            {
                "shippingStatus": {
                    "$not": {"$regex": r"^payment pending$", "$options": "i"},
                }
            },
            {"shippingStatus": {"$in": [None, ""]}},
            {"shippingStatus": {"$exists": False}},
        ]
    }


def _apply_order_view_filters(
    query: dict[str, Any],
    *,
    view: str | None,
    hide_archived: bool,
) -> dict[str, Any]:
    """Best-effort Mongo filters matching admin Orders toolbar views."""
    view_key = (view or "all").strip().lower()
    extras: list[dict[str, Any]] = []

    if view_key == "unpaid":
        extras.append(
            {
                "$or": [
                    {"paymentStatus": {"$nin": ["paid", "Paid", "PAID", "pay_on_delivery"]}},
                    {"paymentStatus": {"$exists": False}},
                    {"paymentStatus": None},
                    {"paymentStatus": ""},
                ]
            }
        )
    elif view_key == "unfulfilled":
        extras.append(_empty_awb_clause())
        extras.append(
            {
                "status": {
                    "$nin": [
                        "cancelled",
                        "canceled",
                        "delivered",
                        "returned",
                        "return",
                    ]
                }
            }
        )
        extras.append(_exclude_incomplete_checkout_clause())
    elif view_key == "archived":
        extras.append(
            {
                "$or": [
                    {"archived": True},
                    {
                        "status": {
                            "$regex": r"^(cancelled|canceled|delivered|returned|return)",
                            "$options": "i",
                        }
                    },
                ]
            }
        )
    elif view_key == "open":
        extras.append({"archived": {"$ne": True}})
        extras.append(
            {
                "status": {
                    "$nin": [
                        "cancelled",
                        "canceled",
                        "delivered",
                        "returned",
                        "return",
                        "draft",
                        "abandoned",
                    ]
                }
            }
        )
        extras.append(_exclude_incomplete_checkout_clause())
    else:
        # Default "all" — still hide unpaid payment-exit rows from the main table.
        extras.append(_exclude_incomplete_checkout_clause())

    if hide_archived and view_key != "archived":
        extras.append({"archived": {"$ne": True}})
        extras.append(
            {
                "status": {
                    "$nin": [
                        "cancelled",
                        "canceled",
                        "delivered",
                        "returned",
                        "return",
                        "draft",
                        "abandoned",
                    ]
                }
            }
        )

    if not extras:
        return query
    if "$and" in query:
        query["$and"] = list(query["$and"]) + extras
    else:
        query["$and"] = extras
    return query


@router.get("/orders")
async def admin_orders(
    _: OrdersReader,
    status: str | None = None,
    scope: str | None = None,
    shippingStatus: str | None = None,
    q: str | None = None,
    view: str | None = None,
    datePreset: str | None = None,
    hideArchived: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    from app.services.pagination import date_preset_filter, page_payload, parse_pagination

    sk, lim, pg = parse_pagination(page=page, skip=skip, limit=limit)
    query: dict[str, Any] = {}
    if status == "abandoned":
        # Abandoned carts: explicit abandoned status + unpaid payment-exit rows
        # that have not been marked yet (Payment Pending / pending).
        query["$or"] = [
            {"status": "abandoned"},
            {
                "status": {"$in": ["order placed", "draft"]},
                "paymentStatus": {
                    "$nin": [
                        "paid",
                        "Paid",
                        "PAID",
                        "pay_on_delivery",
                        "refunded",
                        "partially_refunded",
                        "refund_pending",
                    ]
                },
                "shippingStatus": {"$regex": r"^payment pending$", "$options": "i"},
            },
        ]
    else:
        query["status"] = {"$nin": ["draft", "abandoned"]}
        if status:
            query["status"] = status
        if scope == "shipment":
            if shippingStatus:
                query["shippingStatus"] = {
                    "$regex": f"^{re.escape(shippingStatus.strip())}$",
                    "$options": "i",
                }
            else:
                query["$or"] = [
                    {"shippingStatus": {"$exists": True, "$nin": [None, ""]}},
                    {"awb": {"$exists": True, "$nin": [None, ""]}},
                    {"awbCode": {"$exists": True, "$nin": [None, ""]}},
                ]
        else:
            if shippingStatus:
                query["shippingStatus"] = {
                    "$regex": f"^{re.escape(shippingStatus.strip())}$",
                    "$options": "i",
                }
            query = _apply_order_view_filters(
                query, view=view, hide_archived=hideArchived
            )

    date_filter = date_preset_filter(datePreset, field="createdAt")
    if date_filter:
        query.update(date_filter)

    needle = (q or "").strip()
    # Shopify-style: customer_id:"12digitUrlId" or customer_id:"24hexObjectId"
    customer_id_match = (
        re.match(
            r'^\s*customer_id\s*:\s*"?([a-fA-F0-9]{24}|\d{12})"?\s*$',
            needle,
            flags=re.I,
        )
        if needle
        else None
    )
    if customer_id_match:
        raw_cid = customer_id_match.group(1)
        resolved_oid = None
        if len(raw_cid) == 12 and raw_cid.isdigit():
            matched_user = await User.find_one(User.customerUrlId == raw_cid)
            if matched_user:
                resolved_oid = matched_user.id
        elif ObjectId.is_valid(raw_cid):
            resolved_oid = ObjectId(raw_cid)
        if resolved_oid is None:
            return page_payload([], total=0, page=pg, limit=lim)
        query["customerId"] = resolved_oid
        needle = ""

    if needle:
        ql = needle.lower()
        digits = re.sub(r"\D+", "", needle)
        user_ids: set[str] = set()
        user_query: dict[str, Any] = {
            "$or": [
                {"name": {"$regex": re.escape(needle), "$options": "i"}},
                {"email": {"$regex": re.escape(needle), "$options": "i"}},
                {"phone": {"$regex": re.escape(needle), "$options": "i"}},
            ]
        }
        async for user in User.find(user_query).limit(100):
            user_ids.add(str(user.id))

        # Wider window for text search, then page (capped)
        search_pool = await Order.find(query).sort([("createdAt", -1)]).limit(500).to_list()
        filtered = []
        for o in search_pool:
            addr = o.shippingAddress or {}
            hay = " ".join(
                str(x or "").lower()
                for x in (
                    o.orderNumber,
                    o.id,
                    o.awb,
                    getattr(o, "awbCode", None),
                    addr.get("name"),
                    addr.get("phone"),
                    addr.get("contact"),
                    addr.get("email"),
                )
            )
            phone_blob = re.sub(
                r"\D+",
                "",
                str(addr.get("phone") or addr.get("contact") or ""),
            )
            match = (
                ql in hay
                or (digits and digits in phone_blob)
                or (o.customerId and str(o.customerId) in user_ids)
                or (ObjectId.is_valid(needle) and str(o.id) == needle)
            )
            if match:
                filtered.append(o)
        total = len(filtered)
        orders = filtered[sk : sk + lim]
        return page_payload(await enrich_orders(orders), total=total, page=pg, limit=lim)

    total = await Order.find(query).count()
    orders = await Order.find(query).sort([("createdAt", -1)]).skip(sk).limit(lim).to_list()
    return page_payload(await enrich_orders(orders), total=total, page=pg, limit=lim)


@router.get("/orders/counts")
async def admin_order_counts(_: OrdersReader):
    """Lightweight badge counts for admin nav (Shopify-style unfulfilled)."""
    query: dict[str, Any] = {"status": {"$nin": ["draft", "abandoned"]}}
    query = _apply_order_view_filters(query, view="unfulfilled", hide_archived=True)
    unfulfilled = await Order.find(query).count()
    return {"unfulfilled": int(unfulfilled or 0)}


async def _build_order_items(raw_items: list) -> tuple[list[OrderItem], float]:
    items: list[OrderItem] = []
    subtotal = 0.0
    for raw in raw_items or []:
        pid = raw.get("productId") or raw.get("product")
        product = None
        if pid and ObjectId.is_valid(str(pid)):
            product = await Product.get(ObjectId(str(pid)))
        if not product:
            raise HTTPException(status_code=404, detail=f"Product not found: {pid}")
        qty = int(raw.get("quantity") or raw.get("qty") or 1)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="Item quantity must be positive")
        color = raw.get("color") or ""
        size = raw.get("size") or ""
        correct = 0.0
        if product.pricing:
            correct = float(product.pricing.sellingPrice or 0)
        if correct <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Product has no sellable price: {product.productName or product.name or pid}",
            )
        price = correct
        item = OrderItem(
            productId=product.id,
            color=color,
            size=size,
            quantity=qty,
            price=price,
        )
        items.append(item)
        subtotal += price * qty
    return items, subtotal


@router.post("/orders", status_code=201)
async def admin_create_order(body: dict, admin: OrdersWriter):
    raw_items = body.get("items") or body.get("orderItems") or []
    items, subtotal = await _build_order_items(raw_items)
    delivery = float(body.get("deliveryAmount") or body.get("shippingPrice") or 0)
    discount = float(body.get("discount") or body.get("discountAmount") or 0)
    final_price = max(0.0, subtotal + delivery - discount)

    customer_id = body.get("customerId")
    if not customer_id or not ObjectId.is_valid(str(customer_id)):
        raise HTTPException(
            status_code=400,
            detail="Select an existing customer. Create customers from the Customers page.",
        )
    customer = await User.get(ObjectId(str(customer_id)))
    if not customer or customer.isAdmin:
        raise HTTPException(status_code=400, detail="Invalid customer")
    customer_oid = customer.id

    shipping = body.get("shippingAddress") or {}
    details = body.get("customerDetails") or {}
    if not details:
        details = {
            "name": customer.name,
            "phone": customer.phone or "",
            "email": customer.email or "",
        }
    if details and not shipping.get("name"):
        shipping = {
            **shipping,
            "name": details.get("name") or customer.name or shipping.get("name"),
            "phone": details.get("phone") or customer.phone or shipping.get("phone"),
            "street": details.get("address") or shipping.get("street") or shipping.get("address"),
            "city": details.get("city") or shipping.get("city"),
            "state": details.get("state") or shipping.get("state"),
            "zipCode": details.get("pincode") or shipping.get("zipCode") or shipping.get("pincode"),
            "country": shipping.get("country") or "India",
        }
    # Prefer customer identity on shipping when blank
    shipping.setdefault("name", customer.name)
    if not shipping.get("phone") and customer.phone:
        shipping["phone"] = customer.phone

    payment = str(body.get("paymentMethod") or "razorpay").lower()
    if payment in {"prepaid"}:
        payment = "razorpay"
    await ensure_payment_method_enabled(payment)

    from app.routers.orders import _next_order_number, _next_order_url_id

    order = Order(
        customerId=customer_oid,
        items=items,
        shippingAddress=shipping,
        status="order placed",
        total=subtotal,
        discount=discount,
        discountAmount=discount,
        finalPrice=final_price,
        deliveryAmount=delivery,
        paymentMethod=payment,
        paymentStatus="pending",
        orderNumber=await _next_order_number(),
        orderUrlId=await _next_order_url_id(),
        transactionDetails={
            "paymentMethod": payment,
            "paymentStatus": "pending",
            "customerDetails": details or None,
        },
    )

    from app.services.dtdc_est_cost import apply_dtdc_est_cost

    apply_dtdc_est_cost(order)
    await order.insert()

    if items:
        try:
            await reserve_order_stock(order)
        except Exception:
            await order.delete()
            raise

    if items and order.paymentStatus == "paid":
        await apply_order_commitments(order)
        try:
            await erp_ops.ensure_order_invoice(order, actor=admin)
        except Exception:
            pass

    return (await enrich_orders([order]))[0]


@router.get("/orders/{order_id}")
async def admin_order(order_id: str, _: OrdersReader):
    from app.services.order_resolve import resolve_order
    from app.services import payment_instrument as pay_instrument

    order = await resolve_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        await pay_instrument.ensure_order_instrument(order)
    except Exception:
        pass
    return (await enrich_orders([order]))[0]


@router.get("/orders/{order_id}/neighbors")
async def admin_order_neighbors(order_id: str, _: OrdersReader):
    """Previous (newer) / next (older) order for detail-page ↑ ↓ navigation."""
    from app.services.order_resolve import resolve_order

    order = await resolve_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    created = order.createdAt or datetime.utcnow()
    base = {"status": {"$nin": ["draft", "abandoned"]}}
    col = Order.get_pymongo_collection()

    # Newer = previous in newest-first list (↑)
    newer = await col.find_one(
        {
            **base,
            "$or": [
                {"createdAt": {"$gt": created}},
                {"createdAt": created, "_id": {"$gt": order.id}},
            ],
        },
        sort=[("createdAt", 1), ("_id", 1)],
    )
    # Older = next in newest-first list (↓)
    older = await col.find_one(
        {
            **base,
            "$or": [
                {"createdAt": {"$lt": created}},
                {"createdAt": created, "_id": {"$lt": order.id}},
            ],
        },
        sort=[("createdAt", -1), ("_id", -1)],
    )

    def _nav(doc: dict | None) -> dict | None:
        if not doc:
            return None
        url_id = doc.get("orderUrlId")
        oid = str(doc.get("_id"))
        return {
            "_id": oid,
            "orderNumber": doc.get("orderNumber"),
            "orderUrlId": str(url_id) if url_id is not None else None,
            "key": str(url_id).strip() if url_id not in (None, "") else oid,
        }

    return {"previous": _nav(newer), "next": _nav(older)}


@router.patch("/orders/bulk-update")
async def bulk_orders(body: dict, _: OrdersWriter):
    from app.services.fulfillment import apply_shipping_status_from_order_status

    ids = body.get("ids") or body.get("orderIds") or []
    status_val = body.get("status")
    count = 0
    for oid in ids:
        order = await Order.get(ObjectId(oid))
        if order and status_val:
            order.status = status_val
            apply_shipping_status_from_order_status(order, status_val)
            await order.save()
            try:
                await erp_ops.ensure_invoice_on_fulfillment(order, context=f"bulk_status:{status_val}")
            except Exception:
                pass
            count += 1
    return {"updated": count}


@router.patch("/orders/{order_id}/status")
async def order_status(order_id: str, body: dict, _: OrdersWriter):
    from app.services.fulfillment import apply_shipping_status_from_order_status

    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    prev_status = (order.status or "").lower()
    if "status" in body:
        order.status = body["status"]
        apply_shipping_status_from_order_status(order, body["status"])
    await order.save()
    new_status = (order.status or "").lower()
    try:
        await erp_ops.ensure_invoice_on_fulfillment(order, context=f"admin_status:{new_status}")
    except Exception:
        pass
    if new_status == "cancelled" and prev_status != "cancelled":
        try:
            from app.services.stock import restock_order_stock

            await restock_order_stock(order)
        except Exception as exc:
            print(f"[Admin] Stock restore on cancel failed for {order.id}: {exc}")
    if new_status == "delivered" and prev_status != "delivered":
        try:
            from app.services import aisensy as aisensy_svc
            from app.services import email_resend as email_svc

            user = await User.get(order.customerId) if order.customerId else None
            await aisensy_svc.notify_order_event_once("orderDelivered", order, user)
            await email_svc.notify_order_email_once("DELIVERED", order, user)
        except Exception as exc:
            print(f"[Notify] admin delivered: {exc}")
    if new_status == "shipped" and prev_status != "shipped":
        try:
            from app.services import aisensy as aisensy_svc
            from app.services import email_resend as email_svc

            user = await User.get(order.customerId) if order.customerId else None
            await aisensy_svc.notify_order_event_once("orderShipped", order, user)
            await email_svc.notify_order_email_once("SHIPPED", order, user)
        except Exception as exc:
            print(f"[Notify] admin shipped: {exc}")
    return remap_order(order)


@router.patch("/orders/{order_id}/archive")
async def order_archive(order_id: str, body: dict, _: OrdersWriter):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.archived = bool(body.get("archived", True))
    order.updatedAt = datetime.utcnow()
    await order.save()
    return remap_order(order)


@router.patch("/orders/{order_id}/return")
async def order_return(order_id: str, body: dict, _: OrdersWriter):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    action = str(body.get("action") or "").lower()
    if action not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    order.status = "returned" if action == "approve" else "delivered"
    order.updatedAt = datetime.utcnow()
    await order.save()
    if action == "approve":
        try:
            from app.services.stock import restock_order_stock

            await restock_order_stock(order)
        except Exception as exc:
            print(f"[Admin] Stock restore on return failed for {order.id}: {exc}")
    return (await enrich_orders([order]))[0]


@router.patch("/orders/{order_id}/delivery-date")
async def order_delivery_date(order_id: str, body: dict, _: OrdersWriter):
    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    value = body.get("deliveryDate")
    if not value:
        raise HTTPException(status_code=400, detail="deliveryDate is required")
    try:
        delivery_date = (
            datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if isinstance(value, str)
            else value
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="deliveryDate must be an ISO date") from exc
    if not isinstance(delivery_date, datetime):
        raise HTTPException(status_code=400, detail="deliveryDate must be an ISO date")

    order.deliveryDate = delivery_date
    order.updatedAt = datetime.utcnow()
    await order.save()
    return (await enrich_orders([order]))[0]


@router.patch("/orders/{order_id}/payment-status")
async def order_payment_status(order_id: str, body: dict, _: PaymentsWriter):
    from app.services.stock import ensure_stock_for_payment

    order = await Order.get(ObjectId(order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    next_status = str(body.get("paymentStatus") or order.paymentStatus or "").strip().lower()
    # Manual refunds require Razorpay; do not invent refunded state here.
    allowed = {"pending", "paid", "failed", "pay_on_delivery"}
    if next_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid paymentStatus '{next_status}'. "
                "Allowed: pending, paid, failed, pay_on_delivery. "
                "Refunded statuses require a Razorpay refund."
            ),
        )
    if next_status == "paid":
        await ensure_stock_for_payment(order)
    order.paymentStatus = next_status
    order.transactionDetails = {
        **(order.transactionDetails or {}),
        "paymentStatus": order.paymentStatus,
        "paymentStatusSetBy": "admin",
    }
    order.updatedAt = datetime.utcnow()
    await order.save()
    if next_status == "paid":
        await apply_order_commitments(order)
        try:
            await erp_ops.ensure_order_invoice_safe(order, context="admin_payment_paid")
        except Exception:
            pass
    return (await enrich_orders([order]))[0]


async def _crud_list(model, _: AdminUser):
    return [doc_to_dict(x) for x in await model.find_all().to_list()]


@router.get("/categories")
async def list_categories(_: AdminUser):
    return await _crud_list(Category, _)


@router.post("/categories", status_code=201)
async def create_category(body: dict, _: AdminUser):
    doc = Category(**body)
    await doc.insert()
    return doc_to_dict(doc)


@router.put("/categories/{item_id}")
async def update_category(item_id: str, body: dict, _: AdminUser):
    doc = await Category.get(ObjectId(item_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.items():
        setattr(doc, k, v)
    await doc.save()
    return doc_to_dict(doc)


@router.delete("/categories/{item_id}")
async def delete_category(item_id: str, _: AdminUser):
    doc = await Category.get(ObjectId(item_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await doc.delete()
    return {"message": "removed"}


@router.get("/brands")
async def list_brands(_: AdminUser):
    return await _crud_list(Brand, _)


@router.get("/product-colors")
async def list_product_colors(_: AdminUser):
    """Shared Color dropdown values for product Attributes."""
    colors = await _load_product_colors()
    try:
        used = await Product.distinct("color")
        used_multi = await Product.distinct("colors")
        merged = list(colors)
        for item in list(used or []) + list(used_multi or []):
            name = _normalize_color_name(item)
            if name and not any(c.lower() == name.lower() for c in merged):
                merged.append(name)
        if len(merged) != len(colors):
            colors = await _save_product_colors(merged)
    except Exception:
        pass
    return {"colors": colors}


@router.post("/product-colors", status_code=201)
async def create_product_color(body: dict, _: AdminUser):
    name = _normalize_color_name(body.get("name") or body.get("color"))
    if not name:
        raise HTTPException(status_code=400, detail="Color name is required")
    colors = await _ensure_product_color(name)
    return {"colors": colors, "name": name}


@router.post("/brands", status_code=201)
async def create_brand(body: dict, _: AdminUser):
    doc = Brand(**body)
    await doc.insert()
    return doc_to_dict(doc)


@router.put("/brands/{item_id}")
async def update_brand(item_id: str, body: dict, _: AdminUser):
    doc = await Brand.get(ObjectId(item_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.items():
        setattr(doc, k, v)
    await doc.save()
    return doc_to_dict(doc)


@router.delete("/brands/{item_id}")
async def delete_brand(item_id: str, _: AdminUser):
    doc = await Brand.get(ObjectId(item_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await doc.delete()
    return {"message": "removed"}


_COUPON_UPDATE_FIELDS = frozenset({
    "name",
    "code",
    "kind",
    "discountType",
    "discountValue",
    "minOrderAmount",
    "maxDiscount",
    "usageLimit",
    "expiryDate",
    "status",
    "productIds",
    "buyQuantity",
    "getQuantity",
    "getDiscountPercent",
    "buyProductIds",
    "getProductIds",
})


@router.get("/coupons")
async def list_coupons(_: AdminUser):
    return await _crud_list(Coupon, _)


@router.post("/coupons", status_code=201)
async def create_coupon(body: dict, _: AdminUser):
    payload = {k: v for k, v in (body or {}).items() if k in _COUPON_UPDATE_FIELDS}
    if "code" in payload:
        payload["code"] = str(payload["code"]).upper().strip()
    doc = Coupon(**payload)
    await doc.insert()
    return doc_to_dict(doc)


@router.put("/coupons/{item_id}")
async def update_coupon(item_id: str, body: dict, _: AdminUser):
    doc = await Coupon.get(ObjectId(item_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    # Never accept usedCount or unknown keys (discount abuse / mass assignment).
    payload = {k: v for k, v in (body or {}).items() if k in _COUPON_UPDATE_FIELDS}
    if "code" in payload:
        payload["code"] = str(payload["code"]).upper().strip()
    for k, v in payload.items():
        setattr(doc, k, v)
    await doc.save()
    return doc_to_dict(doc)


@router.delete("/coupons/{item_id}")
async def delete_coupon(item_id: str, _: AdminUser):
    doc = await Coupon.get(ObjectId(item_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await doc.delete()
    return {"message": "removed"}


@router.get("/abandoned-checkouts")
async def abandoned(
    _: AdminUser,
    q: str | None = None,
    status: str | None = None,
    datePreset: str | None = None,
    page: int = Query(default=1, ge=1),
    skip: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    from app.services import cart_recovery
    from app.services.pagination import date_preset_filter, page_payload, parse_pagination

    sk, lim, pg = parse_pagination(page=page, skip=skip, limit=limit)
    query: dict[str, Any] = {}
    status_key = (status or "").strip().lower()
    if status_key and status_key != "all":
        query["status"] = status_key

    date_filter = date_preset_filter(datePreset, field="lastActivityAt")
    if date_filter:
        query.update(date_filter)

    needle = (q or "").strip()
    if needle:
        rx = {"$regex": re.escape(needle), "$options": "i"}
        query["$or"] = [
            {"customerDetails.name": rx},
            {"customerDetails.email": rx},
            {"customerDetails.phone": rx},
        ]
        if ObjectId.is_valid(needle):
            query["$or"].append({"_id": ObjectId(needle)})

    total = await AbandonedCheckout.find(query).count()
    rows = (
        await AbandonedCheckout.find(query)
        .sort([("lastActivityAt", -1)])
        .skip(sk)
        .limit(lim)
        .to_list()
    )

    site = cart_recovery.recovery_site_base()
    try:
        from app.services import aisensy as aisensy_svc

        cfg = await aisensy_svc.get_settings()
        site = str(cfg.get("siteUrl") or site or "").rstrip("/") or site
    except Exception:
        pass

    # Fast list: do not mint/save recovery tokens here — only expose URL when token exists.
    out = [cart_recovery.admin_checkout_dict(r, site=site) for r in rows]
    return page_payload(out, total=total, page=pg, limit=lim)


@router.get("/abandoned-checkouts/{checkout_id}/recovery-link")
async def abandoned_recovery_link(checkout_id: str, _: AdminUser):
    """Mint (if needed) and return a shareable recovery URL for one checkout."""
    from app.services import cart_recovery

    if not ObjectId.is_valid(checkout_id):
        raise HTTPException(status_code=400, detail="Invalid checkout id")
    checkout = await AbandonedCheckout.get(ObjectId(checkout_id))
    if not checkout:
        raise HTTPException(status_code=404, detail="Abandoned checkout not found")

    before = checkout.recoveryToken
    await cart_recovery.ensure_recovery_token(checkout)
    if checkout.recoveryToken != before:
        await checkout.save()

    site = cart_recovery.recovery_site_base()
    try:
        from app.services import aisensy as aisensy_svc

        cfg = await aisensy_svc.get_settings()
        site = str(cfg.get("siteUrl") or site or "").rstrip("/") or site
    except Exception:
        pass

    url = cart_recovery.recovery_cart_url(checkout, site=site)
    if not url:
        raise HTTPException(status_code=500, detail="Could not build recovery URL")
    return {"recoveryUrl": url, "checkoutId": str(checkout.id)}


@router.get("/abandoned-checkouts/{checkout_id}")
async def abandoned_checkout_detail(checkout_id: str, _: AdminUser):
    from app.services import cart_recovery

    if not ObjectId.is_valid(checkout_id):
        raise HTTPException(status_code=400, detail="Invalid checkout id")
    checkout = await AbandonedCheckout.get(ObjectId(checkout_id))
    if not checkout:
        raise HTTPException(status_code=404, detail="Abandoned checkout not found")

    site = cart_recovery.recovery_site_base()
    try:
        from app.services import aisensy as aisensy_svc

        cfg = await aisensy_svc.get_settings()
        site = str(cfg.get("siteUrl") or site or "").rstrip("/") or site
    except Exception:
        pass
    return cart_recovery.admin_checkout_dict(checkout, site=site)


@router.get("/aisensy/settings")
async def aisensy_settings(_: AdminUser):
    from app.services import aisensy as aisensy_svc

    return aisensy_svc.public_settings(await aisensy_svc.get_settings())


@router.put("/aisensy/settings")
async def save_aisensy_settings(body: dict, _: AdminUser):
    from app.services import aisensy as aisensy_svc

    if any(str(body.get(k) or "").strip() for k in ("apiKey", "projectApiKey")):
        raise HTTPException(
            status_code=400,
            detail="AiSensy keys are configured via AISENSY_API_KEY / AISENSY_PROJECT_API_KEY in the API environment.",
        )
    return await aisensy_svc.save_prefs(body or {})


@router.get("/ga4/report")
async def ga4_report(
    _: AdminUser,
    range_: Literal["7d", "30d", "90d", "365d"] = Query("30d", alias="range"),
):
    from app.services import ga4 as ga4_svc

    return ga4_svc.fetch_report(range_)


def _ai_media_config() -> tuple[str, str, str]:
    """Return (api_key, model, provider) from server env. OpenRouter only."""
    settings = get_settings()
    openrouter_key = str(settings.openrouter_api_key or "").strip()
    model = str(settings.openrouter_model or "google/gemini-3-pro-image").strip()
    return openrouter_key, model or "google/gemini-3-pro-image", "openrouter"


@router.get("/ai-media/status")
async def ai_media_status(_: AdminUser):
    api_key, _, provider = _ai_media_config()
    return {
        "enabled": bool(api_key),
        "provider": provider,
    }


async def _save_upload_temp(upload: UploadFile, folder: Path) -> tuple[str, Path]:
    """Save bytes locally for model processing; prefer R2 URL when configured."""
    from app.services import r2 as r2_svc

    ext = Path(upload.filename or "img.jpg").suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="Invalid image type")
    content = await upload.read()
    if r2_svc.is_configured():
        result = r2_svc.upload_bytes(
            folder=folder.name if folder.name in {"products", "ai"} else "ai",
            data=content,
            filename=upload.filename,
            content_type=upload.content_type,
        )
        name = result["name"]
        dest = folder / name
        dest.write_bytes(content)
        return result["url"], dest
    name = r2_svc.safe_storage_name(upload.filename, default_ext=ext)
    dest = folder / name
    dest.write_bytes(content)
    rel = f"/uploads/{folder.name}/{name}"
    return rel, dest


@router.post("/ai-media/generate", status_code=202)
async def ai_media_generate(
    background_tasks: BackgroundTasks,
    user: AdminUser,
    reference: UploadFile = File(...),
    product_id: str = Form(...),
    front_image_url: str = Form(...),
    back_image_url: str = Form(...),
    _: None = Depends(rate_limit_dependency("ai-media", limit=10)),
):
    from app.services.ai_studio_prompts import compose_studio_prompt

    api_key, model, _provider = _ai_media_config()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI image generation is not configured (set OPENROUTER_API_KEY)",
        )

    # Prompts come only from server env (AI_STUDIO_STYLE_PROMPT / AI_STUDIO_PROMPT)
    final_prompt = compose_studio_prompt()

    if not ObjectId.is_valid(str(product_id)):
        raise HTTPException(status_code=400, detail="Valid product_id is required")
    product = await Product.get(ObjectId(str(product_id)))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    from app.services import ai_media as ai_media_svc

    allowed = set(ai_media_svc.product_image_urls(product))
    front = str(front_image_url or "").strip()
    back = str(back_image_url or "").strip()
    if front not in allowed:
        raise HTTPException(status_code=400, detail="Front image must be an existing product image")
    if back not in allowed:
        raise HTTPException(status_code=400, detail="Back image must be an existing product image")
    if front == back:
        raise HTTPException(status_code=400, detail="Pick different images for front and back")

    ref_url, ref_path = await _save_upload_temp(reference, AI_UPLOAD_DIR)
    product_urls = [front, back]

    job = AiMediaJob(
        prompt=final_prompt,
        referenceUrl=ref_url,
        productImageUrls=product_urls,
        status="pending",
        reviewStatus="pending",
        model=model,
        productId=product.id,
        createdBy=getattr(user, "id", None),
    )
    await job.insert()

    background_tasks.add_task(
        ai_media_svc.run_ai_media_generation,
        job_id=str(job.id),
        reference_path=str(ref_path),
        product_urls=product_urls,
        prompt=final_prompt,
        api_key=api_key,
        model=model,
    )

    return doc_to_dict(job)


@router.get("/ai-media/jobs")
async def ai_media_jobs(_: AdminUser):
    jobs = await AiMediaJob.find_all().sort([("createdAt", -1)]).limit(50).to_list()
    return [doc_to_dict(j) for j in jobs]


@router.get("/ai-media/jobs/{job_id}")
async def ai_media_job(job_id: str, _: AdminUser):
    job = await AiMediaJob.get(ObjectId(job_id)) if ObjectId.is_valid(job_id) else None
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return doc_to_dict(job)


@router.delete("/ai-media/jobs/{job_id}")
async def ai_media_delete_job(job_id: str, _: AdminUser):
    job = await AiMediaJob.get(ObjectId(job_id)) if ObjectId.is_valid(job_id) else None
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    for url in [job.outputUrl, job.referenceUrl, *(job.productImageUrls or [])]:
        if not url or not str(url).startswith("/uploads/ai/"):
            continue
        path = Path(__file__).resolve().parents[2] / str(url).lstrip("/")
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
    await job.delete()
    return {"ok": True}


@router.post("/ai-media/jobs/{job_id}/approve")
async def ai_media_approve_job(job_id: str, body: dict, admin: AdminUser):
    """Copy output to Content (products folder) and attach to product gallery."""
    job = await AiMediaJob.get(ObjectId(job_id)) if ObjectId.is_valid(job_id) else None
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    product_id = str(body.get("productId") or job.productId or "").strip()
    if not product_id or not ObjectId.is_valid(product_id):
        raise HTTPException(status_code=400, detail="Valid productId required")
    product = await Product.get(ObjectId(product_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    from app.services import ai_media as ai_media_svc

    try:
        result = await ai_media_svc.approve_job_to_content(
            job,
            product=product,
            admin_id=admin.id,
            variant_color=str(body.get("variantColor") or "").strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Could not approve AI media job") from exc

    return {
        "ok": True,
        "job": doc_to_dict(result["job"]),
        "product": doc_to_dict(result["product"]),
        "publishedUrl": result["publishedUrl"],
    }


@router.post("/ai-media/jobs/{job_id}/attach-product")
async def ai_media_attach_product(job_id: str, body: dict, admin: AdminUser):
    """Legacy alias — approve to content."""
    return await ai_media_approve_job(job_id, body, admin)


@router.post("/aisensy/sync-customers")
async def aisensy_sync_customers(_: AdminUser):
    from app.services import aisensy as aisensy_svc

    store = await aisensy_svc.get_settings()
    client = aisensy_svc.project_client_from_cfg(store)
    if not client.configured and not store.get("projectApiKey"):
        raise HTTPException(
            status_code=400,
            detail="Set AISENSY_PROJECT_ID and AISENSY_PROJECT_API_KEY in the API environment to sync contacts.",
        )

    users = await User.find({"isAdmin": {"$ne": True}}).to_list()
    imported = 0
    errors = 0
    for u in users:
        phone = getattr(u, "phone", None)
        if not phone:
            continue
        result = await aisensy_svc.create_contact(
            name=u.name or "Customer",
            phone=phone,
            email=getattr(u, "email", None),
            tags=["urban-aana", "customer"],
        )
        if result.get("ok"):
            imported += 1
        elif not result.get("skipped"):
            errors += 1

    s = await Setting.find_one(Setting.key == "aisensy")
    prefs = dict(s.value) if s and isinstance(s.value, dict) else {}
    prefs["lastSyncedAt"] = datetime.utcnow().isoformat()
    prefs["lastSyncCount"] = imported
    # Never persist secrets into DB
    prefs.pop("apiKey", None)
    prefs.pop("projectApiKey", None)
    prefs.pop("projectId", None)
    if s:
        s.value = prefs
        await s.save()
    else:
        await Setting(key="aisensy", value=prefs).insert()

    return {
        **aisensy_svc.public_settings(await aisensy_svc.get_settings()),
        "imported": imported,
        "errors": errors,
    }


@router.post("/aisensy/sync-catalog")
async def aisensy_sync_catalog(_: AdminUser):
    from app.services import aisensy as aisensy_svc

    store = await aisensy_svc.get_settings()
    client = aisensy_svc.project_client_from_cfg(store)
    if not client.configured:
        raise HTTPException(
            status_code=400,
            detail="Set AISENSY_PROJECT_ID and AISENSY_PROJECT_API_KEY to sync the WhatsApp catalog.",
        )
    result = await aisensy_svc.sync_catalog()
    if result.get("skipped"):
        raise HTTPException(status_code=400, detail="Project API is not configured.")
    if result.get("ok") is False and not result.get("created"):
        raise HTTPException(
            status_code=502,
            detail=result.get("error") or result.get("lastCatalogError") or "Catalog sync failed",
        )
    return result


@router.post("/abandoned-checkouts/{checkout_id}/send-recovery")
async def send_abandoned_recovery(checkout_id: str, _: AdminUser):
    from app.services import aisensy as aisensy_svc

    if not ObjectId.is_valid(checkout_id):
        raise HTTPException(status_code=400, detail="Invalid checkout id")
    checkout = await AbandonedCheckout.get(ObjectId(checkout_id))
    if not checkout:
        raise HTTPException(status_code=404, detail="Abandoned checkout not found")
    if checkout.status != "abandoned":
        raise HTTPException(status_code=400, detail="Checkout is no longer abandoned")

    result = await aisensy_svc.notify_abandoned(checkout)
    checkout.recoverySentAt = datetime.utcnow()
    checkout.recoveryLastResult = {k: v for k, v in result.items() if k != "response"}
    await checkout.save()

    if result.get("ok"):
        from app.services import cart_recovery

        return {
            "ok": True,
            "result": {k: v for k, v in result.items() if k != "response"},
            "checkout": cart_recovery.admin_checkout_dict(checkout),
        }
    if result.get("skipped"):
        raise HTTPException(
            status_code=400,
            detail=f"Recovery not sent: {result.get('reason')}. Map and enable the Abandoned campaign in AiSensy settings.",
        )
    raise HTTPException(status_code=502, detail="AiSensy send failed")


@router.get("/tax-classes")
async def list_tax_classes(_: AdminUser):
    classes = await _ensure_tax_classes()
    return [doc_to_dict(c) for c in classes]


@router.post("/tax-classes", status_code=201)
async def create_tax_class(body: dict, _: AdminUser):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    try:
        rate = float(body.get("rate", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="rate must be a number")
    if rate < 0 or rate > 100:
        raise HTTPException(status_code=400, detail="rate must be between 0 and 100")

    is_default = bool(body.get("isDefault"))
    doc = TaxClass(
        name=name,
        rate=rate,
        description=(body.get("description") or None),
        isActive=bool(body.get("isActive", True)),
        isDefault=is_default,
    )
    await doc.insert()
    if is_default:
        await _clear_other_defaults(doc.id)
    return doc_to_dict(doc)


@router.put("/tax-classes/{tax_class_id}")
async def update_tax_class(tax_class_id: str, body: dict, _: AdminUser):
    doc = await TaxClass.get(ObjectId(tax_class_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Tax class not found")

    if "name" in body:
        name = (body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name is required")
        doc.name = name
    if "rate" in body:
        try:
            rate = float(body.get("rate"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="rate must be a number")
        if rate < 0 or rate > 100:
            raise HTTPException(status_code=400, detail="rate must be between 0 and 100")
        doc.rate = rate
    if "description" in body:
        doc.description = body.get("description") or None
    if "isActive" in body:
        doc.isActive = bool(body.get("isActive"))
    if "isDefault" in body:
        doc.isDefault = bool(body.get("isDefault"))

    doc.updatedAt = datetime.utcnow()
    await doc.save()
    if doc.isDefault:
        await _clear_other_defaults(doc.id)
    return doc_to_dict(doc)


@router.delete("/tax-classes/{tax_class_id}")
async def delete_tax_class(tax_class_id: str, _: AdminUser):
    doc = await TaxClass.get(ObjectId(tax_class_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Tax class not found")

    in_use = await Product.find(Product.taxClassId == tax_class_id).count()
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"Tax class is used by {in_use} product(s); reassign products first",
        )

    await doc.delete()
    return {"message": "Tax class removed"}


@router.get("/company-profile")
async def get_company_profile(_: AdminUser):
    s = await Setting.find_one(Setting.key == "company_profile")
    if not s or not isinstance(s.value, dict):
        return {**DEFAULT_COMPANY_PROFILE}
    return {**DEFAULT_COMPANY_PROFILE, **s.value}


@router.put("/company-profile")
async def save_company_profile(body: dict, _: AdminUser):
    profile = {**DEFAULT_COMPANY_PROFILE, **(body or {})}
    profile["gstin"] = _validate_gstin(profile.get("gstin")) or ""
    mode = profile.get("defaultPriceTaxMode") or "inclusive"
    if mode not in ("inclusive", "exclusive"):
        raise HTTPException(status_code=400, detail="defaultPriceTaxMode must be inclusive or exclusive")
    profile["defaultPriceTaxMode"] = mode
    profile["currency"] = profile.get("currency") or "INR"
    profile["country"] = profile.get("country") or "India"
    profile["orderPrefix"] = str(profile.get("orderPrefix") if profile.get("orderPrefix") is not None else "#")
    profile["orderSuffix"] = str(profile.get("orderSuffix") or "")

    s = await Setting.find_one(Setting.key == "company_profile")
    if s:
        s.value = profile
        await s.save()
    else:
        await Setting(key="company_profile", value=profile).insert()
    return profile


@router.get("/shipping-settings")
async def get_shipping_settings(_: AdminUser):
    return await load_shipping_settings()


@router.put("/shipping-settings")
async def save_shipping_settings(body: dict, _: AdminUser):
    current = await load_shipping_settings()
    incoming = dict(body or {})
    # Drop legacy Shiprocket-era keys if clients still send them.
    incoming.pop("codFee", None)
    incoming.pop("carrierAccounts", None)
    value = {**current, **incoming}
    value.pop("codFee", None)
    value.pop("carrierAccounts", None)
    s = await Setting.find_one(Setting.key == "shipping_settings")
    if s:
        s.value = value
        await s.save()
    else:
        await Setting(key="shipping_settings", value=value).insert()
    return await load_shipping_settings()


@router.get("/dtdc/settings")
async def get_dtdc_settings(_: AdminUser):
    from app.services import dtdc as dtdc_svc

    raw = await dtdc_svc.get_dtdc_settings()
    return {
        "customerCode": raw.get("customerCode") or "",
        "serviceTypeId": raw.get("serviceTypeId") or "B2C PRIORITY",
        "loadType": raw.get("loadType") or "NON-DOCUMENT",
        "useOrderIdAsReference": bool(raw.get("useOrderIdAsReference")),
        "hasApiKey": bool(raw.get("apiKey")),
        "isConnected": bool(raw.get("apiKey") and raw.get("customerCode")),
        "source": "env" if (os.environ.get("DTDC_API_KEY") or "").strip() else "settings",
    }


@router.put("/dtdc/settings")
async def save_dtdc_settings(body: dict, _: AdminUser):
    s = await Setting.find_one(Setting.key == "dtdc_settings")
    current = dict(s.value) if s and isinstance(s.value, dict) else {}
    # API key is env-only when DTDC_API_KEY is set; never persist new keys from admin body into Mongo as source of truth.
    env_key = (os.environ.get("DTDC_API_KEY") or "").strip()
    if env_key:
        api_key = current.get("apiKey")  # keep any legacy db value unused; env wins at read time
    else:
        api_key = str(body.get("apiKey") or "").strip() or current.get("apiKey")
    value = {
        **current,
        "customerCode": str(body.get("customerCode") or current.get("customerCode") or "").strip(),
        "serviceTypeId": str(
            body.get("serviceTypeId") or current.get("serviceTypeId") or "B2C PRIORITY"
        ).strip(),
        "loadType": str(body.get("loadType") or current.get("loadType") or "NON-DOCUMENT").strip(),
        "useOrderIdAsReference": bool(body.get("useOrderIdAsReference", current.get("useOrderIdAsReference"))),
    }
    if not env_key:
        value["apiKey"] = api_key
    else:
        # Strip secrets from Mongo when env is configured
        value.pop("apiKey", None)
        value.pop("trackingToken", None)
    if not value.get("customerCode") and not (os.environ.get("DTDC_CUST_CODE") or "").strip():
        raise HTTPException(status_code=400, detail="customerCode is required")
    if not env_key and not value.get("apiKey"):
        raise HTTPException(status_code=400, detail="apiKey is required (or set DTDC_API_KEY in env)")
    if s:
        s.value = value
        await s.save()
    else:
        await Setting(key="dtdc_settings", value=value).insert()
    return {
        "customerCode": value["customerCode"],
        "serviceTypeId": value["serviceTypeId"],
        "loadType": value["loadType"],
        "useOrderIdAsReference": value["useOrderIdAsReference"],
        "hasApiKey": True,
        "isConnected": True,
    }

