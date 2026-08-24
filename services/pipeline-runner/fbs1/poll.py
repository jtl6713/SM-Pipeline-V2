"""FBS2 processor — poll slideshow render or stage an existing R5 MP4 (Make 5816495)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, utc_now
from fbs1.constants import (
    COMPLETE_STATUSES,
    DEFAULT_PUBLIC_BASE,
    DEFAULT_R2_PREFIX,
    FAILED_STATUSES,
    FB_PUBLISH_READY,
    FB_PUBLISH_RENDERING,
    FB_PUBLISH_RETRY,
    MAKE_POLL_SCENARIO_ID,
    MAKE_POLL_SCENARIO_NAME,
    POLL_LOCKED_BY,
    POLL_RETRY_MINUTES,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    PUBLISH_STATUS_READY,
    RETRY_MINUTES,
    STAGE_LOCKED_BY,
    STATUS_RENDERING,
    STATUS_RETRY_PENDING,
    STATUS_STAGING,
    STATUS_VIDEO_READY,
)
from fbs1.eligibility import poll_eligibility_reason, stage_eligibility_reason
from integrations.google_drive import GoogleDriveClient
from item4.settings import PipelineSettings
from render.fields import field, field_str
from render.remotion_client import RemotionClient
from render.settings import get_google_drive_folder_id, get_render_server_url

RECORD_ID_PREFIX = "rec"


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_POLL_SCENARIO_ID,
        "make_scenario_name": MAKE_POLL_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "platform": "Facebook",
        "format": "Slideshow Reel",
    }


def _slideshow_settings(client: AirtableClient) -> dict[str, str]:
    settings = PipelineSettings(client)
    runtime_upload = settings.get("R2_UPLOAD_WORKER_URL") or ""
    runtime_secret = settings.get("R2_UPLOAD_WORKER_SECRET") or ""
    from config import load_settings

    runtime = load_settings()
    return {
        "folder_id": settings.get("RENDERED_PLATFORM_OUTPUTS_FOLDER_ID") or get_google_drive_folder_id(client),
        "r2_prefix": (settings.get("FB_SLIDESHOW_R2_PREFIX") or DEFAULT_R2_PREFIX).strip("/"),
        "public_base": (settings.get("FB_SLIDESHOW_PUBLIC_BASE_URL") or DEFAULT_PUBLIC_BASE).rstrip("/"),
        "upload_url": (settings.get("R2_UPLOAD_WORKER_URL") or runtime.get("r2_upload_worker_url") or runtime_upload).rstrip("/"),
        "upload_secret": settings.get("R2_UPLOAD_WORKER_SECRET") or runtime.get("r2_upload_worker_secret") or runtime_secret,
    }


def _upload_r2(*, upload_url: str, upload_secret: str, key: str, content: bytes) -> tuple[int, Any]:
    response = requests.put(
        upload_url,
        params={"key": key},
        data=content,
        headers={"x-pipeline-secret": upload_secret, "Content-Type": "video/mp4"},
        timeout=300,
    )
    data = response.json() if response.content and "json" in (response.headers.get("Content-Type") or "") else (response.text[:500] if response.content else {})
    return response.status_code, data


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

    poll_reason = poll_eligibility_reason(output)
    stage_reason = stage_eligibility_reason(output)
    preview["poll_reason"] = poll_reason
    preview["stage_reason"] = stage_reason
    if poll_reason and stage_reason:
        return {"processed": False, "reason": poll_reason, **preview}
    route = "poll" if not poll_reason else "stage"
    preview["route"] = route
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}
    if route == "poll":
        return _process_poll(client, output, preview)
    return _process_stage(client, output, preview)


def _process_poll(client: AirtableClient, output: dict[str, Any], preview: dict[str, Any]) -> dict[str, Any]:
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": POLL_LOCKED_BY,
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Last_Checked_At": now,
        },
        typecast=True,
    )
    status_url = field_str(output, "FB_Slideshow_Render_Status_URL")
    remotion = RemotionClient(get_render_server_url(client))
    try:
        status = remotion.get_status(status_url)
    except Exception as exc:
        _mark_still_rendering(client, output, {"error": str(exc)})
        return {"processed": True, "still_processing": True, "error": str(exc), **preview}

    payload = status.get("data") if isinstance(status.get("data"), dict) else status
    raw = _ci(payload.get("status"))
    render_url = str(payload.get("renderUrl") or field_str(output, "FB_Slideshow_Render_URL")).strip()
    preview["remotion_status"] = payload.get("status")
    if raw in COMPLETE_STATUSES and render_url:
        return _store_rendered_mp4(client, output, payload, render_url, preview)
    if raw in FAILED_STATUSES:
        _mark_retry(
            client,
            output,
            stage="FBS2_RENDER_FAILED",
            message="The Facebook slideshow render server reported failure.",
            detail=f"FBS2 render failed. {payload.get('error') or payload}",
            payload=payload,
        )
        return {"processed": False, "reason": "render_failed", **preview}
    _mark_still_rendering(client, output, payload)
    return {"processed": True, "still_processing": True, **preview}


def _store_rendered_mp4(
    client: AirtableClient,
    output: dict[str, Any],
    payload: dict[str, Any],
    render_url: str,
    preview: dict[str, Any],
) -> dict[str, Any]:
    settings = _slideshow_settings(client)
    remotion = RemotionClient(get_render_server_url(client))
    try:
        content = remotion.download_render(render_url)
    except Exception as exc:
        _mark_retry(
            client,
            output,
            stage="FBS2_STORAGE",
            message="FBS2 could not store the completed slideshow MP4.",
            detail=f"FBS2 storage failed. Drive file missing; download error {exc}",
            payload={"error": str(exc)},
        )
        return {"processed": False, "reason": "storage_failed", "error": str(exc), **preview}

    output_id = field_str(output, "Output_ID") or output["id"]
    filename = f"facebook-slideshow-output-{output_id}.mp4"
    revision = field_str(output, "FB_Package_Revision") or "current"
    key = f"{settings['r2_prefix']}/platform-output-{output_id}-{revision[:12]}.mp4"
    public_url = f"{settings['public_base']}/{key}"
    drive_id = ""
    try:
        drive = GoogleDriveClient()
        uploaded = drive.upload_file(settings["folder_id"], filename, content, "video/mp4")
        drive_id = str(uploaded.get("id") or "").strip()
    except Exception:
        drive_id = ""
    status_code, r2_data = _upload_r2(
        upload_url=settings["upload_url"],
        upload_secret=settings["upload_secret"],
        key=key,
        content=content,
    )
    if not drive_id or not (200 <= status_code <= 299):
        _mark_retry(
            client,
            output,
            stage="FBS2_STORAGE",
            message="FBS2 could not store the completed slideshow MP4.",
            detail=f"FBS2 storage failed. Drive file {drive_id or 'missing'}; R2 HTTP {status_code}.",
            payload=r2_data,
        )
        return {"processed": False, "reason": "storage_failed", "status_code": status_code, **preview}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Final_File_ID": drive_id,
            "Render_Status": "Rendered",
            "Final_File_URL": f"https://drive.google.com/file/d/{drive_id}/view",
            "Publish_Status": PUBLISH_STATUS_READY,
            "Final_File_Name": filename,
            "FB_Publish_Status": FB_PUBLISH_READY,
            "Publish_Asset_URL": public_url,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Asset_Host": "Cloudflare R2",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_VIDEO_READY,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Asset_Ready_At": iso_utc(),
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Public_URL": public_url,
            "FB_Slideshow_Render_URL": render_url,
            "Publish_Asset_File_Name": filename,
            "Final_File_Storage_Status": "Uploaded",
            "FB_Slideshow_Drive_File_ID": drive_id,
            "FB_Slideshow_Error_Message": "",
            "FB_Slideshow_Response_JSON": str(r2_data),
            "Publish_Asset_Error_Message": "",
            "FB_Slideshow_Drive_File_Name": filename,
        },
        typecast=True,
    )
    return {"processed": True, "public_url": public_url, "drive_file_id": drive_id, **preview}


def _process_stage(client: AirtableClient, output: dict[str, Any], preview: dict[str, Any]) -> dict[str, Any]:
    now = iso_utc()
    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_LOCKED_BY,
            "Publish_Started_At": now,
            "FB_Slideshow_Status": STATUS_STAGING,
            "Publish_Error_Stage": "",
            "Publish_Attempt_Count": attempt,
            "Publish_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
            "FB_Slideshow_Error_Message": "",
            "Publish_Asset_Error_Message": "",
        },
        typecast=True,
    )
    settings = _slideshow_settings(client)
    output_id = field_str(output, "Output_ID") or output["id"]
    key = f"{settings['r2_prefix']}/platform-output-{output_id}.mp4"
    public_url = f"{settings['public_base']}/{key}"
    try:
        content, _mime = GoogleDriveClient().download_file(field_str(output, "Final_File_ID"))
    except Exception as exc:
        _mark_retry(
            client,
            output,
            stage="FBS2_DIRECT_DRIVE",
            message="FBS2 could not download the existing final MP4 from Google Drive.",
            detail=f"FBS2 direct final-MP4 staging could not download Final_File_ID {field_str(output, 'Final_File_ID')}.",
            payload={"error": str(exc)},
        )
        return {"processed": False, "reason": "drive_download_failed", "error": str(exc), **preview}
    if not content:
        _mark_retry(
            client,
            output,
            stage="FBS2_DIRECT_DRIVE",
            message="FBS2 could not download the existing final MP4 from Google Drive.",
            detail=f"FBS2 direct final-MP4 staging could not download Final_File_ID {field_str(output, 'Final_File_ID')}.",
        )
        return {"processed": False, "reason": "drive_download_failed", **preview}

    try:
        status_code, r2_data = _upload_r2(
            upload_url=settings["upload_url"],
            upload_secret=settings["upload_secret"],
            key=key,
            content=content,
        )
    except Exception as exc:
        _mark_retry(
            client,
            output,
            stage="FBS2_DIRECT_STORAGE",
            message="FBS2 final MP4 R2 upload encountered a runtime failure.",
            detail=f"FBS2 direct final-MP4 R2 upload runtime failure for {key}.",
            payload={"error": str(exc)},
        )
        return {"processed": False, "reason": "r2_upload_failed", "error": str(exc), **preview}

    if not (200 <= status_code <= 299):
        _mark_retry(
            client,
            output,
            stage="FBS2_DIRECT_STORAGE",
            message="FBS2 could not stage the existing final MP4 to R2.",
            detail=f"FBS2 direct final-MP4 staging failed. R2 HTTP {status_code}.",
            payload=r2_data,
        )
        return {"processed": False, "reason": "r2_upload_failed", "status_code": status_code, **preview}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Status": PUBLISH_STATUS_READY,
            "FB_Publish_Status": FB_PUBLISH_READY,
            "Publish_Asset_URL": public_url,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Asset_Host": "Cloudflare R2",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_VIDEO_READY,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Asset_Ready_At": iso_utc(),
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Public_URL": public_url,
            "Publish_Asset_File_Name": f"platform-output-{output_id}.mp4",
            "FB_Slideshow_Error_Message": "",
            "FB_Slideshow_Response_JSON": str(r2_data),
            "Publish_Asset_Error_Message": "",
        },
        typecast=True,
    )
    return {"processed": True, "public_url": public_url, "attempt_count": attempt, **preview}


def _mark_still_rendering(client: AirtableClient, output: dict[str, Any], payload: dict[str, Any]) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "FB_Publish_Status": FB_PUBLISH_RENDERING,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_RENDERING,
            "Publish_Next_Retry_At": iso_utc(utc_now() + timedelta(minutes=POLL_RETRY_MINUTES)),
            "Publish_Retry_Eligible": True,
            "FB_Slideshow_Response_JSON": str(payload),
            "FB_Slideshow_Last_Checked_At": iso_utc(),
        },
        typecast=True,
    )


def _mark_retry(
    client: AirtableClient,
    output: dict[str, Any],
    *,
    stage: str,
    message: str,
    detail: str,
    payload: Any = None,
) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "FB_Publish_Status": FB_PUBLISH_RETRY,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_RETRY_PENDING,
            "Publish_Error_Stage": stage,
            "Publish_Error_Message": message,
            "Publish_Next_Retry_At": iso_utc(utc_now() + timedelta(minutes=RETRY_MINUTES)),
            "Publish_Retry_Eligible": True,
            "FB_Slideshow_Error_Message": detail[:1500],
            "FB_Slideshow_Response_JSON": "" if payload is None else str(payload),
            "Publish_Asset_Error_Message": message,
        },
        typecast=True,
    )
