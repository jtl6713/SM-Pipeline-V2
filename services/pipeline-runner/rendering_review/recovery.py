"""Read-only authority proof for resuming a failed exact review job.

Only an exact queued job OR the same deterministically-owned claimed job with no
persistent Remotion launch history or artifact can resume. Never mint a lease. This function
makes no Airtable, Drive, Remotion, or publisher writes.
"""
from __future__ import annotations

import json
import hashlib


class ReviewRecoveryDenied(RuntimeError):
    pass


def select_one(*args, **kwargs):
    """Lazy source lookup, injectable in hermetic no-write tests."""
    from rendering_review.one_job import select_one as lookup
    return lookup(*args, **kwargs)


def require_unlaunched_authority(output_id: str, job_id: str, *, client=None) -> bool:
    # Keep these optional until an actual guarded recovery request; the
    # normal service and hermetic producer tests must import without clients.
    from airtable.client import AirtableClient
    from rendering_review.one_job import (
        OUTPUTS, SESSIONS, JOBS, ATTEMPTS,
    )
    client = client if client is not None else AirtableClient()
    output = client.get_record(OUTPUTS, output_id)
    of = output.get("fields") or {}
    if (output.get("id") != output_id or
        of.get("Do_Not_Publish") is not True or
        of.get("Studio_Render_Review_Hold_Active") is not True or
        not of.get("Final_File_ID") or
        of.get("Published_At") or of.get("Platform_Post_ID") or
        of.get("Platform_Media_ID") or of.get("Publish_Started_At") or
        of.get("Publish_Locked_At") or of.get("Publish_Locked_By")):
        raise ReviewRecoveryDenied("original_hold_or_v1_not_verified")

    job = select_one(client, JOBS, "Job_ID", job_id)
    jf = job.get("fields") or {}
    # Replaying the SAME already-claimed lease is permitted only when no
    # Remotion intent has EVER been reserved. The claim endpoint derives its
    # lease owner from an immutable request fingerprint; compute that owner
    # independently instead of trusting the stored arbitrary owner.
    try:
        history = json.loads(jf.get("Event_History_JSON") or "null")
    except (ValueError, TypeError) as exc:
        raise ReviewRecoveryDenied("launch_history_unreadable") from exc
    expected_req = "rrclaim_" + hashlib.sha256(
        ("chicago-pilot-v1|" + output_id + "|" + job_id).encode()
    ).hexdigest()[:48]
    expected_owner = "rrrunner_" + hashlib.sha256(json.dumps(
        ["render-job-claim-v1", output_id, job_id, expected_req],
        separators=(",", ":")).encode()).hexdigest()[:48]
    job_state = jf.get("Job_State")
    common_valid = (
        jf.get("Job_ID") == job_id and
        jf.get("Output_Record_ID") == output_id and
        jf.get("Progress_Percent") in (0, 0.0, None) and
        history == [] and
        isinstance(jf.get("Plan_Hash"), str) and
        len(jf["Plan_Hash"]) == 64
    )
    queued_valid = (
        job_state == "queued" and
        jf.get("Progress_Stage") == "awaiting_isolated_renderer" and
        jf.get("Lease_Fence") in (0, 0.0, None) and
        not jf.get("Lease_Owner")
    )
    replay_valid = (
        job_state == "claimed" and
        jf.get("Progress_Stage") == "claimed" and
        jf.get("Lease_Fence") == 1 and
        jf.get("Lease_Owner") == expected_owner
    )
    if not common_valid or not (queued_valid or replay_valid):
        raise ReviewRecoveryDenied("job_might_have_launched")

    attempt_id = jf.get("Attempt_ID")
    if not attempt_id:
        raise ReviewRecoveryDenied("attempt_identity_missing")
    attempt = select_one(client, ATTEMPTS, "Attempt_ID", attempt_id)
    af = attempt.get("fields") or {}
    if (af.get("Attempt_ID") != attempt_id or
        af.get("Output_Record_ID") != output_id or
        af.get("Job_ID") != job_id or
        not isinstance(af.get("Attempt_Number"), int) or
        af.get("Attempt_Number") < 2 or
        af.get("Attempt_Status") != "queued" or
        af.get("Artifact_File_ID") or
        af.get("Artifact_URL") or
        af.get("Validation_Evidence_JSON")):
        raise ReviewRecoveryDenied("attempt_might_have_artifact")

    session = select_one(client, SESSIONS, "Output_Record_ID", output_id)
    sf = session.get("fields") or {}
    try:
        state = json.loads(sf.get("Session_JSON") or "null")
    except (ValueError, TypeError) as exc:
        raise ReviewRecoveryDenied("session_unreadable") from exc
    if not isinstance(state, dict):
        raise ReviewRecoveryDenied("session_unavailable")
    active = state.get("active_job") or {}
    attempts = state.get("attempts") or []
    original = next((x for x in attempts if x.get("number") == 1), None)
    current = next((x for x in attempts if x.get("id") == attempt_id), None)
    if (state.get("id") != jf.get("Session_ID") or
        state.get("output_id") != output_id or
        state.get("state") != "queued" or
        state.get("review_hold", {}).get("active") is not True or
        state.get("current_attempt_id") != attempt_id or
        active.get("id") != job_id or
        active.get("attempt_id") != attempt_id or
        active.get("plan_hash") != jf["Plan_Hash"] or
        not original or original.get("artifact_id") != of["Final_File_ID"] or
        not current or current.get("number") != af["Attempt_Number"] or
        state.get("latest_attempt_number") != af["Attempt_Number"] or
        current.get("status") != "queued" or
        current.get("artifact_id") or current.get("job_id") != job_id):
        raise ReviewRecoveryDenied("review_session_not_unlaunched")
    return True
