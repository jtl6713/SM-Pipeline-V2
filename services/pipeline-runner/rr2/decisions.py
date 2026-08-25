"""RR2 decision patches — Make 5576353 routes 4A–4D."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from rr2.constants import (
    DECISION_ALIASES,
    DECISION_APPROVED,
    DECISION_CHANGES,
    DECISION_DO_NOT_PUBLISH,
    DECISION_LABELS,
    DECISION_REJECTED,
)


def normalize_decision(raw: str | None) -> str | None:
    key = "".join(ch for ch in str(raw or "").strip().lower() if ch.isalnum() or ch == "_")
    if key in DECISION_ALIASES:
        return DECISION_ALIASES[key]
    collapsed = key.replace("_", "")
    return DECISION_ALIASES.get(collapsed)


def decision_stamp(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def append_decision_note(existing_notes: str, decision: str, *, now: datetime | None = None) -> str:
    label = DECISION_LABELS[decision]
    stamp = decision_stamp(now).strftime("%Y-%m-%d %H:%M")
    return (
        f"{existing_notes}\n\nRR2 render review decision: {label} at {stamp}. "
        "Decision received from review email."
    )


def decision_fields(
    decision: str,
    existing_notes: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    stamp = decision_stamp(now)
    notes = append_decision_note(existing_notes, decision, now=stamp)
    decided_at = stamp.isoformat()
    if decision == DECISION_APPROVED:
        return {
            "Auto_Publish_Enabled": True,
            "Review_Status": "Approved",
            "Publish_Status": "Ready to Publish",
            "Output_Status": "Approved for Publishing",
            "Output_Notes": notes,
            "Review_Decision_At": decided_at,
            "Publish_Method": "Automated",
        }
    if decision == DECISION_CHANGES:
        return {
            "Review_Status": "Changes Requested",
            "Publish_Status": "Not Ready",
            "Output_Status": "Changes Requested",
            "Output_Notes": notes,
            "Review_Decision_At": decided_at,
            "Render_Status": "Needs Changes",
        }
    if decision == DECISION_REJECTED:
        return {
            "Do_Not_Publish": True,
            "Review_Status": "Rejected",
            "Publish_Status": "Not Ready",
            "Output_Status": "Rejected",
            "Output_Notes": notes,
            "Review_Decision_At": decided_at,
        }
    if decision == DECISION_DO_NOT_PUBLISH:
        return {
            "Do_Not_Publish": True,
            "Review_Status": "Skipped",
            "Publish_Status": "Not Ready",
            "Output_Status": "Skipped",
            "Output_Notes": notes,
            "Review_Decision_At": decided_at,
        }
    raise ValueError(f"unsupported RR2 decision: {decision}")
