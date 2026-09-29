"""Process-local AI API operational status for Studio."""

from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any

_lock = Lock()
_state: dict[str, Any] = {
    "provider": None,
    "preferred_provider": None,
    "failover": False,
    "status_code": None,
    "last_success_at": None,
    "last_primary": None,
}


def record_success(*, provider: str, preferred_provider: str, failover: bool, status_code: int | None) -> None:
    with _lock:
        _state.update(
            provider=provider,
            preferred_provider=preferred_provider,
            failover=bool(failover),
            status_code=status_code,
            last_success_at=datetime.now(timezone.utc).isoformat(),
        )


def record_primary_hit(
    *,
    stage: str,
    kind: str,
    model: str,
    preferred_provider: str,
    failover: bool,
    status_code: int | None,
    error: str | None = None,
) -> None:
    with _lock:
        _state["last_primary"] = {
            "stage": stage,
            "kind": kind,
            "model": model,
            "preferred_provider": preferred_provider,
            "failover": bool(failover),
            "status_code": status_code,
            "error": error,
            "at": datetime.now(timezone.utc).isoformat(),
        }


def snapshot() -> dict[str, Any]:
    with _lock:
        return dict(_state)
