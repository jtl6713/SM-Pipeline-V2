"""I3 processor — idea review decisions and I4 handoff (Make 5517182)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import SOURCE_CANDIDATES_TABLE
from i3.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from i3.decisions import (
    carousel_fields,
    config_approve_fields,
    quick_approve_fields,
    reject_fields,
    tune_fields,
    video_fields,
)
from i3.html import carousel_form, confirmation, video_form
from idea.chain import trigger_next
from idea.mapping import first_value, route_for_payload
from production_mode_guard import explicit_manual_idea, verify_manual_submitted_owner


def _trigger_i4(record_id: str, payload: dict[str, Any], *, trigger: bool,
                trusted_production_request_id: str | None = None) -> dict[str, Any] | None:
    if not trigger:
        return {"skipped": "trigger_i4_false"}
    from i4.processor import process_request as process_i4

    return trigger_next(
        "i4",
        {
            "source": "I3",
            "event": "candidate_approved",
            "record_id": record_id,
            "action": first_value(payload, "action"),
            "decision": first_value(payload, "decision"),
        },
        python_call=lambda: process_i4(record_id=record_id, dry_run=False,
                                       trusted_production_request_id=trusted_production_request_id),
    )


def process_request(
    *,
    payload: dict[str, Any],
    dry_run: bool = False,
    trigger_i4: bool = True,
    trusted_production_request_id: str | None = None,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "record_id": first_value(payload, "record_id"),
        "action": first_value(payload, "action"),
        "decision": first_value(payload, "decision"),
    }
    route = route_for_payload(payload)
    preview["route"] = route
    if route == "missing_record":
        return {
            "processed": False,
            "reason": "missing_record_id",
            "html": confirmation("Missing idea", "record_id is required"),
            **preview,
        }
    if route == "unknown":
        return {
            "processed": False,
            "reason": "unknown_decision",
            "html": confirmation("Unknown I3 action", "No matching decision route"),
            **preview,
        }

    client = AirtableClient()
    candidate = client.get_record(SOURCE_CANDIDATES_TABLE, preview["record_id"])
    preview["candidate_title"] = (candidate.get("fields") or {}).get("Candidate_Title")

    if route == "carousel_form":
        return {
            "processed": True,
            "form": True,
            "html": carousel_form(candidate, payload),
            **preview,
        }
    if route == "video_form":
        return {
            "processed": True,
            "form": True,
            "html": video_form(candidate, payload),
            **preview,
        }
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    if route == "deleted":
        client.delete_record(SOURCE_CANDIDATES_TABLE, candidate["id"])
        return {
            "processed": True,
            "html": confirmation("Candidate removed", "The idea candidate was deleted."),
            **preview,
        }

    if route == "tune":
        fields = tune_fields()
        client.update_record(SOURCE_CANDIDATES_TABLE, candidate["id"], fields)
        return {
            "processed": True,
            "html": confirmation("Tune requested", "The candidate was marked Tune Requested."),
            **preview,
        }
    if route == "rejected":
        client.update_record(SOURCE_CANDIDATES_TABLE, candidate["id"], reject_fields())
        return {
            "processed": True,
            "html": confirmation("Candidate rejected", "The candidate will not be promoted."),
            **preview,
        }

    # Manual Production permits initial Idea acceptance, but that is not
    # intermediate Production approval. Legacy email/form calls have no
    # authenticated exact Submitted owner and must never chain I4.
    if explicit_manual_idea(candidate):
        if trusted_production_request_id:
            if not verify_manual_submitted_owner(candidate["id"], trusted_production_request_id):
                return {"processed": False, "reason": "manual_production_approval_unverified", **preview}
        else:
            status = (candidate.get("fields") or {}).get("Candidate_Status")
            if status not in ("Generated", "Sent for Review"):
                return {"processed": False, "reason": "manual_production_review_required",
                        "html": confirmation("Manual Production", "Review the saved Idea in Production."), **preview}
            # Acceptance only: do not let legacy configuration forms change
            # approved media, target platforms, or production settings.
            client.update_record(SOURCE_CANDIDATES_TABLE, candidate["id"], quick_approve_fields(), typecast=True)
            return {"processed": True, "manual_production_required": True,
                    "html": confirmation("Idea accepted", "Review and approve it in Manual Production."),
                    "i4": {"skipped": "manual_production_review_required"}, **preview}

    if route == "carousel_submit":
        fields = carousel_fields(payload)
        message = "Carousel configuration saved. I4 will promote the Content Item."
    elif route == "video_submit":
        fields = video_fields(payload)
        message = "Video configuration saved. I4 will promote the Content Item."
    elif route == "approve_with_config":
        fields = config_approve_fields(payload)
        message = "Candidate approved with production settings."
    else:
        fields = quick_approve_fields()
        message = "Candidate approved. Existing Production_* fields were preserved."

    client.update_record(SOURCE_CANDIDATES_TABLE, candidate["id"], fields, typecast=True)
    next_result = _trigger_i4(candidate["id"], payload, trigger=trigger_i4,
                              trusted_production_request_id=trusted_production_request_id)
    return {
        "processed": True,
        "html": confirmation("Idea approved", message),
        "i4": next_result,
        **preview,
    }
