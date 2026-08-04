"""Transactional order emails via Resend (https://resend.com)."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Literal

import httpx
from bson import ObjectId

from app.services import email_templates as tpl
from app.services.store_settings import get_notification_prefs

RESEND_API = "https://api.resend.com/emails"
EmailType = Literal["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED"]

EVENT_BY_TYPE: dict[EmailType, str] = {
    "PLACED": "orderPlaced",
    "CONFIRMED": "orderConfirmed",
    "SHIPPED": "orderShipped",
    "DELIVERED": "orderDelivered",
}

EMAIL_PREF_BY_TYPE: dict[EmailType, str] = {
    "PLACED": "emailOrderConfirmation",
    "CONFIRMED": "emailOrderConfirmation",
    "SHIPPED": "emailOrderShipped",
    "DELIVERED": "emailOrderDelivered",
}

DTDC_TRACK_URL = (
    "https://www.dtdc.in/tracking/tracking_results.asp?Ttype=awb_no&strCnno={awb}"
)


def _resend_api_key() -> str:
    from app.config import get_settings

    return (os.environ.get("RESEND_API_KEY") or get_settings().resend_api_key or "").strip()


def _resend_from() -> str:
    from app.config import get_settings

    return (
        os.environ.get("RESEND_FROM")
        or os.environ.get("EMAIL_FROM")
        or get_settings().resend_from
        or "Urban Aana <noreply@urbanaana.com>"
    ).strip()


def _staff_inbox() -> str:
    from app.config import get_settings

    return (
        os.environ.get("STAFF_ORDER_EMAIL")
        or os.environ.get("STORE_CONTACT_EMAIL")
        or getattr(get_settings(), "staff_order_email", "")
        or "info@bridnetwork.com"
    ).strip()


def _customer_email(order, user=None) -> str | None:
    addr = order.shippingAddress or {}
    email = (
        (user.email if user else None)
        or addr.get("email")
        or (order.transactionDetails or {}).get("customerDetails", {}).get("email")
    )
    email = str(email or "").strip().lower()
    return email or None


def _customer_phone(order, user=None) -> str:
    addr = order.shippingAddress or {}
    phone = (
        addr.get("phone")
        or addr.get("mobile")
        or (order.transactionDetails or {}).get("customerDetails", {}).get("phone")
        or (user.phone if user and getattr(user, "phone", None) else None)
        or ""
    )
    return str(phone or "").strip()


def _customer_name(order, user=None) -> str:
    addr = order.shippingAddress or {}
    name = (
        addr.get("name")
        or addr.get("fullName")
        or f"{addr.get('firstName') or ''} {addr.get('lastName') or ''}".strip()
        or (user.name if user else None)
        or "Customer"
    )
    name = str(name).strip()
    if name.lower() in {"guest user", "guest", "customer"}:
        return "there"
    return name


def _order_ref(order) -> str:
    return str(order.orderNumber or str(order.id)[-8:]).upper()


def _order_url(order) -> str:
    order_id = str(getattr(order, "id", "") or "")
    if order_id:
        return f"{tpl.site_url()}/account/orders/{order_id}"
    return f"{tpl.site_url()}/account/orders"


def _invoice_url(order) -> str:
    """Customer invoice is printed from the order page."""
    return _order_url(order)


def _admin_order_url(order) -> str:
    order_id = str(getattr(order, "orderUrlId", None) or getattr(order, "id", "") or "")
    if order_id:
        return f"{tpl.site_url()}/admin/orders/{order_id}"
    return f"{tpl.site_url()}/admin/orders"


def _track_url(order) -> str:
    awb = str(getattr(order, "awb", None) or "").strip()
    if awb:
        return DTDC_TRACK_URL.format(awb=awb)
    return _order_url(order)


def _payment_status_label(order) -> str:
    status = str(getattr(order, "paymentStatus", None) or "").lower()
    if status in {"paid", "captured"}:
        return "Paid"
    if status in {"authorized"}:
        return "Authorized"
    if status in {"pending", "created", ""}:
        return "Pending"
    return status.replace("_", " ").title() or "Paid"


def _payment_method_label(order) -> str:
    method = str(getattr(order, "paymentMethod", None) or "razorpay").lower()
    if method in {"manual"}:
        return "Manual"
    if "razorpay" in method or method in {"prepaid", "online"}:
        return "Razorpay"
    return method.replace("_", " ").title() or "Online"


def _format_when(dt: datetime | None = None) -> str:
    value = dt or datetime.utcnow()
    try:
        return value.strftime("%d %b %Y at %-I:%M %p")
    except ValueError:
        return value.strftime("%d %b %Y at %I:%M %p").lstrip("0")


def _format_date(dt: datetime | None = None) -> str:
    value = dt or datetime.utcnow()
    try:
        return value.strftime("%d %b %Y")
    except ValueError:
        return value.strftime("%d %b %Y")


def _addresses_equal(a: dict | None, b: dict | None) -> bool:
    if not a or not b:
        return True

    def norm(addr: dict) -> str:
        parts = [
            addr.get("name") or addr.get("fullName") or "",
            addr.get("address") or addr.get("address1") or addr.get("line1") or "",
            addr.get("address2") or addr.get("line2") or "",
            addr.get("city") or "",
            addr.get("state") or addr.get("stateName") or "",
            addr.get("pincode") or addr.get("zip") or addr.get("zipcode") or "",
            addr.get("country") or "",
            addr.get("phone") or addr.get("mobile") or "",
        ]
        return "|".join(" ".join(str(p or "").lower().split()) for p in parts)

    return norm(a) == norm(b)


def _format_address_dict(addr: dict | None) -> str:
    addr = addr or {}
    lines = [
        addr.get("name") or addr.get("fullName") or "",
        addr.get("address") or addr.get("address1") or addr.get("line1") or "",
        addr.get("address2") or addr.get("line2") or "",
        ", ".join(
            part
            for part in [
                addr.get("city") or "",
                addr.get("state") or addr.get("stateName") or "",
                addr.get("pincode") or addr.get("zip") or addr.get("zipcode") or "",
            ]
            if part
        ),
        addr.get("country") or "India",
        addr.get("phone") or addr.get("mobile") or "",
    ]
    body = "<br/>".join(tpl.esc(line) for line in lines if str(line or "").strip())
    return body or "—"


def _shipping_address_html(order) -> str:
    return _format_address_dict(order.shippingAddress or {})


def _billing_address_dict(order) -> dict | None:
    details = order.transactionDetails or {}
    billing = (
        getattr(order, "billingAddress", None)
        or details.get("billingAddress")
        or details.get("billing")
    )
    if isinstance(billing, dict) and any(str(v or "").strip() for v in billing.values()):
        return billing
    return None


def _order_notes(order) -> str:
    details = order.transactionDetails or {}
    notes = (
        details.get("notes")
        or details.get("orderNotes")
        or details.get("customerNotes")
        or getattr(order, "giftMessage", None)
        or ""
    )
    notes = str(notes or "").strip()
    if notes:
        return notes
    if getattr(order, "isGift", False):
        return "Gift order"
    return ""


def _is_paid(order) -> bool:
    status = str(getattr(order, "paymentStatus", None) or "").lower()
    details = order.transactionDetails or {}
    return status in {"paid", "captured"} or str(details.get("paymentStatus") or "").lower() == "paid"


async def _load_product_map(order_or_items) -> dict[str, Any]:
    from app.documents import Product

    items = (
        order_or_items
        if isinstance(order_or_items, list)
        else (getattr(order_or_items, "items", None) or [])
    )
    ids: list[ObjectId] = []
    for item in items:
        if isinstance(item, dict):
            pid = item.get("productId") or item.get("product")
        else:
            pid = getattr(item, "productId", None) or getattr(item, "product", None)
        if pid and ObjectId.is_valid(str(pid)):
            ids.append(ObjectId(str(pid)))
    if not ids:
        return {}
    products = await Product.find({"_id": {"$in": ids}}).to_list()
    return {str(p.id): p for p in products}


def _item_image(product) -> str:
    if not product:
        return ""
    if product.thumbnails:
        return str(product.thumbnails[0] or "")
    if product.variants:
        for variant in product.variants:
            images = getattr(variant, "images", None) or []
            if images:
                return str(images[0] or "")
    return ""


def _norm_color(value: str) -> str:
    s = " ".join(str(value or "").lower().split())
    if s in {"biege", "beige"}:
        return "beige"
    return s


def _product_matches_variant(product, *, size: str, color: str, price: float) -> bool:
    from app.services.variants import find_variant, product_variant_axes

    axes = product_variant_axes(product)
    size_n = " ".join(str(size or "").lower().split())
    color_n = _norm_color(color)
    if find_variant(product, color=color, size=size) is not None:
        return True
    # Soft price match when size is known
    if price > 0 and getattr(product, "pricing", None) and (size_n or (axes.get("color") and color_n)):
        sell = float(getattr(product.pricing, "sellingPrice", None) or 0)
        if sell and abs(sell - price) < 0.01:
            return True
    return False


async def _fallback_product_for_item(*, size: str, color: str, price: float, cache: list | None):
    from app.documents import Product

    if cache is None:
        cache = await Product.find_all().to_list()
    matches = [p for p in cache if _product_matches_variant(p, size=size, color=color, price=price)]
    if len(matches) == 1:
        return matches[0], cache
    if matches and price > 0:
        priced = []
        for p in matches:
            sell = float(getattr(getattr(p, "pricing", None), "sellingPrice", None) or 0)
            if sell and abs(sell - price) < 0.01:
                priced.append(p)
        if priced:
            return priced[0], cache
    if matches:
        return matches[0], cache
    return None, cache


async def _item_rows_html(order, product_map: dict[str, Any] | None = None) -> str:
    from app.services.variants import find_variant, format_variant_label

    product_map = product_map or {}
    rows = []
    catalog_cache: list | None = None
    for item in order.items or []:
        if isinstance(item, dict):
            pid = str(item.get("productId") or item.get("product") or "")
            name = item.get("productName") or item.get("name") or ""
            qty = int(item.get("quantity") or item.get("qty") or 1)
            price = float(item.get("price") or 0)
            image = str(item.get("image") or "")
            size = item.get("size") or ""
            color = item.get("color") or ""
        else:
            pid = str(getattr(item, "productId", None) or getattr(item, "product", None) or "")
            name = getattr(item, "productName", None) or getattr(item, "name", None) or ""
            qty = int(getattr(item, "quantity", None) or getattr(item, "qty", None) or 1)
            price = float(getattr(item, "price", None) or 0)
            image = str(getattr(item, "image", None) or "")
            size = getattr(item, "size", None) or ""
            color = getattr(item, "color", None) or ""

        product = product_map.get(pid) if pid and pid != "None" else None
        if not product and (not name or name.lower() in {"item", "product"}):
            product, catalog_cache = await _fallback_product_for_item(
                size=str(size), color=str(color), price=price, cache=catalog_cache
            )

        matched = find_variant(product, color=str(color), size=str(size)) if product else None
        if product:
            name = product.productName or product.product or product.name or name
            if not image:
                if matched and getattr(matched, "images", None):
                    image = str(matched.images[0] or "")
                if not image:
                    image = _item_image(product)
        if not name or str(name).lower() in {"item", "product"}:
            name = "Item"

        variant = format_variant_label(
            product, size=str(size), color=str(color), variant=matched
        )

        rows.append(
            tpl.order_item_row(
                name=str(name),
                qty=qty,
                price=price,
                image=str(image or ""),
                variant=str(variant or ""),
            )
        )
    if not rows:
        rows.append(
            f"<tr><td style='color:{tpl.TEXT_MUTED};font-size:14px;'>No items</td></tr>"
        )
    return "".join(rows)


async def _tax_amount(order) -> float | None:
    details = order.transactionDetails or {}
    for key in ("taxAmount", "tax", "gstAmount", "gst"):
        raw = details.get(key)
        try:
            if raw is not None and float(raw) > 0:
                return float(raw)
        except (TypeError, ValueError):
            pass

    invoice_id = getattr(order, "invoiceId", None)
    if invoice_id and ObjectId.is_valid(str(invoice_id)):
        try:
            from app.documents import SalesInvoice

            inv = await SalesInvoice.get(ObjectId(str(invoice_id)))
            if inv:
                total_tax = float(getattr(inv, "cgst", 0) or 0) + float(
                    getattr(inv, "sgst", 0) or 0
                ) + float(getattr(inv, "igst", 0) or 0)
                if total_tax > 0:
                    return total_tax
                if getattr(inv, "taxTotal", None):
                    return float(inv.taxTotal or 0)
        except Exception:
            pass
    return None


async def _money_sections(order) -> str:
    items_subtotal = 0.0
    for item in order.items or []:
        if isinstance(item, dict):
            qty = int(item.get("quantity") or item.get("qty") or 1)
            price = float(item.get("price") or 0)
        else:
            qty = int(getattr(item, "quantity", None) or getattr(item, "qty", None) or 1)
            price = float(getattr(item, "price", None) or 0)
        items_subtotal += price * qty

    shipping = float(getattr(order, "deliveryAmount", None) or 0)
    discount = float(
        getattr(order, "discountAmount", None) or getattr(order, "discount", None) or 0
    )
    gift_fee = float(getattr(order, "giftFee", None) or 0)
    total = float(getattr(order, "finalPrice", None) or getattr(order, "total", None) or 0)
    tax_val = await _tax_amount(order)

    rows = [tpl.subtotal_row("Subtotal", tpl.format_inr(items_subtotal))]
    if discount > 0:
        rows.append(tpl.subtotal_row("Discount", f"-{tpl.format_inr(discount)}"))
    rows.append(tpl.subtotal_row("Shipping", tpl.format_inr(shipping)))
    if gift_fee > 0:
        rows.append(tpl.subtotal_row("Gift wrap", tpl.format_inr(gift_fee)))
    if tax_val is not None and tax_val > 0:
        rows.append(tpl.subtotal_row("Tax (GST)", tpl.format_inr(tax_val)))
    rows.append(tpl.subtotal_row("Grand Total", f"{tpl.format_inr(total)} INR", bold=True))
    return (
        '<table width="100%" border="0" cellpadding="0" cellspacing="0" '
        'style="border-collapse:collapse;margin-top:4px;">'
        + "".join(rows)
        + "</table>"
    )


def _kv_rows(pairs: list[tuple[str, str]]) -> str:
    bits = []
    for label, value in pairs:
        if not str(value or "").strip():
            continue
        bits.append(
            f"<div style='margin:0 0 10px;'><strong style='color:{tpl.TEXT_PRIMARY};'>"
            f"{tpl.esc(label)}</strong><br/>"
            f"<span style='color:{tpl.TEXT_PRIMARY};'>{value}</span></div>"
        )
    return "".join(bits)


def _shipped_at(order) -> datetime:
    details = order.transactionDetails or {}
    dtdc = details.get("dtdc") if isinstance(details.get("dtdc"), dict) else {}
    for key in ("shippedAt", "readyToShipAt", "fulfilledAt"):
        raw = details.get(key) or dtdc.get(key)
        if isinstance(raw, datetime):
            return raw
        if isinstance(raw, str) and raw.strip():
            try:
                return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                pass
    return getattr(order, "updatedAt", None) or datetime.utcnow()


def _estimated_delivery_copy(order) -> str:
    """Soft ETA — no hard date unless store configures one later."""
    ship_dt = _shipped_at(order)
    eta = ship_dt + timedelta(days=5)
    return f"Typically by {_format_date(eta)} (3–5 business days)"


async def build_order_email_html(order, *, email_type: EmailType, user=None) -> tuple[str, str]:
    """Customer-facing order emails."""
    order_id = _order_ref(order)
    name = _customer_name(order, user)
    order_link = _order_url(order)
    product_map = await _load_product_map(order)
    items_html = await _item_rows_html(order, product_map)
    money_html = await _money_sections(order)
    shipping_html = _shipping_address_html(order)
    billing = _billing_address_dict(order)
    show_billing = billing and not _addresses_equal(billing, order.shippingAddress or {})

    if email_type == "PLACED":
        # Disabled in notify_order_email_once; kept for completeness.
        email_type = "CONFIRMED"

    if email_type == "CONFIRMED":
        subject = f"Order Confirmed – #{order_id}"
        preheader = f"Thanks! Order {order_id} is confirmed and paid."
        lead = (
            f"Hi {tpl.esc(name)}, thank you for shopping with Urban Aana. "
            f"We've received your payment and confirmed order "
            f"<strong>{tpl.esc(order_id)}</strong>."
        )
        meta = _kv_rows(
            [
                ("Order number", tpl.esc(order_id)),
                ("Order date & time", tpl.esc(_format_when(getattr(order, "createdAt", None)))),
                ("Payment status", tpl.esc(_payment_status_label(order))),
                ("Payment method", tpl.esc(_payment_method_label(order))),
            ]
        )
        address_bits = [tpl.info_block("Shipping address", shipping_html)]
        if show_billing:
            address_bits.append(tpl.info_block("Billing address", _format_address_dict(billing)))
        sections = "".join(
            [
                tpl.brand_header(),
                tpl.content_block(
                    f"{lead}{tpl.mail_button(order_link, 'View Order')}"
                ),
                tpl.content_block(meta, top_border=True),
                tpl.content_block(
                    f"{tpl.section_heading('Order summary')}"
                    f"{tpl.order_items_table(items_html)}"
                    f"{money_html}",
                    top_border=True,
                ),
                tpl.content_block("<br/><br/>".join(address_bits), top_border=True),
                tpl.content_block(tpl.support_block(), top_border=True),
            ]
        )
        return subject, tpl.render_shopify_email(preheader=preheader, sections_html=sections)

    if email_type == "SHIPPED":
        awb = str(getattr(order, "awb", None) or "").strip()
        courier = str(getattr(order, "courier", None) or "").strip() or ("DTDC" if awb else "Courier")
        invoice_no = str(getattr(order, "invoiceNumber", None) or "").strip()
        track_link = _track_url(order)
        invoice_link = _invoice_url(order)
        subject = "Your Order Is on the Way"
        preheader = f"Order {order_id} has shipped" + (f" · AWB {awb}" if awb else "")
        lead = (
            f"Hi {tpl.esc(name)}, great news — order <strong>{tpl.esc(order_id)}</strong> "
            f"is on its way to you."
        )
        meta = _kv_rows(
            [
                ("Order number", tpl.esc(order_id)),
                ("Shipping date", tpl.esc(_format_date(_shipped_at(order)))),
                ("Courier", tpl.esc(courier)),
                ("AWB / Tracking number", f"<strong>{tpl.esc(awb)}</strong>" if awb else "—"),
                ("Estimated delivery", tpl.esc(_estimated_delivery_copy(order))),
                ("Invoice", tpl.esc(invoice_no) if invoice_no else "Available on your order page"),
            ]
        )
        buttons = tpl.mail_button_row(
            (track_link, "Track shipment"),
            (invoice_link, "Download Invoice"),
        )
        sections = "".join(
            [
                tpl.brand_header(),
                tpl.content_block(f"{lead}{buttons}"),
                tpl.content_block(meta, top_border=True),
                tpl.content_block(
                    f"{tpl.section_heading('Product summary')}"
                    f"{tpl.order_items_table(items_html)}",
                    top_border=True,
                ),
                tpl.content_block(
                    tpl.info_block("Shipping address", shipping_html),
                    top_border=True,
                ),
                tpl.content_block(tpl.support_block(), top_border=True),
            ]
        )
        return subject, tpl.render_shopify_email(preheader=preheader, sections_html=sections)

    # DELIVERED
    delivered_at = (
        getattr(order, "deliveredAt", None)
        or getattr(order, "deliveryDate", None)
        or getattr(order, "updatedAt", None)
        or datetime.utcnow()
    )
    subject = "Your Order Has Been Delivered"
    preheader = f"Order {order_id} was delivered"
    lead = (
        f"Hi {tpl.esc(name)}, your order <strong>{tpl.esc(order_id)}</strong> "
        f"has been delivered. We hope you love it!"
    )
    meta = _kv_rows(
        [
            ("Order number", tpl.esc(order_id)),
            ("Delivered on", tpl.esc(_format_date(delivered_at))),
        ]
    )
    buttons = tpl.mail_button_row(
        (_invoice_url(order), "Download Invoice"),
        (order_link, "Write a Review"),
    )
    sections = "".join(
        [
            tpl.brand_header(),
            tpl.content_block(f"{lead}{buttons}"),
            tpl.content_block(meta, top_border=True),
            tpl.content_block(
                f"{tpl.section_heading('Product summary')}"
                f"{tpl.order_items_table(items_html)}",
                top_border=True,
            ),
            tpl.content_block(tpl.support_block(), top_border=True),
        ]
    )
    return subject, tpl.render_shopify_email(preheader=preheader, sections_html=sections)


async def build_staff_new_order_email_html(order, user=None) -> tuple[str, str]:
    """Staff alert when payment is received for a new order."""
    order_id = _order_ref(order)
    name = _customer_name(order, user)
    if name == "there":
        name = "A customer"
    email = _customer_email(order, user) or "—"
    phone = _customer_phone(order, user) or "—"
    notes = _order_notes(order)
    admin_link = _admin_order_url(order)
    product_map = await _load_product_map(order)
    total = float(getattr(order, "finalPrice", None) or getattr(order, "total", None) or 0)

    subject = f"New Order Received – #{order_id}"
    lead = (
        f"Payment received for order <strong>{tpl.esc(order_id)}</strong> "
        f"from {tpl.esc(name)}."
    )
    meta = _kv_rows(
        [
            ("Customer name", tpl.esc(name)),
            ("Customer phone", tpl.esc(phone)),
            ("Customer email", tpl.esc(email)),
            ("Order number", tpl.esc(order_id)),
            ("Payment", "Received"),
            ("Payment method", tpl.esc(_payment_method_label(order))),
            ("Total amount", tpl.esc(tpl.format_inr(total))),
            ("Order notes", tpl.esc(notes) if notes else ""),
        ]
    )
    sections = "".join(
        [
            tpl.brand_header(),
            tpl.content_block(f"{lead}{tpl.mail_button(admin_link, 'View Order')}"),
            tpl.content_block(meta, top_border=True),
            tpl.content_block(
                f"{tpl.section_heading('Products')}"
                f"{tpl.order_items_table(await _item_rows_html(order, product_map))}",
                top_border=True,
            ),
            tpl.content_block(
                tpl.info_block("Shipping address", _shipping_address_html(order)),
                top_border=True,
            ),
        ]
    )
    html_body = tpl.render_shopify_email(
        preheader=subject,
        sections_html=sections,
        footer_note="Urban Aana · Staff order notification",
    )
    return subject, html_body


async def send_email(*, to: str, subject: str, html_body: str) -> dict[str, Any]:
    api_key = _resend_api_key()
    if not api_key:
        return {"skipped": True, "reason": "resend_not_configured"}
    payload = {
        "from": _resend_from(),
        "to": [to],
        "subject": subject,
        "html": html_body,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                RESEND_API,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                return {
                    "ok": False,
                    "error": data.get("message") or resp.text[:300],
                    "status": resp.status_code,
                }
            return {"ok": True, "id": data.get("id"), "response": data}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


async def notify_order_email(email_type: EmailType, order, user=None) -> dict[str, Any]:
    """Customer order email — gated by Notifications preferences."""
    prefs = await get_notification_prefs()
    pref_key = EMAIL_PREF_BY_TYPE.get(email_type)
    if pref_key and not prefs.get(pref_key, True):
        return {"skipped": True, "reason": f"{pref_key}_disabled"}

    to = _customer_email(order, user)
    if not to:
        return {"skipped": True, "reason": "no_email"}

    subject, html_body = await build_order_email_html(order, email_type=email_type, user=user)
    result = await send_email(to=to, subject=subject, html_body=html_body)
    if result.get("ok"):
        result["to"] = to
        result["type"] = email_type
    return result


async def notify_order_email_once(email_type: EmailType, order, user=None) -> dict[str, Any]:
    """Send once per order+type (idempotent across verify + webhook).

    Customer email timeline (prepaid / Razorpay only):
    - CONFIRMED on payment success
    - SHIPPED on fulfill (AWB) — invoice download + AWB + tracking
    - DELIVERED when delivered
    PLACED is never sent to customers (no COD / pay-later path).
    """
    if email_type == "PLACED":
        return {"skipped": True, "reason": "placed_email_disabled_prepaid_only"}

    event = EVENT_BY_TYPE[email_type]

    details = dict(order.transactionDetails or {})
    sent = dict(details.get("resend") or {})
    if sent.get(event) or (
        email_type == "CONFIRMED"
        and (sent.get("orderConfirmation") or sent.get("orderPlaced") or sent.get("orderConfirmed"))
    ):
        return {"skipped": True, "reason": "already_sent"}

    result = await notify_order_email(email_type, order, user)
    if result.get("ok"):
        sent[event] = datetime.utcnow().isoformat()
        details["resend"] = sent
        order.transactionDetails = details
        order.updatedAt = datetime.utcnow()
        await order.save()
    elif result.get("skipped") and result.get("reason") == "resend_not_configured":
        pass
    elif not result.get("skipped"):
        print(f"[Resend] {email_type} failed: {result}")
    return result


async def notify_staff_new_order(order, user=None) -> dict[str, Any]:
    """Staff notification when payment is received for a new order."""
    prefs = await get_notification_prefs()
    if not prefs.get("adminNewOrderAlert", True):
        return {"skipped": True, "reason": "admin_new_order_alert_disabled"}

    if not _is_paid(order):
        return {"skipped": True, "reason": "awaiting_payment"}

    to = _staff_inbox()
    if not to:
        return {"skipped": True, "reason": "no_staff_email"}

    details = dict(order.transactionDetails or {})
    sent = dict(details.get("resend") or {})
    if sent.get("staffNewOrder"):
        return {"skipped": True, "reason": "already_sent"}

    subject, html_body = await build_staff_new_order_email_html(order, user)
    result = await send_email(to=to, subject=subject, html_body=html_body)
    if result.get("ok"):
        sent["staffNewOrder"] = datetime.utcnow().isoformat()
        details["resend"] = sent
        order.transactionDetails = details
        order.updatedAt = datetime.utcnow()
        await order.save()
        result["to"] = to
        result["type"] = "STAFF_NEW_ORDER"
    elif not result.get("skipped"):
        print(f"[Resend] staff new order failed: {result}")
    return result


async def build_abandoned_cart_email_html(checkout, *, cart_link: str, user=None) -> tuple[str, str]:
    from app.services import cart_recovery

    details = dict(checkout.customerDetails or {})
    name = details.get("name") or (user.name if user else None) or "there"
    name = str(name).strip() or "there"
    amount = float(checkout.totalAmount or 0)
    ttl_days = getattr(cart_recovery, "RECOVERY_TOKEN_TTL_DAYS", 14)

    subject = "Complete Your Purchase – Your Cart Is Waiting"
    lead = (
        f"Hi {tpl.esc(name)}, you left something behind. "
        f"Your Urban Aana cart is still waiting "
        f"(about <strong>{tpl.esc(tpl.format_inr(amount))}</strong>). "
        f"Complete your purchase before these pieces sell out."
    )
    limited = (
        f"This recovery link stays active for about {int(ttl_days)} days."
    )

    class _Shim:
        items = checkout.items or []
        shippingAddress = details
        deliveryAmount = float(getattr(checkout, "deliveryAmount", None) or 0)
        discountAmount = float(getattr(checkout, "discountAmount", None) or 0)
        giftFee = 0
        finalPrice = amount
        total = amount
        transactionDetails = {}
        invoiceId = None

    product_map = await _load_product_map(_Shim.items)
    summary = (
        f"{tpl.section_heading('Your cart')}"
        f"{tpl.order_items_table(await _item_rows_html(_Shim(), product_map))}"
        f"{await _money_sections(_Shim())}"
    )
    sections = "".join(
        [
            tpl.brand_header(),
            tpl.content_block(
                f"{lead}<br/><br/>"
                f"<span style='color:{tpl.TEXT_MUTED};'>{tpl.esc(limited)}</span>"
                f"{tpl.mail_button(cart_link, 'Complete checkout')}"
            ),
            tpl.content_block(summary, top_border=True),
            tpl.content_block(tpl.support_block(), top_border=True),
        ]
    )
    html_body = tpl.render_shopify_email(
        preheader="Your cart is waiting — complete your Urban Aana order",
        sections_html=sections,
        footer_note="Urban Aana · Cart reminder",
    )
    return subject, html_body


async def notify_abandoned_cart_email(checkout, *, cart_link: str, user=None) -> dict[str, Any]:
    """Send abandoned-cart recovery email once per checkout (via Resend)."""
    prefs = await get_notification_prefs()
    if not prefs.get("emailAbandonedCart", True):
        return {"skipped": True, "reason": "emailAbandonedCart_disabled"}

    details = dict(checkout.customerDetails or {})
    to = str(details.get("email") or (user.email if user else "") or "").strip().lower()
    if not to:
        return {"skipped": True, "reason": "no_email"}

    sent_meta = dict(getattr(checkout, "recoveryLastResult", None) or {})
    if sent_meta.get("emailSentAt"):
        return {"skipped": True, "reason": "already_sent"}

    subject, html_body = await build_abandoned_cart_email_html(
        checkout, cart_link=cart_link, user=user
    )
    result = await send_email(to=to, subject=subject, html_body=html_body)
    if result.get("ok"):
        result["to"] = to
        result["type"] = "ABANDONED_CART"
    return result
