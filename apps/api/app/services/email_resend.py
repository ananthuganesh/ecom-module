"""Transactional order emails via Resend (https://resend.com)."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Literal

import httpx

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
        return f"{tpl.site_url()}/profile/orders/{order_id}"
    return f"{tpl.site_url()}/profile/orders"


def _admin_order_url(order) -> str:
    order_id = str(getattr(order, "orderUrlId", None) or getattr(order, "id", "") or "")
    if order_id:
        return f"{tpl.site_url()}/admin/orders/{order_id}"
    return f"{tpl.site_url()}/admin/orders"


def _payment_label(order) -> str:
    method = str(getattr(order, "paymentMethod", None) or "razorpay").lower()
    status = str(getattr(order, "paymentStatus", None) or "").lower()
    if method in {"cod", "cash_on_delivery"}:
        return "Cash on Delivery"
    if method in {"manual"}:
        return "Manual"
    if "razorpay" in method or method in {"prepaid", "online"}:
        return "Razorpay" + (" (paid)" if status == "paid" else "")
    return method.replace("_", " ").title() or "Online"


def _format_when(order) -> str:
    created = getattr(order, "createdAt", None) or datetime.utcnow()
    try:
        return created.strftime("%b %d at %-I:%M %p")
    except ValueError:
        # Windows / some platforms lack %-I
        return created.strftime("%b %d at %I:%M %p").lstrip("0")


def _address_html(order) -> str:
    addr = order.shippingAddress or {}
    lines = [
        addr.get("name") or addr.get("fullName") or "",
        addr.get("address") or addr.get("address1") or addr.get("line1") or "",
        addr.get("address2") or addr.get("line2") or "",
        ", ".join(
            part
            for part in [
                addr.get("city") or "",
                addr.get("state") or addr.get("stateName") or "",
                addr.get("pincode") or addr.get("zip") or "",
            ]
            if part
        ),
        addr.get("country") or "India",
        addr.get("phone") or addr.get("mobile") or "",
    ]
    body = "<br/>".join(tpl.esc(line) for line in lines if str(line or "").strip())
    return body or "—"


def _item_rows_html(order) -> str:
    rows = []
    for item in order.items or []:
        name = getattr(item, "productName", None) or getattr(item, "name", None) or "Item"
        qty = int(getattr(item, "quantity", None) or getattr(item, "qty", None) or 1)
        price = float(getattr(item, "price", None) or 0)
        image = getattr(item, "image", None) or ""
        size = getattr(item, "size", None) or ""
        color = getattr(item, "color", None) or ""
        variant = " / ".join(part for part in [size, color] if part)
        # dict items (abandoned / raw)
        if isinstance(item, dict):
            name = item.get("productName") or item.get("name") or name
            qty = int(item.get("quantity") or item.get("qty") or qty)
            price = float(item.get("price") or price)
            image = item.get("image") or image
            variant = " / ".join(
                part for part in [item.get("size") or "", item.get("color") or ""] if part
            ) or variant
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


def _money_sections(order) -> str:
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
    total = float(getattr(order, "finalPrice", None) or getattr(order, "total", None) or 0)

    # Prefer explicit tax if present on transaction details; else derive remainder lightly
    details = order.transactionDetails or {}
    tax = details.get("taxAmount") or details.get("tax")
    try:
        tax_val = float(tax) if tax is not None else None
    except (TypeError, ValueError):
        tax_val = None

    rows = [tpl.subtotal_row("Subtotal", tpl.format_inr(items_subtotal))]
    if discount > 0:
        rows.append(tpl.subtotal_row("Discount", f"-{tpl.format_inr(discount)}"))
    rows.append(tpl.subtotal_row("Shipping", tpl.format_inr(shipping)))
    if tax_val is not None and tax_val > 0:
        rows.append(tpl.subtotal_row("Tax", tpl.format_inr(tax_val)))
    rows.append(tpl.subtotal_row("Total", f"{tpl.format_inr(total)} INR", bold=True))
    return (
        '<table width="100%" border="0" cellpadding="0" cellspacing="0" '
        'style="border-collapse:collapse;margin-top:4px;">'
        + "".join(rows)
        + "</table>"
    )


def build_order_email_html(order, *, email_type: EmailType, user=None) -> tuple[str, str]:
    """Customer-facing order emails in Shopify staff-notification style."""
    order_id = _order_ref(order)
    name = _customer_name(order, user)
    awb = (order.awb or "").strip()
    order_link = _order_url(order)
    when = _format_when(order)

    if email_type == "PLACED":
        subject = f"[Urban Aana] Order {order_id} placed"
        lead = (
            f"Hi {tpl.esc(name)}, we received your order "
            f"<strong>{tpl.esc(order_id)}</strong> on {tpl.esc(when)}."
        )
        button_label = "View order"
        preheader = f"Order {order_id} placed"
    elif email_type == "CONFIRMED":
        subject = f"[Urban Aana] Order {order_id} confirmed"
        lead = f"Hi {tpl.esc(name)}, your order <strong>{tpl.esc(order_id)}</strong> was confirmed on {tpl.esc(when)}."
        button_label = "View order"
        preheader = f"Order {order_id} confirmed"
    elif email_type == "SHIPPED":
        subject = f"[Urban Aana] Order {order_id} has shipped"
        track = f" Tracking ID: <strong>{tpl.esc(awb)}</strong>." if awb else ""
        lead = (
            f"Hi {tpl.esc(name)}, your order <strong>{tpl.esc(order_id)}</strong> "
            f"has been handed over to the courier.{track}"
        )
        button_label = "Track order"
        preheader = f"Order {order_id} shipped"
    else:
        subject = f"[Urban Aana] Order {order_id} delivered"
        lead = (
            f"Hi {tpl.esc(name)}, your order <strong>{tpl.esc(order_id)}</strong> "
            f"has been delivered. We hope you love it!"
        )
        button_label = "View order"
        preheader = f"Order {order_id} delivered"

    summary = (
        f"{tpl.section_heading('Order summary')}"
        f"{tpl.order_items_table(_item_rows_html(order))}"
        f"{_money_sections(order)}"
    )
    payment = tpl.info_block("Payment processing method", tpl.esc(_payment_label(order)))
    shipping = tpl.info_block("Shipping address", _address_html(order))

    sections = "".join(
        [
            tpl.content_block(f"{lead}{tpl.mail_button(order_link, button_label)}"),
            tpl.content_block(summary, top_border=True),
            tpl.content_block(f"{payment}<br/><br/>{shipping}", top_border=True),
        ]
    )
    html_body = tpl.render_shopify_email(preheader=preheader, sections_html=sections)
    return subject, html_body


def build_staff_new_order_email_html(order, user=None) -> tuple[str, str]:
    """Staff alert matching Shopify's 'Order placed by …' notification."""
    order_id = _order_ref(order)
    name = _customer_name(order, user)
    if name == "there":
        name = "A customer"
    when = _format_when(order)
    admin_link = _admin_order_url(order)

    subject = f"[Urban Aana] Order {order_id} placed by {name}"
    lead = (
        f"{tpl.esc(name)} placed order <strong>{tpl.esc(order_id)}</strong> "
        f"on {tpl.esc(when)}."
    )
    summary = (
        f"{tpl.section_heading('Order summary')}"
        f"{tpl.order_items_table(_item_rows_html(order))}"
        f"{_money_sections(order)}"
    )
    payment = tpl.info_block("Payment processing method", tpl.esc(_payment_label(order)))
    shipping = tpl.info_block("Shipping address", _address_html(order))

    sections = "".join(
        [
            tpl.content_block(f"{lead}{tpl.mail_button(admin_link, 'View order')}"),
            tpl.content_block(summary, top_border=True),
            tpl.content_block(f"{payment}<br/><br/>{shipping}", top_border=True),
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
    """Customer order emails always send when Resend is configured (no admin off-switch)."""
    to = _customer_email(order, user)
    if not to:
        return {"skipped": True, "reason": "no_email"}

    subject, html_body = build_order_email_html(order, email_type=email_type, user=user)
    result = await send_email(to=to, subject=subject, html_body=html_body)
    if result.get("ok"):
        result["to"] = to
        result["type"] = email_type
    return result


async def notify_order_email_once(email_type: EmailType, order, user=None) -> dict[str, Any]:
    """Send once per order+type (idempotent across verify + webhook)."""
    event = EVENT_BY_TYPE[email_type]
    details = dict(order.transactionDetails or {})
    sent = dict(details.get("resend") or {})
    if sent.get(event):
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
    """Shopify-style staff notification when a new order is placed."""
    prefs = await get_notification_prefs()
    if not prefs.get("adminNewOrderAlert", True):
        return {"skipped": True, "reason": "admin_new_order_alert_disabled"}

    to = _staff_inbox()
    if not to:
        return {"skipped": True, "reason": "no_staff_email"}

    details = dict(order.transactionDetails or {})
    sent = dict(details.get("resend") or {})
    if sent.get("staffNewOrder"):
        return {"skipped": True, "reason": "already_sent"}

    subject, html_body = build_staff_new_order_email_html(order, user)
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


def build_abandoned_cart_email_html(checkout, *, cart_link: str, user=None) -> tuple[str, str]:
    details = dict(checkout.customerDetails or {})
    name = (
        details.get("name")
        or (user.name if user else None)
        or "there"
    )
    name = str(name).strip() or "there"
    amount = float(checkout.totalAmount or 0)
    subject = "You left something in your Urban Aana cart"
    lead = (
        f"Hi {tpl.esc(name)}, you still have items waiting in your cart "
        f"(about {tpl.esc(tpl.format_inr(amount))}). Complete your order before they sell out."
    )
    # Reuse order item renderer with a lightweight shim
    class _Shim:
        items = checkout.items or []
        shippingAddress = details
        deliveryAmount = 0
        discountAmount = 0
        giftFee = 0
        finalPrice = amount
        total = amount
        transactionDetails = {}

    summary = (
        f"{tpl.section_heading('Your cart')}"
        f"{tpl.order_items_table(_item_rows_html(_Shim()))}"
        f"{_money_sections(_Shim())}"
    )
    sections = "".join(
        [
            tpl.content_block(
                f"{lead}<br/><br/>{tpl.mail_button(cart_link, 'Return to cart')}"
            ),
            tpl.content_block(summary, top_border=True),
        ]
    )
    html_body = tpl.render_shopify_email(
        preheader="Finish your Urban Aana order",
        sections_html=sections,
        footer_note="Urban Aana · Cart reminder",
    )
    return subject, html_body


async def notify_abandoned_cart_email(checkout, *, cart_link: str, user=None) -> dict[str, Any]:
    """Send abandoned-cart recovery email once per checkout (via Resend). Always on when configured."""
    details = dict(checkout.customerDetails or {})
    to = str(details.get("email") or (user.email if user else "") or "").strip().lower()
    if not to:
        return {"skipped": True, "reason": "no_email"}

    sent_meta = dict(getattr(checkout, "recoveryLastResult", None) or {})
    if sent_meta.get("emailSentAt"):
        return {"skipped": True, "reason": "already_sent"}

    subject, html_body = build_abandoned_cart_email_html(checkout, cart_link=cart_link, user=user)
    result = await send_email(to=to, subject=subject, html_body=html_body)
    if result.get("ok"):
        result["to"] = to
        result["type"] = "ABANDONED_CART"
    return result
