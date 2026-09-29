"""Alert when costly PRIMARY OpenAI is actually used.

Fires from the AI routers whenever a request is sent to PRIMARY (api.openai.com).
Emails Joseph (rate-limited per stage) and tickets a desk_incident with stage/where.
"""

from __future__ import annotations

import html
import logging
import os
import time
from datetime import datetime, timezone
from threading import Lock
from typing import Any

import requests

from ai_api_status import record_primary_hit
from config import load_settings
from integrations.gmail import PURPOSE_PRIMARY_AI_USAGE, GmailClient

_LOG = logging.getLogger("pipeline-runner.ai-primary-alert")

DEFAULT_ALERT_TO = "chicagoshining@gmail.com"
DESK_LOG_EVENT_URL = "https://tasks.chicagoshining.com/agent-activity/log-event"
COOLDOWN_SECONDS = int(os.environ.get("PRIMARY_AI_ALERT_COOLDOWN_SECONDS", "900"))

_lock = Lock()
_last_alert_at: dict[str, float] = {}
_suppressed: dict[str, int] = {}


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _cooldown_key(stage: str, mode: str) -> str:
    return f"{str(stage or 'unknown').strip().upper()}|{str(mode or 'hit').strip().lower()}"


def _should_notify(stage: str, mode: str) -> tuple[bool, int]:
    key = _cooldown_key(stage, mode)
    now = time.monotonic()
    with _lock:
        last = _last_alert_at.get(key)
        if last is not None and now - last < COOLDOWN_SECONDS:
            _suppressed[key] = _suppressed.get(key, 0) + 1
            return False, _suppressed[key]
        suppressed = _suppressed.pop(key, 0)
        _last_alert_at[key] = now
        return True, suppressed


def build_alert_email(
    *,
    stage: str,
    kind: str,
    model: str,
    preferred_provider: str,
    failover: bool,
    status_code: int | None,
    suppressed_count: int,
    error: str | None = None,
) -> tuple[str, str]:
    mode = "failover from Azure" if failover else "preferred/direct"
    subject = f"[Studio] PRIMARY OpenAI used — {stage} ({mode})"
    when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    body = f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#102a43">
      <h2 style="margin:0 0 12px">PRIMARY OpenAI was used</h2>
      <p>A Pipeline Runner AI call hit the costly <strong>PRIMARY</strong> OpenAI account
         (<code>api.openai.com</code>).</p>
      <p>
        <strong>When:</strong> {_esc(when)}<br>
        <strong>Stage / where:</strong> {_esc(stage)}<br>
        <strong>Kind:</strong> {_esc(kind)}<br>
        <strong>Model:</strong> {_esc(model)}<br>
        <strong>Preferred provider:</strong> {_esc(preferred_provider)}<br>
        <strong>Mode:</strong> {_esc(mode)}<br>
        <strong>HTTP status:</strong> {_esc(status_code if status_code is not None else "n/a")}<br>
        <strong>Error:</strong> {_esc(error or "none")}
      </p>
      <p>Suppressed duplicate hits for this stage since the last email: {_esc(suppressed_count)}.</p>
      <p>Live Preferred is stored in Airtable <code>AI_API_PREFERRED_PROVIDER</code>.
         Failover is <code>AI_API_CROSS_PROVIDER_FAILOVER</code>. Studio footer shows Current.</p>
    </div>
    """
    return subject, body


def _post_desk_incident(
    *,
    stage: str,
    kind: str,
    model: str,
    preferred_provider: str,
    failover: bool,
    status_code: int | None,
    error: str | None,
) -> dict[str, Any]:
    mode = "failover" if failover else "direct"
    fingerprint = f"primary_openai_used:{stage}:{mode}"
    diagnosis = (
        f"PRIMARY OpenAI hit at stage={stage} kind={kind} model={model} "
        f"preferred={preferred_provider} failover={failover} status={status_code} error={error or 'none'}"
    )
    payload = {
        "task_id": 1,
        "agent_id": 3,
        "type": "desk_incident",
        "payload": {
            "status": "open",
            "fingerprint": fingerprint,
            "class": "transient" if failover else "ops",
            "kind": "primary_openai_used",
            "record_id": stage,
            "diagnosis": diagnosis,
        },
    }
    try:
        response = requests.post(DESK_LOG_EVENT_URL, json=payload, timeout=15)
        return {
            "ok": response.ok,
            "status_code": response.status_code,
            "fingerprint": fingerprint,
            "body": (response.text or "")[:300],
        }
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "fingerprint": fingerprint}


def _send_email(*, subject: str, html_body: str) -> dict[str, Any]:
    settings = load_settings()
    to_addr = str(settings.get("ops_alert_email_to") or DEFAULT_ALERT_TO).strip() or DEFAULT_ALERT_TO
    try:
        send = GmailClient().send_html(
            to=to_addr,
            subject=subject,
            html_body=html_body,
            purpose=PURPOSE_PRIMARY_AI_USAGE,
        )
        return {"ok": not send.get("skipped"), "to": to_addr, "result": send}
    except Exception as exc:
        _LOG.exception("PRIMARY AI alert email failed")
        return {"ok": False, "to": to_addr, "error": f"{type(exc).__name__}: {exc}"}


def notify_primary_used(
    *,
    stage: str,
    kind: str,
    model: str = "",
    preferred_provider: str = "",
    failover: bool = False,
    status_code: int | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    """Log always; email + desk ticket at most once per stage/mode cooldown."""
    stage_label = str(stage or "unknown").strip() or "unknown"
    kind_label = str(kind or "responses").strip() or "responses"
    model_label = str(model or "").strip() or "(unset)"
    preferred = str(preferred_provider or "").strip() or "unknown"
    mode = "failover" if failover else "direct"

    record_primary_hit(
        stage=stage_label,
        kind=kind_label,
        model=model_label,
        preferred_provider=preferred,
        failover=bool(failover),
        status_code=status_code,
        error=error,
    )
    _LOG.warning(
        "PRIMARY OpenAI used stage=%s kind=%s model=%s preferred=%s failover=%s status=%s error=%s",
        stage_label,
        kind_label,
        model_label,
        preferred,
        failover,
        status_code,
        error or "",
    )

    send_now, suppressed = _should_notify(stage_label, mode)
    result: dict[str, Any] = {
        "stage": stage_label,
        "kind": kind_label,
        "model": model_label,
        "preferred_provider": preferred,
        "failover": bool(failover),
        "status_code": status_code,
        "notified": send_now,
        "suppressed_since_last": suppressed,
    }
    if not send_now:
        result["email_skipped"] = True
        result["email_reason"] = "cooldown"
        return result

    subject, html_body = build_alert_email(
        stage=stage_label,
        kind=kind_label,
        model=model_label,
        preferred_provider=preferred,
        failover=bool(failover),
        status_code=status_code,
        suppressed_count=suppressed,
        error=error,
    )
    result["email"] = _send_email(subject=subject, html_body=html_body)
    result["desk"] = _post_desk_incident(
        stage=stage_label,
        kind=kind_label,
        model=model_label,
        preferred_provider=preferred,
        failover=bool(failover),
        status_code=status_code,
        error=error,
    )
    return result
