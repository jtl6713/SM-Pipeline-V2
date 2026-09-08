"""R5 processor — poll Remotion, upload final, cache preview (Make 5565333)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from config import load_settings
from integrations.google_drive import GoogleDriveClient
from item4.settings import PipelineSettings
from r5.constants import COMPLETE_STATUSES, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, MAX_RECORDS, R5_VIEW
from r5.formulas import r5_exact_output_formula, r5_production_formula
from render.fields import field_str
from render.remotion_client import RemotionClient
from render.settings import get_google_drive_folder_id, get_render_server_url


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _status_payload(status: dict[str, Any]) -> dict[str, Any]:
    return status.get("data") if isinstance(status.get("data"), dict) else status


def review_fields_after_successful_render(output: dict[str, Any]) -> dict[str, str]:
    """Put a remix/revision back on the review board after the new preview lands."""
    current = field_str(output, "Review_Status").lower()
    if current == "changes requested":
        return {"Review_Status": "Review Sent"}
    return {}


def _classify_status(status: dict[str, Any]) -> str:
    payload = _status_payload(status)
    raw = str(payload.get("status") or "").strip().lower()
    if raw in COMPLETE_STATUSES:
        render_url = str(payload.get("renderUrl") or "").strip()
        if render_url:
            return "complete"
    if raw == "failed":
        return "failed"
    return "processing"


def select_outputs(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = MAX_RECORDS,
) -> list[dict[str, Any]]:
    if output_record_id:
        formula = r5_exact_output_formula(output_record_id, test_run_id or "")
        max_records = 1
        return client.list_records(
            PLATFORM_OUTPUTS_TABLE,
            formula=formula,
            max_records=max_records,
        )
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        view=R5_VIEW,
        formula=r5_production_formula(),
        max_records=max_records,
    )


def _preview_settings(client: AirtableClient) -> tuple[str, str, str, str]:
    settings = PipelineSettings(client)
    runtime = load_settings()
    upload_url = settings.get("R2_UPLOAD_WORKER_URL") or runtime.get("r2_upload_worker_url") or ""
    upload_secret = settings.get("R2_UPLOAD_WORKER_SECRET") or runtime.get("r2_upload_worker_secret") or ""
    prefix = (
        settings.get("STUDIO_PREVIEW_R2_PREFIX")
        or runtime.get("studio_preview_r2_prefix")
        or "studio/previews"
    ).strip("/")
    public_base = settings.get("STUDIO_PREVIEW_PUBLIC_BASE_URL") or "https://media.chicagoshining.com"
    return upload_url.rstrip("/"), upload_secret, prefix, public_base.rstrip("/")


def _upload_preview(
    client: AirtableClient,
    *,
    output_id: str,
    content: bytes,
) -> tuple[str, str]:
    upload_url, upload_secret, prefix, public_base = _preview_settings(client)
    if not upload_url or not upload_secret:
        raise RuntimeError("R2 preview upload settings are not configured")

    key = f"{prefix}/{output_id}/current.mp4"
    import requests

    response = requests.put(
        upload_url,
        params={"key": key},
        data=content,
        headers={
            "x-pipeline-secret": upload_secret,
            "Content-Type": "video/mp4",
        },
        timeout=600,
    )
    if not response.ok:
        raise RuntimeError(f"R2 preview upload failed ({response.status_code}): {response.text[:300]}")
    return key, f"{public_base}/{key}"


def process_one_output(
    client: AirtableClient,
    output: dict[str, Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    status_url = field_str(output, "Remotion_Status_URL")
    if not status_url:
        return {
            "processed": False,
            "reason": "missing_remotion_status_url",
            "output_record_id": output["id"],
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    remotion = RemotionClient(get_render_server_url(client))
    status = remotion.get_status(status_url)
    route = _classify_status(status)
    payload = _status_payload(status)

    preview = {
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "route": route,
        "remotion_status": payload.get("status"),
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
    }

    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    if route == "processing":
        return {"processed": False, "reason": "still_rendering", **preview}

    if route == "failed":
        error = str(payload.get("error") or payload.get("message") or "Renderer reported failed status.")
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Render_Status": "Failed",
                "Remotion_Error_Message": error,
                "Final_File_Error_Message": f"Render failed before Google Drive upload: {error}",
            },
        )
        return {"processed": True, "route": "failed", **preview}

    render_url = str(payload.get("renderUrl") or field_str(output, "Render_Server_URL"))
    job_id = str(payload.get("jobId") or field_str(output, "Remotion_Job_ID"))

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Render_Status": "Rendering",
            "Final_File_Storage_Status": "Uploading",
            "Final_File_Error_Message": "",
            "Remotion_Error_Message": "",
            "Output_Status": "In Production",
            "Output_Filename": field_str(output, "Output_Filename"),
            "Remotion_Props_JSON": field_str(output, "Remotion_Props_JSON"),
            "Render_Server_URL": render_url,
            "Remotion_Job_ID": job_id,
            "Remotion_Status_URL": status_url,
        },
    )

    try:
        mp4_bytes = remotion.download_render(render_url)
        drive = GoogleDriveClient()
        folder_id = get_google_drive_folder_id(client)
        drive_file = drive.upload_file(
            folder_id,
            field_str(output, "Output_Filename") or f"{output['id']}.mp4",
            mp4_bytes,
            "video/mp4",
        )
        file_id = str(drive_file.get("id") or "")
        drive_link = f"https://drive.google.com/file/d/{file_id}/view" if file_id else ""

        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Final_File_Error_Message": "",
                "Remotion_Error_Message": "",
                "Final_File_ID": file_id,
                "Output_Status": "Ready for Review",
                "Output_Filename": field_str(output, "Output_Filename"),
                "Final_File_Storage_Status": "Uploaded",
                "Render_Server_URL": render_url,
                "Output_URL": drive_link,
                "Remotion_Job_ID": job_id,
                "Final_File_URL": drive_link,
                "Remotion_Status_URL": status_url,
                "Render_Status": "Rendered",
                **review_fields_after_successful_render(output),
            },
        )

        remotion.cleanup_job(job_id, filename=field_str(output, "Output_Filename") or None)

        preview_key, preview_url = _upload_preview(client, output_id=output["id"], content=mp4_bytes)
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Studio_Preview_URL": preview_url,
                "Studio_Preview_R2_Key": preview_key,
                "Studio_Preview_Updated_At": _now_iso(),
            },
        )
    except Exception as exc:
        message = str(exc) or "Render completed, but final Google Drive upload did not complete."
        existing_url = field_str(output, "Final_File_URL")
        if existing_url and "404" in message.lower():
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                output["id"],
                {
                    "Render_Status": "Rendered",
                    "Output_Status": "Ready for Review",
                    "Final_File_Error_Message": "",
                    "Remotion_Error_Message": "",
                    **review_fields_after_successful_render(output),
                },
                typecast=True,
            )
            return {
                "processed": True,
                "route": "complete",
                "drive_file_id": field_str(output, "Final_File_ID"),
                "studio_preview_url": field_str(output, "Studio_Preview_URL"),
                **preview,
            }
        transient = any(
            needle in message.lower()
            for needle in (
                "timed out",
                "timeout",
                "connection reset",
                "connection aborted",
                "remote disconnected",
                "connectionpool",
                "temporarily unavailable",
                "404",
                "502",
                "503",
                "504",
            )
        )
        # Keep Remotion's completed job harvestable. A read-timeout while copying
        # the MP4 must not permanently mark the output Failed / Blocked.
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Render_Status": "Rendering" if transient else "Failed",
                "Final_File_Error_Message": message,
                "Output_Status": "In Production",
            },
        )
        raise

    return {
        "processed": True,
        "route": "complete",
        "drive_file_id": file_id,
        "studio_preview_url": preview_url,
        **preview,
    }


def process_one(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    if output_record_id:
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, output_record_id)
        output_test = field_str(output, "Test_Run_ID")
        if test_run_id and output_test != test_run_id:
            return {
                "processed": False,
                "reason": "no_rendering_platform_output",
                "make_scenario_id": MAKE_SCENARIO_ID,
            }
        if not test_run_id and output_test:
            return {
                "processed": False,
                "reason": "no_rendering_platform_output",
                "make_scenario_id": MAKE_SCENARIO_ID,
            }
        return process_one_output(client, output, dry_run=dry_run)
    outputs = select_outputs(
        client,
        test_run_id=test_run_id,
        max_records=1,
    )
    if not outputs:
        return {
            "processed": False,
            "reason": "no_rendering_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }
    return process_one_output(client, outputs[0], dry_run=dry_run)


def process_batch(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_runs: int = MAX_RECORDS,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    client = AirtableClient()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=max_runs,
    )
    if not outputs:
        return [
            {
                "processed": False,
                "reason": "no_rendering_platform_output",
                "make_scenario_id": MAKE_SCENARIO_ID,
            }
        ]
    return [process_one_output(client, row, dry_run=dry_run) for row in outputs]
