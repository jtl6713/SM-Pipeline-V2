"""Observe every requests-based Airtable call in the pipeline-runner process.

Idempotent installation at process startup. Never log URL, record IDs,
payloads, authorization headers or filter formulas. Supports ordinary
requests.get/post/patch/delete and Sessions via Session.send.
"""
import json
import logging
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import requests

logger = logging.getLogger("pipeline-runner.airtable.egress")
_original_send = requests.sessions.Session.send


def install_airtable_egress_monitor() -> None:
    if getattr(requests.sessions.Session.send, "_studio_airtable_monitored", False):
        return

    def monitored_send(session, request, **kwargs):
        if urlsplit(request.url).hostname != "api.airtable.com":
            return _original_send(session, request, **kwargs)
        started = time.monotonic()
        response = None
        try:
            response = _original_send(session, request, **kwargs)
            return response
        finally:
            logger.info("studio_airtable_egress_v1 %s", json.dumps({
                "source": "pipeline_runner_http",
                "table_kind": "unknown",
                "method": request.method.upper(),
                "status": response.status_code if response is not None else 0,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "at": datetime.now(timezone.utc).isoformat(),
                "request_count": 1,
            }, separators=(",", ":")))

    monitored_send._studio_airtable_monitored = True
    requests.sessions.Session.send = monitored_send
