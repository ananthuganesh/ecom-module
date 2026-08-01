"""Google Analytics Data API v1 — traffic reports for admin Analytics."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any, Literal

from app.config import get_settings

logger = logging.getLogger(__name__)

RangeLiteral = Literal["7d", "30d", "90d", "365d"]

_RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}


def resolve_status() -> dict[str, Any]:
    settings = get_settings()
    property_id = str(settings.ga4_property_id or "").strip()
    has_creds = bool(_credentials_payload())
    enabled_flag = bool(settings.ga4_enabled)
    configured = enabled_flag and bool(property_id) and has_creds
    return {
        "enabled": configured,
        "configured": configured,
        "propertyId": property_id if configured else "",
        "hasCredentials": has_creds,
        "source": "env",
        "hint": "Set GA4_PROPERTY_ID and GA4_CREDENTIALS_JSON (or GA4_CREDENTIALS_FILE) on the API server.",
    }


def _credentials_payload() -> dict[str, Any] | None:
    settings = get_settings()
    raw = str(settings.ga4_credentials_json or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and data.get("client_email"):
                return data
        except json.JSONDecodeError:
            logger.warning("GA4_CREDENTIALS_JSON is not valid JSON")
            return None

    path = str(settings.ga4_credentials_file or "").strip()
    if path:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and data.get("client_email"):
                return data
        except OSError as exc:
            logger.warning("Could not read GA4_CREDENTIALS_FILE: %s", exc)
        except json.JSONDecodeError:
            logger.warning("GA4_CREDENTIALS_FILE is not valid JSON")
    return None


@lru_cache(maxsize=1)
def _client():
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.oauth2 import service_account

    payload = _credentials_payload()
    if not payload:
        raise RuntimeError("GA4 credentials not configured")
    creds = service_account.Credentials.from_service_account_info(
        payload,
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    return BetaAnalyticsDataClient(credentials=creds)


def _property_name() -> str:
    settings = get_settings()
    pid = str(settings.ga4_property_id or "").strip()
    if not pid:
        raise RuntimeError("GA4_PROPERTY_ID not set")
    if pid.startswith("properties/"):
        return pid
    return f"properties/{pid}"


def _metric_value(row, index: int = 0) -> float:
    try:
        return float(row.metric_values[index].value or 0)
    except (IndexError, AttributeError, TypeError, ValueError):
        return 0.0


def _dim_value(row, index: int = 0) -> str:
    try:
        return str(row.dimension_values[index].value or "")
    except (IndexError, AttributeError, TypeError):
        return ""


def fetch_report(range_: RangeLiteral = "30d") -> dict[str, Any]:
    """KPIs + top pages + sources + realtime for the selected range."""
    status = resolve_status()
    if not status["configured"]:
        return {
            **status,
            "available": False,
            "range": range_,
            "kpis": None,
            "topPages": [],
            "sources": [],
            "realtime": None,
            "error": "Google Analytics is not configured",
        }

    days = _RANGE_DAYS.get(range_, 30)
    start = f"{days}daysAgo"
    end = "today"

    try:
        from google.analytics.data_v1beta.types import (
            DateRange,
            Dimension,
            Metric,
            OrderBy,
            RunRealtimeReportRequest,
            RunReportRequest,
        )

        client = _client()
        property_name = _property_name()

        kpi_resp = client.run_report(
            RunReportRequest(
                property=property_name,
                date_ranges=[DateRange(start_date=start, end_date=end)],
                metrics=[
                    Metric(name="sessions"),
                    Metric(name="totalUsers"),
                    Metric(name="screenPageViews"),
                    Metric(name="bounceRate"),
                ],
            )
        )
        kpis = {"sessions": 0.0, "users": 0.0, "pageViews": 0.0, "bounceRate": 0.0}
        if kpi_resp.rows:
            row = kpi_resp.rows[0]
            kpis = {
                "sessions": _metric_value(row, 0),
                "users": _metric_value(row, 1),
                "pageViews": _metric_value(row, 2),
                "bounceRate": _metric_value(row, 3),
            }

        pages_resp = client.run_report(
            RunReportRequest(
                property=property_name,
                date_ranges=[DateRange(start_date=start, end_date=end)],
                dimensions=[Dimension(name="pagePath")],
                metrics=[Metric(name="screenPageViews"), Metric(name="totalUsers")],
                order_bys=[
                    OrderBy(
                        metric=OrderBy.MetricOrderBy(metric_name="screenPageViews"),
                        desc=True,
                    )
                ],
                limit=10,
            )
        )
        top_pages = [
            {
                "path": _dim_value(row, 0) or "/",
                "pageViews": int(_metric_value(row, 0)),
                "users": int(_metric_value(row, 1)),
            }
            for row in (pages_resp.rows or [])
        ]

        sources_resp = client.run_report(
            RunReportRequest(
                property=property_name,
                date_ranges=[DateRange(start_date=start, end_date=end)],
                dimensions=[Dimension(name="sessionSource")],
                metrics=[Metric(name="sessions"), Metric(name="totalUsers")],
                order_bys=[
                    OrderBy(
                        metric=OrderBy.MetricOrderBy(metric_name="sessions"),
                        desc=True,
                    )
                ],
                limit=10,
            )
        )
        sources = [
            {
                "source": _dim_value(row, 0) or "(direct)",
                "sessions": int(_metric_value(row, 0)),
                "users": int(_metric_value(row, 1)),
            }
            for row in (sources_resp.rows or [])
        ]

        realtime_users = 0
        try:
            rt = client.run_realtime_report(
                RunRealtimeReportRequest(
                    property=property_name,
                    metrics=[Metric(name="activeUsers")],
                )
            )
            if rt.rows:
                realtime_users = int(_metric_value(rt.rows[0], 0))
        except Exception as exc:  # noqa: BLE001 — realtime is optional
            logger.warning("GA4 realtime failed: %s", exc)

        return {
            **status,
            "available": True,
            "range": range_,
            "kpis": kpis,
            "topPages": top_pages,
            "sources": sources,
            "realtime": {"activeUsers": realtime_users},
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("GA4 report failed")
        return {
            **status,
            "available": False,
            "range": range_,
            "kpis": None,
            "topPages": [],
            "sources": [],
            "realtime": None,
            "error": str(exc)[:240],
        }
