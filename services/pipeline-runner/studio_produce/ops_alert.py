"""Catastrophic produce failure notifications (email + optional investigate webhook)."""

from __future__ import annotations

import html
import json
import logging
from typing import Any

import requests

from config import load_settings
from integrations.gmail import GmailClient
from studio_produce.constants import HEAL_MAX_RESUMES

logger = logging.getLogger("pipeline-runner.studio-produce.ops-alert")

DEFAULT_OPS_EMAIL_TO = "chicagoshining@gmail.com"
STUDIO_REQUEST_URL = "https://studio.chicagoshining.com/"
# Produce failures stay in Studio / the desk. Do not send escalation Gmail.
OPS_ALERT_EMAIL_ENABLED = False


def _html_escape(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def build_escalation_email(*, request_id: str, job: dict[str, Any], outputs: list[dict[str, Any]] | None = None) -> tuple[str, str]:
    heal = job.get("heal") if isinstance(job.get("heal"), dict) else {}
    error = str(job.get("error") or heal.get("last_block_error") or "Unknown produce failure")
    subject = f"[Studio] Produce escalated after {heal.get('resume_count') or HEAL_MAX_RESUMES} retries — {request_id}"
    output_rows = []
    for row in outputs or []:
        fields = row.get("fields") or row
        output_rows.append(
            "<li>{platform} / {otype}: status={status} render={render} job={job}</li>".format(
                platform=_html_escape(fields.get("Platform")),
                otype=_html_escape(fields.get("Studio_Output_Type") or fields.get("Platform_Output_Type")),
                status=_html_escape(fields.get("Output_Status")),
                render=_html_escape(fields.get("Render_Status")),
                job=_html_escape(fields.get("Remotion_Job_ID")),
            )
        )
    body = f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#102a43">
      <h2 style="margin:0 0 12px">Studio produce escalated</h2>
      <p>Automatic retries exhausted. This is a catastrophic produce failure that needs investigation.</p>
      <p><strong>Request:</strong> {_html_escape(request_id)}<br>
         <strong>Route:</strong> {_html_escape(job.get("route"))}<br>
         <strong>Last step:</strong> {_html_escape(heal.get("last_step") or job.get("detail"))}<br>
         <strong>Resume count:</strong> {_html_escape(heal.get("resume_count"))}<br>
         <strong>Error:</strong> {_html_escape(error)}</p>
      <p><a href="{STUDIO_REQUEST_URL}">Open Studio</a></p>
      <h3>Outputs</h3>
      <ul>{"".join(output_rows) or "<li>No outputs attached</li>"}</ul>
      <h3>Job JSON</h3>
      <pre style="background:#f0f4f8;padding:12px;overflow:auto;font-size:12px">{_html_escape(json.dumps(job, indent=2)[:8000])}</pre>
    </div>
    """
    return subject, body


def send_produce_escalation(
    *,
    request_id: str,
    job: dict[str, Any],
    outputs: list[dict[str, Any]] | None = None,
    to: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    to_addr = (to or settings.get("ops_alert_email_to") or DEFAULT_OPS_EMAIL_TO).strip()
    subject, html_body = build_escalation_email(request_id=request_id, job=job, outputs=outputs)
    result: dict[str, Any] = {
        "ok": True,
        "request_id": request_id,
        "email_to": to_addr,
        "subject": subject,
    }
    if not OPS_ALERT_EMAIL_ENABLED:
        result["email_skipped"] = True
        result["email_reason"] = "email_disabled"
    else:
        try:
            send = GmailClient().send_html(to=to_addr, subject=subject, html_body=html_body)
            result["gmail_message_id"] = send.get("id")
        except Exception as exc:
            logger.exception("ops alert email failed request=%s", request_id)
            result["ok"] = False
            result["email_error"] = str(exc)

    webhook = str(settings.get("produce_heal_webhook_url") or "").strip()
    if webhook:
        payload = {
            "type": "studio_produce_escalated",
            "schema": "studio.produce-heal.1",
            "request_id": request_id,
            "error": job.get("error"),
            "heal": job.get("heal"),
            "route": job.get("route"),
            "studio_url": STUDIO_REQUEST_URL,
            "instruction": (
                "Investigate this Production Request produce failure, apply a live fix if safe, "
                "then resume studio-produce for the request."
            ),
        }
        try:
            response = requests.post(webhook, json=payload, timeout=30)
            result["webhook_status"] = response.status_code
            result["webhook_ok"] = response.ok
            if not response.ok:
                result["ok"] = False
                result["webhook_error"] = response.text[:500]
        except Exception as exc:
            logger.exception("ops alert webhook failed request=%s", request_id)
            result["ok"] = False
            result["webhook_error"] = str(exc)

    return result
