"""Back-in-stock alerts.

Sold-out products are hidden from Latest Drops and Similar, so a shopper who
wanted one had no way to register that demand. They can now leave an email
against a sold-out size and hear when it returns.

Alerts are sent from a periodic sweep rather than hooked into each place stock
changes. Stock moves through several paths (admin edits, returns, cancellations,
the ledger), and a sweep catches all of them without each one having to
remember to notify.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from app.documents import Product, StockAlert, User

SWEEP_INTERVAL_SECONDS = 600.0
SWEEP_BATCH_LIMIT = 200
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: Any) -> str | None:
    email = str(value or "").strip().lower()
    return email if _EMAIL.match(email) and len(email) <= 254 else None


def _live_variants(product: Product) -> list[Any]:
    return [v for v in (product.variants or []) if not getattr(v, "isDeleted", False)]


def size_stock(product: Product, size: str) -> int:
    """Units available for one size, or the whole product when size is ""."""
    variants = _live_variants(product)
    wanted = str(size or "").strip().lower()
    if not wanted:
        if variants:
            return sum(int(getattr(v, "quantity", 0) or 0) for v in variants)
        return int(product.totalStock or 0)
    return sum(
        int(getattr(v, "quantity", 0) or 0)
        for v in variants
        if str(getattr(v, "size", "") or "").strip().lower() == wanted
    )


def product_sizes(product: Product) -> set[str]:
    return {
        str(getattr(v, "size", "") or "").strip().lower()
        for v in _live_variants(product)
        if str(getattr(v, "size", "") or "").strip()
    }


async def _product(product_id: str) -> Product | None:
    if not ObjectId.is_valid(str(product_id)):
        return None
    return await Product.get(ObjectId(str(product_id)))


async def subscribe(
    product_id: str,
    *,
    email: Any,
    size: Any = "",
    user: User | None = None,
) -> dict[str, Any]:
    """Register interest in a sold-out size. Repeating it is harmless."""
    address = normalize_email(email or (user.email if user else None))
    if not address:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    product = await _product(product_id)
    if not product or str(product.status or "").lower() == "draft":
        raise HTTPException(status_code=404, detail="Product not found.")

    wanted = str(size or "").strip()
    if wanted and wanted.lower() not in product_sizes(product):
        raise HTTPException(status_code=400, detail="That size isn't offered for this product.")

    # Nothing to wait for — say so rather than silently queueing an alert.
    if size_stock(product, wanted) > 0:
        return {"subscribed": False, "inStock": True}

    existing = await StockAlert.find_one(
        StockAlert.productId == str(product.id),
        StockAlert.size == wanted,
        StockAlert.email == address,
        StockAlert.status == "pending",
    )
    if existing:
        return {"subscribed": True, "inStock": False, "alreadyWaiting": True}

    await StockAlert(
        productId=str(product.id),
        size=wanted,
        email=address,
        customerId=str(user.id) if user else None,
    ).insert()
    return {"subscribed": True, "inStock": False, "alreadyWaiting": False}


def _product_url(product: Product) -> str:
    from app.services import email_templates as tpl

    ref = product.slug or str(product.id)
    return f"{tpl.site_url()}/product/{ref}"


def build_alert_email(product: Product, size: str) -> tuple[str, str]:
    from app.services import email_templates as tpl

    name = product.productName or "Your pick"
    label = f"{name} ({size})" if size else name
    subject = f"Back in stock: {label}"
    lead = (
        f"Good news — <strong>{tpl.esc(label)}</strong> is back in stock at Urban Aana. "
        f"It sold out once already, so it may not last."
    )
    sections = "".join(
        [
            tpl.brand_header(),
            tpl.content_block(f"{lead}{tpl.mail_button(_product_url(product), 'Shop it now')}"),
            tpl.content_block(
                f"<span style='color:{tpl.TEXT_MUTED};'>You asked us to tell you when this "
                "came back. We only send this once.</span>",
                top_border=True,
            ),
        ]
    )
    html = tpl.render_shopify_email(
        preheader=f"{label} is back in stock",
        sections_html=sections,
        footer_note="Urban Aana · Back in stock",
    )
    return subject, html


async def dispatch_due_alerts(*, limit: int = SWEEP_BATCH_LIMIT) -> dict[str, int]:
    """Email every pending alert whose size has stock again."""
    from app.services import email_resend

    pending = await StockAlert.find(StockAlert.status == "pending").limit(limit).to_list()
    counts = {"checked": len(pending), "sent": 0, "failed": 0, "cancelled": 0, "waiting": 0}
    products: dict[str, Product | None] = {}

    for alert in pending:
        if alert.productId not in products:
            products[alert.productId] = await _product(alert.productId)
        product = products[alert.productId]

        # Deleted or unpublished: nothing will ever come back to notify about.
        if not product or str(product.status or "").lower() == "draft":
            alert.status = "cancelled"
            await alert.save()
            counts["cancelled"] += 1
            continue

        if size_stock(product, alert.size) <= 0:
            counts["waiting"] += 1
            continue

        subject, html = build_alert_email(product, alert.size)
        result = await email_resend.send_email(to=alert.email, subject=subject, html_body=html)
        if result.get("ok") or result.get("skipped"):
            # "skipped" means email is unconfigured; retrying every sweep would
            # never succeed, so it is closed out like a send.
            alert.status = "sent"
            alert.notifiedAt = datetime.utcnow()
            alert.lastError = None if result.get("ok") else str(result.get("reason") or "skipped")
            counts["sent"] += 1
        else:
            alert.lastError = str(result.get("error") or "send_failed")[:300]
            counts["failed"] += 1
        await alert.save()

    return counts


async def stock_alert_sweep_loop(stop_event: asyncio.Event) -> None:
    """Background sweep started from the app lifespan."""
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=60.0)
        return
    except asyncio.TimeoutError:
        pass

    while not stop_event.is_set():
        try:
            counts = await dispatch_due_alerts()
            if counts["sent"] or counts["failed"]:
                print(f"[StockAlerts] {counts}")
        except Exception as exc:  # noqa: BLE001
            print(f"[StockAlerts] sweep failed: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=SWEEP_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue
