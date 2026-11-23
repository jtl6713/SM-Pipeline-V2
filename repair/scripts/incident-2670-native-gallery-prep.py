"""Prepare the ten owner-repaired native galleries without releasing holds.

Exactly one gallery is admitted through the workload governor at a time.
Facebook work ends after FB0-equivalent package preparation. Instagram work
may create child containers only; this module has no parent-container or
media_publish call. A pre-call marker makes an ambiguous Graph response
operator-reconcilable rather than automatically replayable.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

LOCAL_RUNNER = Path(__file__).resolve().parents[2] / "services" / "pipeline-runner"
DEPLOYED_RUNNER = Path(r"D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner")
RUNNER = LOCAL_RUNNER if LOCAL_RUNNER.exists() else DEPLOYED_RUNNER
if str(RUNNER) not in sys.path:
    sys.path.insert(0, str(RUNNER))

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
from apc.assets import current_order, list_final_slides
from apc.graph import InstagramCarouselClient, graph_id, http_ok, load_instagram_settings
from apc.native_gallery_guard import inspect_instagram_native_v2_package
from carousel.timeutil import iso_utc
from fb.assets import list_ready_slides, native_photo_preflight_reason, package_revision
from fb.graph import load_facebook_page_settings
from item4.settings import PipelineSettings
from render.fields import field, field_str
from studio_produce.workload_governor import enabled as governor_enabled, resource_slot


OUTPUTS = {
    "recgS5wXiWnlhgVm0": (10546, "facebook", 8),
    "rec37Q0BeKga1ydGC": (10564, "instagram", 8),
    "rec1fQzlWCRm53MQ4": (10598, "facebook", 4),
    "reczJBifoU2F95yEM": (10759, "facebook", 8),
    "recNu1iOFpzuzIHEu": (10766, "facebook", 4),
    "recbqPtRfK3EZagWm": (10792, "facebook", 4),
    "recYnHtxkSljy762z": (10793, "instagram", 4),
    "recEbgk1H0rNqEr8h": (10800, "facebook", 8),
    "recr4kD97CT3X2JLX": (10802, "facebook", 4),
    "recWgwW0HYmgq4EZG": (10818, "instagram", 8),
}
MARKER = "Studio_Owner_OriginalGallery_Repair_20261122"
SAFE_MEDIA_PREFIX = "https://media.chicagoshining.com/studio/previews/lettered/"


def _fields(record: dict[str, Any]) -> dict[str, Any]:
    body = record.get("fields")
    if not isinstance(body, dict):
        raise RuntimeError("record_fields_missing")
    return body


def _assert_held(output: dict[str, Any], record_id: str, number: int) -> None:
    f = _fields(output)
    if (output.get("id") != record_id or int(f.get("Output_ID") or 0) != number
            or f.get("Do_Not_Publish") is not True
            or f.get("Auto_Publish_Enabled") is not False
            or f.get("Platform_Post_ID") or f.get("Platform_Media_ID")
            or f.get("Published_At") or f.get("Publish_Locked_At")
            or f.get("Publish_Locked_By")):
        raise RuntimeError(f"gallery_hold_or_receipt_guard_failed:{number}")
    marker = f.get("SM_Owner_OriginalGallery_SlideRebuild_20261122")
    if not isinstance(marker, dict) or marker.get("owner_explicitly_requested_repair") is not True:
        raise RuntimeError(f"gallery_owner_authorization_missing:{number}")


def _assert_slide_marker(slide: dict[str, Any], record_id: str, number: int, order: int) -> None:
    f = _fields(slide)
    marker = f.get(MARKER)
    if isinstance(marker, str):
        try:
            marker = json.loads(marker)
        except ValueError as exc:
            raise RuntimeError(f"gallery_repair_marker_invalid:{number}:{order}") from exc
    expected_url = f"{SAFE_MEDIA_PREFIX}{record_id}/{order - 1}.jpg"
    if (not isinstance(marker, dict)
            or marker.get("actor") != "owner-directed-recovery-2026-11-22"
            or marker.get("original_output_record_id") != record_id
            or int(marker.get("original_image_sequence_order") or 0) != order
            or marker.get("original_url") != expected_url
            or marker.get("new_provider_photo_ids_created") is not False
            or f.get("Approved For Final") is not True
            or f.get("Shared_Asset_Approved") is not True
            or f.get("Review Status") != "Final Approved"
            or field_str(slide, "Asset_4x5_Public_URL") != expected_url):
        raise RuntimeError(f"gallery_exact_slide_guard_failed:{number}:{order}")


def _verify_graph_identity(identity: str, token: str, version: str, *, kind: str) -> None:
    response = requests.get(
        f"https://graph.facebook.com/{version}/{identity}",
        headers={"Authorization": f"Bearer {token}"},
        params={"fields": "id"}, timeout=30,
    )
    payload = response.json() if response.content else {}
    if not response.ok or not isinstance(payload, dict) or str(payload.get("id") or "") != identity:
        raise RuntimeError(f"meta_{kind}_credential_get_failed")


def _verify_public_image(url: str) -> None:
    response = requests.get(url, timeout=45, allow_redirects=False)
    content_type = str(response.headers.get("Content-Type") or "").lower()
    body = response.content
    if (response.status_code != 200 or not content_type.startswith("image/")
            or len(body) < 10_000
            or not (body.startswith(b"\xff\xd8") or body.startswith(b"\x89PNG"))):
        raise RuntimeError("gallery_public_image_get_failed")


def _prepare_facebook(client: AirtableClient, output: dict[str, Any], number: int, expected: int) -> dict:
    record_id = str(output["id"])
    slides = list_ready_slides(client, str(number), output_record_id=record_id, max_photos=11)
    if len(slides) != expected:
        raise RuntimeError(f"facebook_gallery_count_mismatch:{number}")
    for order, slide in enumerate(slides, start=1):
        _assert_slide_marker(slide, record_id, number, order)
        if field_str(slide, "FB_Photo_ID"):
            raise RuntimeError(f"facebook_existing_photo_requires_reconciliation:{number}")
    reason = native_photo_preflight_reason(output, slides)
    if reason:
        raise RuntimeError(f"facebook_gallery_preflight_failed:{number}:{reason}")
    settings = PipelineSettings(client)
    creds = load_facebook_page_settings(settings, output, client=client)
    _verify_graph_identity(creds["page_id"], creds["token"], creds["version"], kind="facebook")
    revision = package_revision(slides)
    client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, {
        "FB_Resolved_Publish_Mode": "Multi-Photo Collage",
        "FB_Image_Publish_Mode": "Multi-Photo Collage",
        "FB_Package_Revision": revision,
        "Asset_Set_Revision": revision,
        "Assets_Ready_Count": expected,
        "FB_Photo_Count": 0,
        "FB_Photo_IDs_JSON": "",
        "FB_Publish_Status": "Ready for Photo Media",
        "Publish_Retry_Eligible": False,
    }, typecast=True)
    fresh = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    _assert_held(fresh, record_id, number)
    ff = _fields(fresh)
    if ff.get("FB_Package_Revision") != revision or int(ff.get("Assets_Ready_Count") or 0) != expected:
        raise RuntimeError(f"facebook_gallery_prep_readback_failed:{number}")
    return {"output": number, "platform": "facebook", "slides": expected,
            "credential_get": True, "provider_objects_created": 0, "hold_preserved": True}


def _prepare_instagram(client: AirtableClient, output: dict[str, Any], number: int, expected: int) -> dict:
    record_id = str(output["id"])
    slides = list_final_slides(client, str(number))
    if len(slides) != expected:
        raise RuntimeError(f"instagram_gallery_count_mismatch:{number}")
    for order, slide in enumerate(slides, start=1):
        _assert_slide_marker(slide, record_id, number, order)
        f = _fields(slide)
        url = field_str(slide, "Asset_4x5_Public_URL")
        existing = field_str(slide, "IG_Child_Container_ID")
        status = field_str(slide, "IG_Child_Container_Status").casefold()
        if not existing and status in {"creating", "in progress", "processing"}:
            raise RuntimeError(f"instagram_ambiguous_prior_child:{number}:{order}")
        if field_str(slide, "IG_Public_Asset_Status").casefold() != "ready" or field_str(slide, "IG_Public_Asset_URL") != url:
            _verify_public_image(url)
            client.update_record(CAROUSEL_SLIDES_TABLE, str(slide["id"]), {
                "IG_Public_Asset_Key": f"owner-repaired/output-{number}/slide-{order:02d}",
                "IG_Public_Asset_URL": url,
                "IG_Public_Asset_Error": "",
                "IG_Public_Asset_Status": "Ready",
                "IG_Public_Asset_Ready_At": iso_utc(),
                "IG_Carousel_Item_Ready": False,
                "IG_Carousel_Item_Revision": f"output-{number}|slide-{order}|owner-repair-20261122",
                "IG_Child_Container_Status": field_str(slide, "IG_Child_Container_Status") or "Not Created",
            }, typecast=True)
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    if inspect_instagram_native_v2_package(client, output):
        raise RuntimeError(f"instagram_gallery_staged_preflight_failed:{number}")
    settings = PipelineSettings(client)
    creds = load_instagram_settings(settings, output, client=client)
    _verify_graph_identity(creds["ig_user_id"], creds["token"], creds["version"], kind="instagram")
    graph = InstagramCarouselClient(**creds)
    slides = list_final_slides(client, str(number))
    child_ids: list[str] = []
    created = 0
    for order, slide in enumerate(slides, start=1):
        f = _fields(slide)
        existing = field_str(slide, "IG_Child_Container_ID")
        if existing:
            child_ids.append(existing)
            continue
        prior_status = field_str(slide, "IG_Child_Container_Status").casefold()
        if prior_status not in {"", "not created"}:
            raise RuntimeError(f"instagram_child_reconciliation_required:{number}:{order}")
        attempt = int(f.get("IG_Child_Container_Attempt_Count") or 0) + 1
        client.update_record(CAROUSEL_SLIDES_TABLE, str(slide["id"]), {
            "IG_Child_Container_Status": "Creating",
            "IG_Child_Container_Attempt_Count": attempt,
            "IG_Child_Container_Error": "",
            "IG_Child_Container_Last_Checked_At": iso_utc(),
        }, typecast=True)
        status_code, payload = graph.create_child(field_str(slide, "IG_Public_Asset_URL"))
        child_id = graph_id(payload)
        if not http_ok(status_code) or not child_id:
            client.update_record(CAROUSEL_SLIDES_TABLE, str(slide["id"]), {
                "IG_Child_Container_Status": "Reconcile Required",
                "IG_Child_Container_Error": f"HTTP {status_code}; operator reconciliation required",
                "IG_Child_Container_Response_JSON": json.dumps(payload, separators=(",", ":")),
            }, typecast=True)
            raise RuntimeError(f"instagram_child_creation_unconfirmed:{number}:{order}")
        client.update_record(CAROUSEL_SLIDES_TABLE, str(slide["id"]), {
            "IG_Child_Container_ID": child_id,
            "IG_Child_Container_Status": "IN_PROGRESS",
            "IG_Child_Container_Created_At": iso_utc(),
            "IG_Child_Container_Response_JSON": json.dumps(payload, separators=(",", ":")),
            "IG_Child_Container_Last_Checked_At": iso_utc(),
        }, typecast=True)
        child_ids.append(child_id)
        created += 1
    if len(child_ids) != expected or len(set(child_ids)) != expected:
        raise RuntimeError(f"instagram_child_count_or_identity_failed:{number}")
    client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, {
        "IG_Carousel_Status": "Children Processing",
        "IG_Carousel_Child_Count": expected,
        "IG_Carousel_Children_Ready_Count": 0,
        "IG_Carousel_Last_Completed_Stage": "AP1C_CHILDREN_ONLY_HELD",
        "IG_Carousel_Children_JSON": json.dumps({
            "created_count": expected, "held": True,
            "parent_created": False, "verified_at": iso_utc(),
        }, separators=(",", ":")),
        "Publish_Retry_Eligible": False,
    }, typecast=True)
    fresh = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    _assert_held(fresh, record_id, number)
    return {"output": number, "platform": "instagram", "slides": expected,
            "credential_get": True, "child_containers": expected,
            "created_now": created, "parent_containers": 0,
            "published_posts": 0, "hold_preserved": True}



def _preflight_all(client: AirtableClient) -> None:
    """Fail the entire approved cohort before any external provider or canonical write.

    Checking each gallery only during its mutation could create Instagram child
    containers for the first eight before discovering missing output #10802.
    This read-only pass verifies exact output holds, owner authorization, the
    entire 60-slide identity/order, and existing provider identities upfront.
    Per-output guards remain mandatory during the subsequent execution.
    """
    for record_id, (number, platform, expected) in OUTPUTS.items():
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
        _assert_held(output, record_id, number)
        if platform == "facebook":
            slides = list_ready_slides(
                client, str(number), output_record_id=record_id, max_photos=11,
            )
        elif platform == "instagram":
            slides = list_final_slides(client, str(number))
        else:
            raise RuntimeError(f"gallery_unsupported_platform:{number}")
        if len(slides) != expected:
            raise RuntimeError(f"gallery_batch_preflight_count_mismatch:{number}:{len(slides)}:{expected}")
        existing_children = []
        for order, slide in enumerate(slides, start=1):
            _assert_slide_marker(slide, record_id, number, order)
            if platform == "facebook" and field_str(slide, "FB_Photo_ID"):
                raise RuntimeError(f"gallery_batch_existing_fb_photo_reconcile:{number}:{order}")
            if platform == "instagram":
                child = field_str(slide, "IG_Child_Container_ID")
                status = field_str(slide, "IG_Child_Container_Status").casefold()
                if child:
                    existing_children.append(child)
                elif status not in {"", "not created"}:
                    raise RuntimeError(f"gallery_batch_ambiguous_ig_child_reconcile:{number}:{order}")
        if len(existing_children) != len(set(existing_children)):
            raise RuntimeError(f"gallery_batch_duplicate_ig_children:{number}")
        if platform == "facebook":
            reason = native_photo_preflight_reason(output, slides)
            if reason:
                raise RuntimeError(f"gallery_batch_facebook_preflight_failed:{number}:{reason}")
    print(f"native_gallery_batch_preflight_passed=outputs:{len(OUTPUTS)},slides:{sum(x[2] for x in OUTPUTS.values())}")


def main() -> int:
    if not governor_enabled():
        raise RuntimeError("workload_governor_required")
    if os.environ.get("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "").lower() in {"1", "true", "yes"}:
        raise RuntimeError("recovery_read_only_still_active")
    client = AirtableClient()
    _preflight_all(client)  # all ten must pass before any provider or canonical mutation
    results = []
    for record_id, (number, platform, expected) in OUTPUTS.items():
        with resource_slot("incident_2670_native_gallery_prep", limit=1):
            output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
            _assert_held(output, record_id, number)
            result = (_prepare_facebook(client, output, number, expected)
                      if platform == "facebook"
                      else _prepare_instagram(client, output, number, expected))
            results.append(result)
            print("native_gallery_prepared=" + json.dumps(result, separators=(",", ":")))
    summary = {
        "ok": len(results) == 10,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "outputs": len(results),
        "slides": sum(int(row["slides"]) for row in results),
        "facebook_photo_sets": sum(row["platform"] == "facebook" for row in results),
        "instagram_carousels": sum(row["platform"] == "instagram" for row in results),
        "hold_releases": 0,
        "published_posts": 0,
    }
    print("native_gallery_recovery_summary=" + json.dumps(summary, separators=(",", ":")))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
