"""AP1-IG processor — Instagram Reel Graph publish (Make 5862882)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from ap0.public_cover import ensure_public_cover_url, graph_fetchable_cover_url, native_grid_cover_required
from ap1_ig.caption import reel_create_body
from ap1_ig.constants import (
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PUBLISH_LOCKED_BY,
    PUBLISH_METHOD,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHING,
    PUBLISH_STATUS_READY,
    REPLACE_CLEANUP_STATE,
    RETRY_MINUTES,
)
from ap1_ig.eligibility import eligibility_reason
from ap1_ig.graph import InstagramGraphError, InstagramReelClient, load_instagram_graph_settings
from asset.helpers import parse_int
from carousel.timeutil import chicago_now, iso_utc, parse_utc, stamp_minutes, utc_now
from item4.settings import PipelineSettings
from publish.location import resolve_publish_location
from publish.rendering_review import verify_before_reel_creation, verify_before_reel_publication
from publish.review_dispatch_claim import (
    ReviewDispatchClaimError, shared_dispatch_claim_required,
    is_chicago_reel, claim_chicago_dispatch,
)
from render.fields import field, field_str

RECORD_ID_PREFIX = "rec"


def _append_notes(existing: str, paragraph: str) -> str:
    base = (existing or "").rstrip()
    if not base:
        return paragraph
    return f"{base}\n\n{paragraph}"


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "Instagram",
        "format": "Reel",
    }



def _release_preflight_lock_if_exact_owner(
    client: AirtableClient, output_id: str, lock_stamp: str, *, reason: str,
) -> bool:
    """Clear only this attempt's lock after a review guard refuses to proceed.

    Called ONLY on return paths before remote media_publish. A saved container
    remains Publishing so a later approved, fenced resume uses that identity.
    Never change approval/hold flags, delete provider IDs or requeue a new create.
    """
    try:
        fresh = client.get_record(PLATFORM_OUTPUTS_TABLE, output_id)
        # Airtable can echo UTC dateTime values with .000Z while the runner
        # writes whole seconds. Compare UTC instants, not literal strings.
        expected_at = parse_utc(lock_stamp)
        locked_at = parse_utc(field_str(fresh, "Publish_Locked_At"))
        attempted_at = parse_utc(field_str(fresh, "Last_Publish_Attempt_At"))
        if (expected_at is None or locked_at is None or attempted_at is None
                or field_str(fresh, "Publish_Locked_By") != PUBLISH_LOCKED_BY
                or locked_at != expected_at
                or attempted_at != expected_at
                or field_str(fresh, "Publish_Status") != PUBLISH_STATUS_PUBLISHING
                or field_str(fresh, "Platform_Post_ID")
                or field_str(fresh, "Published_At")):
            return False
        client.update_record(PLATFORM_OUTPUTS_TABLE, output_id, {
            "Publish_Locked_By": "",
            "Publish_Locked_At": None,
            "Publish_Started_At": None,
            "Publish_Retry_Eligible": False,
            "Output_Notes": _append_notes(field_str(fresh, "Output_Notes"),
                f"QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation "
                f"({reason}) at {stamp_minutes()}. Exact attempt lock released; "
                "status and any saved Meta identity preserved for reconciliation."),
        }, typecast=True)
        return True
    except Exception:
        # If authoritative reads or writes fail, never assume the lock cleared.
        return False

def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = _preview(output_record_id=output_record_id, test_run_id=test_run_id)
    record_id = str(output_record_id or "").strip()
    if not record_id or not record_id.startswith(RECORD_ID_PREFIX) or len(record_id) != 17:
        return {"processed": False, "reason": "missing_output_record_id", **preview}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    output_test = field_str(output, "Test_Run_ID")
    if test_run_id and output_test != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **preview}

    reason = eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    if not reason and not dry_run:
        try:
            ensure_public_cover_url(client, output)
        except Exception as exc:
            if native_grid_cover_required(output):
                return {
                    "processed": False,
                    "reason": "missing_native_cover",
                    "error": str(exc),
                    **preview,
                }
        if native_grid_cover_required(output) and not graph_fetchable_cover_url(
            field_str(output, "Thumbnail_URL")
        ):
            return {"processed": False, "reason": "missing_native_cover", **preview}
    pipeline_settings = PipelineSettings(client)
    graph_settings = None
    try:
        graph_settings = load_instagram_graph_settings(pipeline_settings, output, client=client)
    except InstagramGraphError:
        graph_settings = None
    location = resolve_publish_location(
        client,
        output,
        settings=pipeline_settings,
        token=(graph_settings or {}).get("token", ""),
        version=(graph_settings or {}).get("version", "v25.0"),
    )
    body = reel_create_body(output, location_id=(location.page_id if location else None))
    preview["eligibility_reason"] = reason
    preview["video_url"] = body.get("video_url")
    preview["has_cover_url"] = bool(body.get("cover_url"))
    preview["cover_url"] = body.get("cover_url") or ""
    preview["location"] = location.as_dict() if location else None
    preview["replace_transaction_id"] = field_str(output, "Replace_Transaction_ID")
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    creating_container = not bool(field_str(output, "Platform_Media_ID"))
    # The cover, settings and location lookup may take time. Before overwriting
    # a publishing lock, verify no review has claimed the output since the
    # initial eligibility snapshot. Existing-container resume keeps its
    # separate authoritative post-lock verification.
    if creating_container:
        try:
            prelock_reason = verify_before_reel_creation(
                client, PLATFORM_OUTPUTS_TABLE, record_id, output,
            )
        except Exception:
            prelock_reason = "review_authority_unavailable"
        if prelock_reason:
            return {"processed": False, "reason": prelock_reason, **preview}

    # The default-off Chicago pilot requires a cross-runtime R2/Airtable
    # dispatch ownership claim shared with manual Rendering Review enrollment.
    # Claim BEFORE the existing Python Airtable lock PATCH or any Graph create.
    # Existing saved-container resumes cannot enroll in Rendering Review and
    # preserve their existing receipt-only path. Other profiles are unchanged.
    if creating_container and shared_dispatch_claim_required(output.get("id")):
        try:
            if is_chicago_reel(client, output):
                claim_receipt = claim_chicago_dispatch(output)
                preview["shared_dispatch_claim_verified"] = bool(claim_receipt["ok"])
        except ReviewDispatchClaimError as exc:
            return {"processed": False, "reason": str(exc), **preview}

    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    started_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IG publish lock set at {stamp_minutes()}. "
            f"Publish asset URL: {field_str(output, 'Publish_Asset_URL')}. "
            "Cover source: public Thumbnail_URL sent as Graph cover_url (no thumb_offset)."
        ),
    )
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_By": PUBLISH_LOCKED_BY,
            "Publish_Attempt_Count": attempt,
            "Last_Publish_Attempt_At": now,
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "Publish_Locked_At": now,
            "Publish_Started_At": now,
            "Publish_Method": PUBLISH_METHOD,
            "Publish_Error_Message": "",
            "Output_Notes": started_notes,
        },
        typecast=True,
    )
    output["fields"] = {
        **(output.get("fields") or {}),
        "Output_Notes": started_notes,
        "Publish_Locked_By": PUBLISH_LOCKED_BY,
        "Publish_Locked_At": now,
        "Publish_Started_At": now,
        "Publish_Status": PUBLISH_STATUS_PUBLISHING,
    }

    # A review hold can be claimed after initial eligibility but before our
    # publish-lock PATCH. Re-read Airtable before any remote Graph create or
    # resume, not only before media_publish. Once a review wins, do not create
    # even an unpublished container or overwrite its media identity.
    try:
        review_reason = (
            verify_before_reel_creation(
                client, PLATFORM_OUTPUTS_TABLE, record_id, output,
                require_lock=True,
            )
            if creating_container
            else verify_before_reel_publication(
                client, PLATFORM_OUTPUTS_TABLE, record_id, output
            )
        )
    except Exception:
        review_reason = "review_authority_unavailable"
    if review_reason:
        preview["preflight_lock_cleared"] = _release_preflight_lock_if_exact_owner(
            client, record_id, now, reason=review_reason,
        )
        return {"processed": False, "reason": review_reason,
                "attempt_count": attempt, **preview}

    remote_side_effect_possible = bool(field_str(output, "Platform_Media_ID"))
    try:
        settings = graph_settings or load_instagram_graph_settings(pipeline_settings, output, client=client)
        graph = InstagramReelClient(
            ig_user_id=settings["ig_user_id"],
            token=settings["token"],
            version=settings["version"],
        )
        creation_id = field_str(output, "Platform_Media_ID")
        created = {"id": creation_id} if creation_id else {}
        if creation_id:
            preview["resumed_container_id"] = creation_id
        else:
            try:
                remote_side_effect_possible = True  # HTTP request may commit before the response is saved.
                created = graph.create_reel(body)
            except InstagramGraphError as exc:
                # Invalid curated/search place IDs must not block the publish.
                if body.get("location_id") and "LOCATION" in str(exc).upper():
                    body = {k: v for k, v in body.items() if k != "location_id"}
                    preview["location_tag_dropped"] = str(exc)
                    # A LOCATION rejection may trigger a second Graph create.
                    # Recheck the exact hold and lock rather than reusing
                    # authorization from the first call.
                    try:
                        retry_reason = verify_before_reel_creation(
                            client, PLATFORM_OUTPUTS_TABLE, record_id, output,
                            require_lock=True,
                        )
                    except Exception:
                        retry_reason = "review_authority_unavailable"
                    if retry_reason:
                        return {"processed": False, "reason": retry_reason,
                                "attempt_count": attempt, **preview}
                    created = graph.create_reel(body)
                else:
                    raise
            creation_id = str(created.get("id") or "").strip()
            if creation_id:
                client.update_record(
                    PLATFORM_OUTPUTS_TABLE,
                    output["id"],
                    {"Platform_Media_ID": creation_id},
                    typecast=True,
                )
                output["fields"] = {**(output.get("fields") or {}), "Platform_Media_ID": creation_id}
        try:
            graph.wait_for_container(creation_id, attempts=12, delay_s=5.0)
        except InstagramGraphError as exc:
            if _is_in_progress(exc):
                _mark_processing(client, output, creation_id, exc)
                return {
                    "processed": False,
                    "reason": "container_in_progress",
                    "creation_id": creation_id,
                    "attempt_count": attempt,
                    **preview,
                }
            raise
        # Fail closed after container polling, immediately before the public
        # side effect. Preserve container and holds for reconciliation.
        try:
            review_reason = verify_before_reel_publication(
                client, PLATFORM_OUTPUTS_TABLE, record_id, output
            )
        except Exception:
            review_reason = "review_authority_unavailable"
        if review_reason:
            preview["prepublication_lock_cleared"] = _release_preflight_lock_if_exact_owner(
                client, record_id, now, reason=review_reason,
            )
            return {"processed": False, "reason": review_reason,
                    "creation_id": creation_id, "attempt_count": attempt, **preview}
        try:
            published = graph.publish(creation_id)
        except InstagramGraphError as exc:
            if _is_in_progress(exc) or "not ready" in str(exc).lower():
                _mark_processing(client, output, creation_id, exc)
                return {
                    "processed": False,
                    "reason": "container_in_progress",
                    "creation_id": creation_id,
                    "attempt_count": attempt,
                    **preview,
                }
            raise
        media_id = str(published.get("id") or creation_id).strip()
        meta = graph.media_meta(media_id)
        permalink = str(meta.get("permalink") or created.get("permalink") or "").strip()
        if not permalink and meta.get("shortcode"):
            permalink = f"https://www.instagram.com/p/{meta['shortcode']}/"
    except Exception as exc:
        _mark_failed(client, output, exc,
                     remote_side_effect_possible=remote_side_effect_possible)
        if isinstance(exc, InstagramGraphError):
            return {
                "processed": False,
                "reason": "graph_create_failed",
                "error": str(exc),
                "attempt_count": attempt,
                **preview,
            }
        raise

    response_text = (
        "Instagram Reel publish response\n"
        f"Created Media ID: {creation_id}\n"
        f"Resolved Permalink: {permalink}\n"
        f"Get Post Media Type: {meta.get('media_type') or ''}\n"
        f"Get Post Product Type: {meta.get('media_product_type') or ''}\n"
        f"Get Post Timestamp: {meta.get('timestamp') or ''}\n"
        f"Published at: {stamp_minutes()}\n"
        f"Source URL: {field_str(output, 'Publish_Asset_URL')}\n"
        "Cover handling: AP1-IG sent the public thumbnail as Graph cover_url so Instagram uses it on the grid."
    )
    ready_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IG automated Instagram Reel publish completed at {stamp_minutes()}.\n"
            f"Instagram response ID: {creation_id}\n"
            f"Instagram permalink: {permalink}\n"
            f"Published from: {field_str(output, 'Publish_Asset_URL')}\n"
            + (
                f"Location tag: {location.label} (page_id={location.page_id}, source={location.source}).\n"
                if location and location.page_id and not preview.get("location_tag_dropped")
                else (
                    f"Location resolved as {location.label} but Meta rejected the place tag; published without it.\n"
                    if location and preview.get("location_tag_dropped")
                    else (f"Location text: {location.label} (no Meta page id).\n" if location else "")
                )
            )
            + "Cover handling: native 3D thumbnail sent as Instagram Reel cover_url for the profile grid."
        ),
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_By": "",
            "Manual_Fallback_Required": False,
            "Platform_Post_URL": permalink,
            "Platform_Publish_Response_JSON": response_text,
            "Platform_Media_ID": creation_id,
            "Published_At": iso_utc(),
            "Publish_Status": PUBLISH_STATUS_PUBLISHED,
            "Output_Status": PUBLISH_STATUS_PUBLISHED,
            "Publish_Locked_At": None,
            "Platform_Post_ID": media_id,
            "Publish_Next_Retry_At": None,
            "Publish_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "Output_Notes": ready_notes,
        },
        typecast=True,
    )
    return {
        "processed": True,
        "attempt_count": attempt,
        "creation_id": creation_id,
        "media_id": media_id,
        "permalink": permalink,
        **preview,
    }


def _is_in_progress(exc: Exception) -> bool:
    code = str(getattr(exc, "status_code", "") or "").upper()
    text = f"{exc} {getattr(exc, 'status', '')}".upper()
    return code == "IN_PROGRESS" or "STILL BEING PROCESSED" in text or "STILL IN PROGRESS" in text


def _mark_processing(
    client: AirtableClient,
    output: dict[str, Any],
    creation_id: str,
    exc: Exception,
) -> None:
    retry_at = utc_now() + timedelta(minutes=1)
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP1-IG Instagram container {creation_id} still processing at {stamp_minutes()}. "
            "Publish lock cleared; next pulse resumes wait+publish instead of creating a second Reel."
        ),
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_By": "",
            "Publish_Locked_At": None,
            "Publish_Started_At": None,
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "Platform_Media_ID": creation_id,
            "Publish_Retry_Eligible": True,
            "Publish_Next_Retry_At": iso_utc(retry_at),
            "Publish_Error_Message": "",
            "Last_Publish_Attempt_At": iso_utc(),
            "Output_Notes": notes,
        },
        typecast=True,
    )


def _mark_failed(client: AirtableClient, output: dict[str, Any], exc: Exception, *,
                 remote_side_effect_possible: bool = False) -> None:
    status_code = getattr(exc, "status_code", "") or "unknown"
    status = getattr(exc, "status", "") or str(exc) or "No status returned"
    replacing = bool(field_str(output, "Replace_Transaction_ID"))
    ambiguous = remote_side_effect_possible or bool(field_str(output, "Platform_Media_ID"))
    retry_at = utc_now() + timedelta(minutes=RETRY_MINUTES)
    retry_stamp = (chicago_now() + timedelta(minutes=RETRY_MINUTES)).strftime("%Y-%m-%d %H:%M")
    message = (f"Instagram Reel result ambiguous; provider reconciliation required. Meta status_code: {status_code}. Status: {status}"
               if ambiguous else f"Instagram Reel create failed. Meta status_code: {status_code}. Status: {status}")
    response_text = (
        ("Instagram Reel operation outcome ambiguous\n" if ambiguous else "Instagram Reel create failure\n")
        f"Media ID: {field_str(output, 'Platform_Media_ID') or 'none'}\n"
        f"Meta status_code: {status_code}\n"
        f"Meta status: {status}\n"
        f"Retry eligible: {str(not (replacing or ambiguous)).lower()}\n"
        f"Next retry: {retry_stamp}"
    )
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            (f"AP1-IG Meta Reel outcome ambiguous at {stamp_minutes()}.\n" if ambiguous
             else f"AP1-IG Meta Reel create failed at {stamp_minutes()}.\n")
            f"Status code: {status_code}\n"
            f"Status: {status}\n"
            + (
                "Publish lock cleared; Item6 replacement blocked automatic retry."
                if replacing
                else ("Publish lock cleared; ambiguous Graph side effect requires receipt reconciliation, no new create."
                      if ambiguous else f"Publish lock cleared; retry eligible after {retry_stamp}.")
            )
        ),
    )
    fields: dict[str, Any] = {
        "Publish_Locked_By": "",
        "Platform_Publish_Response_JSON": response_text,
        "Last_Publish_Attempt_At": None,
        "Publish_Locked_At": None,
        "Publish_Started_At": None,
        "Publish_Error_Message": message[:1500],
        "Output_Notes": notes,
        "Manual_Fallback_Required": replacing or ambiguous,
    }
    if replacing:
        fields.update(
            {
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Retry_Eligible": False,
                "Publish_Next_Retry_At": None,
                "Replace_State": REPLACE_CLEANUP_STATE,
                "Replace_Cleanup_State": REPLACE_CLEANUP_STATE,
                "Replace_Updated_At": iso_utc(),
                "Replace_Error": (
                    "Item6 replacement blocked automatic retry after an ambiguous Instagram Reel "
                    "create result. A platform object may already exist; reconcile or clean up before retrying."
                ),
            }
        )
    elif ambiguous:
        # A timed-out Graph create or a failure after media_publish may have
        # succeeded remotely. Preserve every saved container and prohibit an
        # unattended new Graph create until exact provider reconciliation.
        fields.update({
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "Publish_Retry_Eligible": False,
            "Publish_Next_Retry_At": None,
        })
        fields.pop("Last_Publish_Attempt_At", None)
    else:
        fields.update(
            {
                "Publish_Status": PUBLISH_STATUS_READY,
                "Publish_Retry_Eligible": True,
                "Publish_Next_Retry_At": iso_utc(retry_at),
                "Platform_Media_ID": "",
            }
        )
    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)

