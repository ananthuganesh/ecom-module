"""Scheduled sale prices that start and revert on their own.

While a sale is live the product's real ``pricing.sellingPrice`` *is* the sale
price, and ``sale.regularPrice`` remembers what to put back. Swapping the stored
price (rather than computing it at read time) means cart, checkout, Razorpay,
coupons and catalog feeds all charge the sale price with no changes of their own.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, time, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from app.documents import Pricing, Product, ProductSale

SWEEP_SECONDS = 60.0
UNSET: Any = object()
# Daily windows are store-local. India has no DST, so a fixed offset is exact
# (and needs no tzdata in slim containers).
STORE_UTC_OFFSET = timedelta(hours=5, minutes=30)
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _naive_utc(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Sale dates must be valid dates.")
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def parse_sale(body: Any) -> ProductSale | None:
    """Admin input → a not-yet-live sale, or None to clear it."""
    if not isinstance(body, dict) or body.get("price") in (None, ""):
        return None
    try:
        price = round(float(body["price"]), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Sale price must be a number.")
    if price <= 0:
        raise HTTPException(status_code=400, detail="Sale price must be more than ₹0.")
    starts_at = _naive_utc(body.get("startsAt"))
    ends_at = _naive_utc(body.get("endsAt"))
    if starts_at and ends_at and ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="Sale end must be after its start.")
    daily_start = _hhmm(body.get("dailyStart"))
    daily_end = _hhmm(body.get("dailyEnd"))
    if bool(daily_start) != bool(daily_end):
        raise HTTPException(status_code=400, detail="Set both daily times, or neither.")
    if daily_start and daily_start == daily_end:
        raise HTTPException(status_code=400, detail="Daily start and end can't be the same time.")
    return ProductSale(
        price=price,
        startsAt=starts_at,
        endsAt=ends_at,
        dailyStart=daily_start,
        dailyEnd=daily_end,
    )


def _hhmm(value: Any) -> str | None:
    text = str(value or "").strip()[:5]
    if not text:
        return None
    if not _HHMM.match(text):
        raise HTTPException(status_code=400, detail="Daily times must look like 10:00.")
    return text


def _clock(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def _daily_close(sale: ProductSale, now: datetime) -> datetime | None:
    """If ``now`` is inside today's daily window, when that window closes (naive UTC); else None.

    Handles windows that cross midnight, e.g. 20:00–02:00.
    """
    start, end = _clock(sale.dailyStart), _clock(sale.dailyEnd)
    local = now + STORE_UTC_OFFSET
    t = local.time()
    if start < end:
        if not (start <= t < end):
            return None
        close_day = local.date()
    elif t >= start:
        close_day = local.date() + timedelta(days=1)
    elif t < end:
        close_day = local.date()
    else:
        return None
    return datetime.combine(close_day, end) - STORE_UTC_OFFSET


def live_until(sale: ProductSale, now: datetime) -> datetime | None:
    """When the current stretch of an open sale stops, or None if it runs with no end."""
    close = _daily_close(sale, now) if sale.dailyStart and sale.dailyEnd else None
    candidates = [d for d in (close, sale.endsAt) if d is not None]
    return min(candidates) if candidates else None


def _pricing(product: Product) -> Pricing:
    """Admin writes can leave ``pricing`` as a raw dict (setattr skips validation)."""
    raw = product.pricing
    if isinstance(raw, Pricing):
        return raw
    return Pricing(**raw) if isinstance(raw, dict) else Pricing()


def _set_selling(product: Product, value: float | None) -> None:
    product.pricing = _pricing(product).model_copy(update={"sellingPrice": value})


def window_open(sale: ProductSale, now: datetime) -> bool:
    if sale.startsAt is not None and now < sale.startsAt:
        return False
    if sale.endsAt is not None and now >= sale.endsAt:
        return False
    if sale.dailyStart and sale.dailyEnd:
        return _daily_close(sale, now) is not None
    return True


def reconcile(product: Product, now: datetime | None = None) -> bool:
    """Start, keep, or end the product's sale for ``now``. Returns True when something changed."""
    sale = product.sale
    if isinstance(sale, dict):
        sale = product.sale = ProductSale(**sale)
    if sale is None:
        return False
    now = now or datetime.utcnow()
    current = _pricing(product).sellingPrice
    regular = sale.regularPrice if sale.live else current
    should_be_live = bool(
        sale.price and regular and sale.price < regular and window_open(sale, now)
    )
    changed = False
    if should_be_live:
        if not sale.live:
            sale.live = True
            sale.regularPrice = regular
            changed = True
        if current != sale.price:
            _set_selling(product, sale.price)
            changed = True
        until = live_until(sale, now)
        if sale.liveUntil != until:
            sale.liveUntil = until
            changed = True
    elif sale.live:
        _set_selling(product, sale.regularPrice)
        sale.live = False
        sale.regularPrice = None
        sale.liveUntil = None
        changed = True
    if sale.price is None and not sale.live:
        product.sale = None
        changed = True
    return changed


def begin_edit(product: Product) -> tuple[bool, float | None]:
    """Remember the sale state before an admin write touches the product."""
    sale = product.sale
    live = bool(sale and sale.live)
    return live, (sale.regularPrice if live and sale else None)


def finish_edit(
    product: Product,
    state: tuple[bool, float | None],
    *,
    price_written: bool,
    sale_body: Any = UNSET,
) -> None:
    """Re-apply the sale after an admin write.

    While a sale is live, the admin form edits the *regular* price, so a written
    selling price becomes the new price to restore when the sale ends.
    """
    was_live, regular = state
    written = _pricing(product).sellingPrice
    if was_live and price_written and written is not None:
        regular = written
    if sale_body is not UNSET:
        product.sale = parse_sale(sale_body)
    if was_live:
        if product.sale is None:
            product.sale = ProductSale()
        product.sale.live = True
        product.sale.regularPrice = regular
    reconcile(product)


async def sweep(now: datetime | None = None) -> dict[str, int]:
    """Start sales whose time has come and revert ones that have ended.

    Writes only the sale fields, guarded on the price and live flag it read, so an
    admin save or stock update that lands mid-sweep is never overwritten with a
    stale copy; a skipped product is picked up on the next tick.
    """
    products = await Product.find(
        {"$or": [{"sale.price": {"$ne": None}}, {"sale.live": True}]}
    ).to_list()
    collection = Product.get_pymongo_collection()
    changed = 0
    for product in products:
        was_live = bool(product.sale and getattr(product.sale, "live", False))
        old_price = _pricing(product).sellingPrice
        if not reconcile(product, now):
            continue
        result = await collection.update_one(
            {
                "_id": product.id,
                "pricing.sellingPrice": old_price,
                "sale.live": True if was_live else {"$ne": True},
            },
            {
                "$set": {
                    "pricing.sellingPrice": _pricing(product).sellingPrice,
                    "sale": product.sale.model_dump() if product.sale else None,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        changed += result.modified_count
    return {"scanned": len(products), "changed": changed}


async def sale_sweep_loop(stop_event: asyncio.Event, interval_seconds: float = SWEEP_SECONDS) -> None:
    while not stop_event.is_set():
        try:
            result = await sweep()
            if result.get("changed"):
                print(f"[Sale] Updated sale prices: {result}")
        except Exception as exc:
            print(f"[Sale] Sweep error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
