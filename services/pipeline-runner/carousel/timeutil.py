from __future__ import annotations

from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore[misc, assignment]


def chicago_now() -> datetime:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo("America/Chicago"))
        except Exception:
            pass
    return datetime.now(timezone(timedelta(hours=-5)))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(now: datetime | None = None) -> str:
    return (now or utc_now()).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_ms(now: datetime | None = None) -> str:
    stamp = now or utc_now()
    return stamp.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def stamp_minutes(now: datetime | None = None) -> str:
    return (now or chicago_now()).strftime("%Y-%m-%d %H:%M")
