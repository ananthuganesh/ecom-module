from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services import rate_limit


@pytest.mark.usefixtures("db")
async def test_mongo_limit_reports_seconds_until_window_resets():
    for _ in range(2):
        await rate_limit.enforce_rate_limit("t:retry", limit=2, window_seconds=900)
    with pytest.raises(HTTPException) as exc:
        await rate_limit.enforce_rate_limit("t:retry", limit=2, window_seconds=900)
    assert exc.value.status_code == 429
    retry = int(exc.value.headers["Retry-After"])
    assert 1 <= retry <= 900


def test_memory_limit_reports_seconds_until_a_slot_frees(monkeypatch):
    rate_limit._buckets.clear()
    clock = iter([1000.0, 1010.0, 1020.0])
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: next(clock))
    rate_limit._memory_enforce("m:retry", limit=2, window_seconds=60)
    rate_limit._memory_enforce("m:retry", limit=2, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        rate_limit._memory_enforce("m:retry", limit=2, window_seconds=60)
    # Oldest request at t=1000 ages out at t=1060; now is t=1020.
    assert exc.value.headers["Retry-After"] == "40"
    rate_limit._buckets.clear()
