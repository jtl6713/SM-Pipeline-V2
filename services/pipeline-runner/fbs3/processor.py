"""FBS3 processor — Facebook Reel video_reels publish (Make 5816502)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, utc_now
from ap0.eligibility import asset_plan
from ap0.public_mp4 import ensure_public_mp4_url, is_public_publish_url
from fbs3.caption import cache_busted_public_url, public_mp4_url, reel_description, reel_title
from fbs3.constants import (
    FB_PUBLISH_PUBLISHING,
    FB_PUBLISH_RETRY,
    FINISH_RETRY_MINUTES,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PUBLISH_LOCKED_BY,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    RETRY_MINUTES,
    STATUS_INITIALIZING,
    STATUS_PROCESSING,
    STATUS_RETRY_PENDING,
    STATUS_UPLOADING,
)
from fbs3.eligibility import create_eligibility_reason
from fbs3.graph import FacebookReelClient, FacebookReelError, load_facebook_reel_settings
from item4.settings import PipelineSettings
from render.fields import field, field_str

RECORD_ID_PREFIX = "rec"

_PUBLIC_MESSAGES = {
    "FBS3_INIT": "Facebook did not create a Reel upload session.",
    "FBS3_UPLOAD": "Facebook did not accept the hosted slideshow MP4.",
    "FBS3_FINISH": "Facebook rejected the Reel finish request.",
    "FBS3_AMBIGUOUS": "Facebook Reel finish outcome was ambiguous.",
}


def _ensure_public_reel_mp4(client, output: dict[str, Any]) -> bool:
    if is_public_publish_url(public_mp4_url(output)):
        return False
    plan = asset_plan(output)
    public = ensure_public_mp4_url(client, output, plan)
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Asset_URL": public,
            "FB_Slideshow_Public_URL": public,
            "Publish_Asset_File_Name": plan["publish_asset_file_name"],
            "FB_Slideshow_Meta_Video_ID": "",
            "FB_Slideshow_Meta_Upload_URL": "",
        },
        typecast=True,
    )
    fields = output.setdefault("fields", {})
    fields["Publish_Asset_URL"] = public
    fields["FB_Slideshow_Public_URL"] = public
    fields["Publish_Asset_File_Name"] = plan["publish_asset_file_name"]
    fields["FB_Slideshow_Meta_Video_ID"] = ""
    fields["FB_Slideshow_Meta_Upload_URL"] = ""
    return True


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "Facebook",
        "format": "Reel",
    }


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = _preview(output_record_id=output_record_id, test_run_id=test_run_id)
    record_id = str(output_record_id or "").strip()
    if not record_id or not record_id.startswith(RECORD_ID_PREFIX) or len(record_id) != 17:
        return {"processed": False, "reason": "missing_output_record_id", **preview}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    if test_run_id and field_str(output, "Test_Run_ID") != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **preview}

    try:
        staged = _ensure_public_reel_mp4(client, output)
        if staged:
            preview["video_url"] = cache_busted_public_url(output)
    except Exception as exc:
        preview["stage_error"] = str(exc)

    reason = create_eligibility_reason(output)
    video_url = cache_busted_public_url(output)
    preview["eligibility_reason"] = reason
    preview["video_url"] = video_url
    preview["resume"] = bool(field_str(output, "FB_Slideshow_Meta_Video_ID"))
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    attempt = (parse_int(field(output, "FB_Slideshow_Attempt_Count"), 0) or 0) + 1
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": PUBLISH_LOCKED_BY,
            "FB_Slideshow_Status": STATUS_INITIALIZING,
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Attempt_Count": attempt,
            "FB_Slideshow_Last_Checked_At": now,
        },
        typecast=True,
    )

    video_id = field_str(output, "FB_Slideshow_Meta_Video_ID")
    upload_url = field_str(output, "FB_Slideshow_Meta_Upload_URL")
    try:
        settings = load_facebook_reel_settings(PipelineSettings(client))
        graph = FacebookReelClient(
            page_id=settings["page_id"],
            token=settings["token"],
            version=settings["version"],
        )
        if not video_id:
            started = graph.start_session()
            video_id = str(started.get("video_id") or "").strip()
            upload_url = str(started.get("upload_url") or "").strip()
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                {
                    "FB_Slideshow_Status": STATUS_UPLOADING,
                    "FB_Slideshow_Error_Message": "",
                    "FB_Slideshow_Meta_Video_ID": video_id,
                    "FB_Slideshow_Meta_Upload_URL": upload_url,
                    "FB_Slideshow_Response_JSON": str(started),
                },
                typecast=True,
            )
        elif not upload_url:
            raise FacebookReelError(
                "missing upload session URL",
                status_code=400,
                payload={"error": {"message": "stored video_id has no upload_url"}},
                stage="FBS3_INIT",
            )
        payload = graph.download_mp4(video_url)
        graph.upload_mp4(upload_url, payload)
        finished = graph.finish(
            video_id=video_id,
            description=reel_description(output),
            title=reel_title(output),
        )
    except FacebookReelError as exc:
        return _mark_graph_failed(client, output, exc, video_id=video_id, preview=preview, attempt=attempt)

    _mark_processing(client, output, video_id, finished)
    return {
        "processed": True,
        "needs_poll": True,
        "attempt_count": attempt,
        "video_id": video_id,
        **preview,
    }


def _http_code(exc: FacebookReelError) -> int:
    if str(exc.status_code).isdigit():
        return int(exc.status_code)
    return 0


def _unlock_retry(
    *,
    stage: str,
    message: str,
    detail: str,
    payload: Any,
    minutes: int = RETRY_MINUTES,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "Publish_Status": PUBLISH_STATUS_FAILED,
        "FB_Publish_Status": FB_PUBLISH_RETRY,
        "Publish_Locked_At": None,
        "Publish_Locked_By": "",
        "Publish_Started_At": None,
        "FB_Slideshow_Status": STATUS_RETRY_PENDING,
        "Publish_Error_Stage": stage,
        "Publish_Error_Message": message,
        "Publish_Next_Retry_At": iso_utc(utc_now() + timedelta(minutes=minutes)),
        "Publish_Retry_Eligible": True,
        "FB_Slideshow_Error_Message": detail[:1500],
        "FB_Slideshow_Response_JSON": str(payload),
    }
    if extra:
        fields.update(extra)
    return fields


def _mark_graph_failed(
    client: AirtableClient,
    output: dict[str, Any],
    exc: FacebookReelError,
    *,
    video_id: str,
    preview: dict[str, Any],
    attempt: int,
) -> dict[str, Any]:
    code = _http_code(exc)
    stage = exc.stage if exc.stage in _PUBLIC_MESSAGES else "FBS3_FINISH"
    if stage == "FBS3_FINISH" and (code >= 500 or not code):
        stage = "FBS3_AMBIGUOUS"
        fields = _unlock_retry(
            stage=stage,
            message=_PUBLIC_MESSAGES[stage],
            detail=f"FBS3 finish outcome was ambiguous; FBS4 will reconcile by reading the video status. {exc}",
            payload=exc.payload,
            minutes=0,
            extra={
                "Publish_Status": PUBLISH_STATUS_PUBLISHING,
                "Platform_Post_ID": video_id,
                "FB_Publish_Status": FB_PUBLISH_PUBLISHING,
                "FB_Slideshow_Status": STATUS_PROCESSING,
                "Publish_Next_Retry_At": iso_utc(),
                "FB_Slideshow_Meta_Video_ID": video_id,
            },
        )
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
        return {
            "processed": True,
            "needs_poll": True,
            "ambiguous": True,
            "attempt_count": attempt,
            "video_id": video_id,
            **preview,
        }

    fields = _unlock_retry(
        stage=stage,
        message=_PUBLIC_MESSAGES[stage],
        detail=f"FBS3 {stage} failed. HTTP {exc.status_code}: {exc}",
        payload=exc.payload,
    )
    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
    return {
        "processed": False,
        "reason": "graph_failed",
        "error": str(exc),
        "attempt_count": attempt,
        **preview,
    }


def _mark_processing(client: AirtableClient, output: dict[str, Any], video_id: str, finished: dict[str, Any]) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "Platform_Post_ID": video_id,
            "FB_Publish_Status": FB_PUBLISH_PUBLISHING,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_PROCESSING,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": iso_utc(utc_now() + timedelta(minutes=FINISH_RETRY_MINUTES)),
            "Publish_Retry_Eligible": True,
            "FB_Slideshow_Error_Message": "",
            "FB_Slideshow_Meta_Video_ID": video_id,
            "FB_Slideshow_Response_JSON": (
                f"{finished} Cover handling: Facebook Reels API does not expose a generated cover "
                "image parameter in this route; FBS3 uses cache-busted repaired MP4 and R4 non-black first-frame fallback."
            ),
            "FB_Slideshow_Last_Checked_At": iso_utc(),
        },
        typecast=True,
    )
