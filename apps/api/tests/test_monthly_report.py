from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.monthly_report import previous_calendar_month, prior_calendar_month

IST = ZoneInfo("Asia/Kolkata")


def test_previous_month_on_first_of_august():
    now = datetime(2026, 8, 1, 0, 5, tzinfo=IST)
    start, end, key, label = previous_calendar_month(now)
    assert key == "2026-07"
    assert label == "July 2026"
    assert start.year == 2026 and start.month == 6  # 1 Jul IST = 30 Jun 18:30 UTC
    assert end.year == 2026 and end.month == 7  # 1 Aug IST = 31 Jul 18:30 UTC


def test_prior_month_is_june_when_july_is_current_window():
    start, _, _, _ = previous_calendar_month(datetime(2026, 8, 19, 12, 0, tzinfo=IST))
    prev_start, prev_end = prior_calendar_month(start)
    assert prev_end == start
    assert prev_start < prev_end
