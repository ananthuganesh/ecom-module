"""Shared pagination helpers for admin/list endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException


DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def parse_pagination(
    *,
    page: int | None = None,
    skip: int | None = None,
    limit: int | None = None,
) -> tuple[int, int, int]:
    """Return (skip, limit, page) with clamped limit."""
    lim = DEFAULT_LIMIT if limit is None else int(limit)
    if lim < 1:
        raise HTTPException(status_code=400, detail="limit must be >= 1")
    lim = min(lim, MAX_LIMIT)

    if skip is not None:
        sk = max(0, int(skip))
        pg = (sk // lim) + 1
        return sk, lim, pg

    pg = 1 if page is None else int(page)
    if pg < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")
    return (pg - 1) * lim, lim, pg


def page_payload(items: list, *, total: int, page: int, limit: int) -> dict:
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": page * limit < total,
    }


def date_preset_filter(preset: str | None, *, field: str = "createdAt") -> dict | None:
    """Mongo filter fragment for today|yesterday|7d|30d|all."""
    key = (preset or "all").strip().lower()
    if key in ("", "all", "custom"):
        return None
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    if key == "today":
        return {field: {"$gte": today_start}}
    if key == "yesterday":
        yesterday = today_start - timedelta(days=1)
        return {field: {"$gte": yesterday, "$lt": today_start}}
    if key in ("7d", "last7", "last_7"):
        return {field: {"$gte": now - timedelta(days=7)}}
    if key in ("30d", "last30", "last_30"):
        return {field: {"$gte": now - timedelta(days=30)}}
    return None


def date_bounds_filter(
    date_from: str | None = None,
    date_to: str | None = None,
    *,
    field: str = "createdAt",
) -> dict | None:
    """Mongo filter for inclusive YYYY-MM-DD (or ISO) bounds."""
    start = _parse_day_start(date_from)
    end = _parse_day_end(date_to)
    if start is None and end is None:
        return None
    rng: dict = {}
    if start is not None:
        rng["$gte"] = start
    if end is not None:
        rng["$lte"] = end
    return {field: rng}


def _parse_day_start(value: str | None) -> datetime | None:
    if not value or not str(value).strip():
        return None
    raw = str(value).strip()
    try:
        if "T" in raw:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
            return datetime(dt.year, dt.month, dt.day)
        y, m, d = (int(x) for x in raw[:10].split("-"))
        return datetime(y, m, d)
    except (TypeError, ValueError):
        return None


def _parse_day_end(value: str | None) -> datetime | None:
    start = _parse_day_start(value)
    if start is None:
        return None
    return start.replace(hour=23, minute=59, second=59, microsecond=999999)