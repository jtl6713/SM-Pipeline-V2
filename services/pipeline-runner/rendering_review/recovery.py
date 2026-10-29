"""Read-only authority proof for resuming a failed exact review job.

Only a queued job with zero claims, no persistent launch history, no artifact,
and the original active publication hold can be recovered. This function
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


def _expected_owner(output_id: str, job_id: str) -> str:
    request_id = 'rrclaim_' + hashlib.sha256(
        ('chicago-pilot-v1|' + output_id + '|' + job_id).encode()).hexdigest()[:48]
    identity = json.dumps(['render-job-claim-v1', output_id, job_id, request_id],
                          separators=(',', ':'))
    return 'rrrunner_' + hashlib.sha256(identity.encode()).hexdigest()[:48]


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
    # A claimed job (or durable event of a Remotion launch) must NEVER be
    # restarted. Its existing remote attempt must instead be reconciled.
    try:
        history = json.loads(jf.get("Event_History_JSON") or "null")
    except (ValueError, TypeError) as exc:
        raise ReviewRecoveryDenied("launch_history_unreadable") from exc
    # The Worker may have already atomically claimed this job while the
    # Python client failed to decode its compressed success response. Resume
    # under that EXACT immutable lease; never reserve a second owner/fence.
    state = jf.get("Job_State")
    if state == "claimed":
        if (jf.get("Lease_Owner") != _expected_owner(output_id, job_id) or
            jf.get("Lease_Fence") != 1 or
            jf.get("Progress_Stage") != "claimed"):
            raise ReviewRecoveryDenied("claimed_job_owner_or_fence_changed")
    elif state == "queued":
        if (jf.get("Lease_Owner") or
            jf.get("Lease_Fence") not in (0, 0.0, None) or
            jf.get("Progress_Stage") != "awaiting_isolated_renderer"):
            raise ReviewRecoveryDenied("queued_job_might_have_lease")
    else:
        raise ReviewRecoveryDenied("job_not_recoverable")

    if (jf.get("Job_ID") != job_id or
        jf.get("Output_Record_ID") != output_id or
        jf.get("Progress_Percent") not in (0, 0.0, None) or
        history != [] or
        not isinstance(jf.get("Plan_Hash"), str) or
        len(jf["Plan_Hash"]) != 64):
        raise ReviewRecoveryDenied("job_might_have_launched")

    attempt_id = jf.get("Attempt_ID")
    if not attempt_id:
        raise ReviewRecoveryDenied("attempt_identity_missing")
    attempt = select_one(client, ATTEMPTS, "Attempt_ID", attempt_id)
    af = attempt.get("fields") or {}
    if (af.get("Attempt_ID") != attempt_id or
        af.get("Output_Record_ID") != output_id or
        af.get("Job_ID") != job_id or
        af.get("Attempt_Number") != 2 or
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
        not current or current.get("status") != "queued" or
        current.get("artifact_id") or current.get("job_id") != job_id):
        raise ReviewRecoveryDenied("review_session_not_unlaunched")
    return True
