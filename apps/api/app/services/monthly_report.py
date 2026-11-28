"""Previous-month store report for the staff inbox.

Sends on the 1st (IST), with catch-up later in the new month if the API was down.
Idempotent per calendar month via Setting.key = monthly_report_mail.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
SETTING_KEY = "monthly_report_mail"
POLL_SECONDS = 3600.0

CHANNEL_KEYS = (
    ("direct", "Direct"),
    ("instagram", "Instagram"),
    ("facebook", "Facebook"),
    ("others", "Others"),
)

PAID_ELIGIBLE: dict[str, Any] = {
    "status": {"$nin": ["abandoned", "cancelled"]},
    "$or": [
        {"paymentStatus": "paid"},
        {"transactionDetails.paymentStatus": "paid"},
    ],
}

_ITEM_QTY_EXPR = {
    "$reduce": {
        "input": {"$ifNull": ["$items", []]},
        "initialValue": 0,
        "in": {"$add": ["$$value", {"$ifNull": ["$$this.quantity", 1]}]},
    }
}


def _as_ist(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(IST)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc).astimezone(IST)
    return now.astimezone(IST)


def _to_naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def previous_calendar_month(now: datetime | None = None) -> tuple[datetime, datetime, str, str]:
    """Return previous IST month as naive-UTC [start, end), period key, and label."""
    now_ist = _as_ist(now)
    this_start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_day = this_start - timedelta(seconds=1)
    start = last_day.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = this_start
    return (
        _to_naive_utc(start),
        _to_naive_utc(end),
        start.strftime("%Y-%m"),
        start.strftime("%B %Y"),
    )


def prior_calendar_month(start_utc: datetime) -> tuple[datetime, datetime]:
    """Month immediately before `start_utc` (naive UTC start of an IST month)."""
    start_ist = start_utc.replace(tzinfo=timezone.utc).astimezone(IST)
    prev_last = start_ist - timedelta(seconds=1)
    prev_start = prev_last.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return _to_naive_utc(prev_start), start_utc


def _trend(current: float, previous: float) -> str:
    if not previous:
        return "+0%" if not current else "+100.0%"
    change = ((current - previous) / previous) * 100
    if not change:
        return "+0%"
    return f"{change:+.1f}%"


def _channel_bucket(source: str) -> str:
    s = str(source or "direct").strip().lower()
    if not s or s in {"direct", "(direct)", "none", "n/a", "(none)"}:
        return "direct"
    if "instagram" in s or s in {"ig"}:
        return "instagram"
    if "facebook" in s or s in {"fb", "meta"} or "fbclid" in s:
        return "facebook"
    return "others"


async def _period_totals(collection, start: datetime, end: datetime) -> tuple[int, float]:
    rows = await collection.aggregate(
        [
            {"$match": {**PAID_ELIGIBLE, "createdAt": {"$gte": start, "$lt": end}}},
            {
                "$group": {
                    "_id": None,
                    "orders": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                }
            },
        ]
    ).to_list(1)
    row = rows[0] if rows else {}
    return int(row.get("orders") or 0), round(float(row.get("revenue") or 0), 2)


async def _channel_stats(collection, start: datetime, end: datetime) -> list[dict]:
    rows = await collection.aggregate(
        [
            {"$match": {**PAID_ELIGIBLE, "createdAt": {"$gte": start, "$lt": end}}},
            {
                "$group": {
                    "_id": {"$ifNull": ["$attribution.lastTouch.source", "direct"]},
                    "orders": {"$sum": 1},
                    "revenue": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                    "quantity": {"$sum": _ITEM_QTY_EXPR},
                }
            },
            {"$sort": {"revenue": -1}},
        ]
    ).to_list(None)
    return [
        {
            "source": str(row.get("_id") or "direct"),
            "orders": int(row.get("orders") or 0),
            "revenue": round(float(row.get("revenue") or 0), 2),
            "quantity": int(row.get("quantity") or 0),
        }
        for row in rows
    ]


def _bucket_channels(current: list[dict], previous: list[dict]) -> list[dict]:
    empty = {"orders": 0, "revenue": 0.0, "quantity": 0}

    def roll(rows: list[dict]) -> dict[str, dict]:
        out = {key: dict(empty) for key, _ in CHANNEL_KEYS}
        for row in rows:
            key = _channel_bucket(row.get("source"))
            bucket = out[key]
            bucket["orders"] += int(row.get("orders") or 0)
            bucket["revenue"] += float(row.get("revenue") or 0)
            bucket["quantity"] += int(row.get("quantity") or 0)
        return out

    cur = roll(current)
    prev = roll(previous)
    result = []
    for key, label in CHANNEL_KEYS:
        c = cur[key]
        p = prev[key]
        result.append(
            {
                "key": key,
                "label": label,
                "orders": c["orders"],
                "quantity": c["quantity"],
                "revenue": round(c["revenue"], 2),
                "change": _trend(c["revenue"], p["revenue"]),
            }
        )
    return result


async def _new_vs_returning(collection, start: datetime, end: datetime) -> tuple[int, int]:
    ids = [
        cid
        for cid in await collection.distinct(
            "customerId",
            {**PAID_ELIGIBLE, "createdAt": {"$gte": start, "$lt": end}},
        )
        if cid
    ]
    if not ids:
        return 0, 0
    returning_ids = [
        cid
        for cid in await collection.distinct(
            "customerId",
            {
                **PAID_ELIGIBLE,
                "customerId": {"$in": ids},
                "createdAt": {"$lt": start},
            },
        )
        if cid
    ]
    returning = len(returning_ids)
    return len(ids) - returning, returning


async def collect_monthly_report(now: datetime | None = None) -> dict[str, Any]:
    from app.documents import Order

    start, end, period_key, label = previous_calendar_month(now)
    prev_start, prev_end = prior_calendar_month(start)
    collection = Order.get_pymongo_collection()

    paid_orders, total_revenue = await _period_totals(collection, start, end)
    prev_orders, prev_revenue = await _period_totals(collection, prev_start, prev_end)
    avg = round(total_revenue / paid_orders, 2) if paid_orders else 0.0
    prev_avg = round(prev_revenue / prev_orders, 2) if prev_orders else 0.0

    pending_orders = int(
        await collection.count_documents(
            {
                "status": {"$ne": "abandoned"},
                "createdAt": {"$gte": start, "$lt": end},
                "$nor": [
                    {"paymentStatus": "paid"},
                    {"transactionDetails.paymentStatus": "paid"},
                ],
            }
        )
    )
    abandoned_orders = int(
        await collection.count_documents(
            {"status": "abandoned", "createdAt": {"$gte": start, "$lt": end}}
        )
    )
    prev_abandoned = int(
        await collection.count_documents(
            {"status": "abandoned", "createdAt": {"$gte": prev_start, "$lt": prev_end}}
        )
    )
    checkout_attempts = paid_orders + abandoned_orders
    prev_attempts = prev_orders + prev_abandoned
    abandoned_rate = (
        round((abandoned_orders / checkout_attempts) * 100, 1) if checkout_attempts else 0.0
    )
    prev_abandoned_rate = (
        round((prev_abandoned / prev_attempts) * 100, 1) if prev_attempts else 0.0
    )

    new_customers, returning_customers = await _new_vs_returning(collection, start, end)
    prev_new, prev_returning = await _new_vs_returning(collection, prev_start, prev_end)

    current_channels = await _channel_stats(collection, start, end)
    previous_channels = await _channel_stats(collection, prev_start, prev_end)
    channels = _bucket_channels(current_channels, previous_channels)

    top_rows = await collection.aggregate(
        [
            {"$match": {**PAID_ELIGIBLE, "createdAt": {"$gte": start, "$lt": end}}},
            {"$unwind": "$items"},
            {
                "$group": {
                    "_id": "$items.productId",
                    "quantity": {"$sum": {"$ifNull": ["$items.quantity", 1]}},
                    "revenue": {
                        "$sum": {
                            "$multiply": [
                                {"$ifNull": ["$items.price", 0]},
                                {"$ifNull": ["$items.quantity", 1]},
                            ]
                        }
                    },
                    "name": {"$first": "$items.name"},
                }
            },
            {"$sort": {"revenue": -1, "quantity": -1}},
            {"$limit": 5},
            {
                "$lookup": {
                    "from": "products",
                    "localField": "_id",
                    "foreignField": "_id",
                    "as": "product",
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "name": {
                        "$ifNull": [
                            {"$arrayElemAt": ["$product.productName", 0]},
                            {"$arrayElemAt": ["$product.name", 0]},
                            "$name",
                            "Unknown product",
                        ]
                    },
                    "quantity": 1,
                    "revenue": 1,
                }
            },
        ]
    ).to_list(5)
    top_products = [
        {
            "name": str(row.get("name") or "Unknown product"),
            "quantity": int(row.get("quantity") or 0),
            "revenue": round(float(row.get("revenue") or 0), 2),
        }
        for row in top_rows
    ]

    location_rows = await collection.aggregate(
        [
            {"$match": {**PAID_ELIGIBLE, "createdAt": {"$gte": start, "$lt": end}}},
            {
                "$addFields": {
                    "locationKey": {
                        "$trim": {
                            "input": {
                                "$ifNull": [
                                    "$shippingAddress.city",
                                    {"$ifNull": ["$shippingAddress.district", "Unknown"]},
                                ]
                            }
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": {
                        "$cond": [
                            {"$or": [{"$eq": ["$locationKey", ""]}, {"$eq": ["$locationKey", None]}]},
                            "Unknown",
                            "$locationKey",
                        ]
                    },
                    "orders": {"$sum": 1},
                    "sales": {"$sum": {"$ifNull": ["$finalPrice", 0]}},
                }
            },
            {"$sort": {"sales": -1}},
            {"$limit": 5},
        ]
    ).to_list(5)
    by_location = [
        {
            "location": str(row.get("_id") or "Unknown"),
            "orders": int(row.get("orders") or 0),
            "sales": round(float(row.get("sales") or 0), 2),
        }
        for row in location_rows
    ]

    return {
        "period_key": period_key,
        "label": label,
        "paid_orders": paid_orders,
        "pending_orders": pending_orders,
        "total_revenue": total_revenue,
        "avg_order_value": avg,
        "new_customers": new_customers,
        "returning_customers": returning_customers,
        "abandoned_orders": abandoned_orders,
        "abandoned_rate": abandoned_rate,
        "channels": channels,
        "top_products": top_products,
        "by_location": by_location,
        "trends": {
            "orders": _trend(paid_orders, prev_orders),
            "revenue": _trend(total_revenue, prev_revenue),
            "avgValue": _trend(avg, prev_avg),
            "customers": _trend(new_customers, prev_new),
            "returningCustomers": _trend(returning_customers, prev_returning),
            "abandoned": _trend(abandoned_orders, prev_abandoned),
            "abandonedRate": _trend(abandoned_rate, prev_abandoned_rate),
        },
    }


async def _last_sent_period() -> str:
    from app.documents import Setting

    setting = await Setting.find_one(Setting.key == SETTING_KEY)
    value = setting.value if setting and isinstance(setting.value, dict) else {}
    return str(value.get("lastPeriod") or "").strip()


async def _mark_sent(period_key: str, to: str) -> None:
    from app.documents import Setting

    payload = {
        "lastPeriod": period_key,
        "sentAt": datetime.utcnow().isoformat(),
        "to": to,
    }
    setting = await Setting.find_one(Setting.key == SETTING_KEY)
    if setting:
        setting.value = payload
        await setting.save()
    else:
        await Setting(key=SETTING_KEY, value=payload).insert()


async def send_monthly_report(*, force: bool = False, now: datetime | None = None) -> dict[str, Any]:
    from app.services import email_resend as email_svc
    from app.services.store_settings import get_notification_prefs

    prefs = await get_notification_prefs()
    if not prefs.get("adminMonthlyReport", True):
        return {"skipped": True, "reason": "admin_monthly_report_disabled"}

    if not force and _as_ist(now).day > 3:
        return {"skipped": True, "reason": "outside_send_window"}

    report = await collect_monthly_report(now)
    period_key = report["period_key"]
    if not force and await _last_sent_period() == period_key:
        return {"skipped": True, "reason": "already_sent", "period": period_key}

    to = email_svc._staff_inbox()
    if not to:
        return {"skipped": True, "reason": "no_staff_email"}

    subject, html_body = email_svc.build_monthly_report_email_html(report)
    result = await email_svc.send_email(to=to, subject=subject, html_body=html_body)
    if result.get("ok"):
        await _mark_sent(period_key, to)
        result["to"] = to
        result["period"] = period_key
        result["type"] = "STAFF_MONTHLY_REPORT"
    elif not result.get("skipped"):
        print(f"[Resend] monthly report failed: {result}")
    return result


async def monthly_report_loop(stop_event: asyncio.Event, interval_seconds: float = POLL_SECONDS) -> None:
    """On startup and every hour: send previous-month report if it has not gone out yet."""
    while not stop_event.is_set():
        try:
            result = await send_monthly_report()
            if result.get("ok"):
                print(f"[Email] Monthly report sent: {result.get('period')} → {result.get('to')}")
        except Exception as exc:  # noqa: BLE001
            print(f"[Email] Monthly report loop error: {exc}")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            continue
