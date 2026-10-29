"""Trusted, single-attempt HTTP bridge to the protected Worker launch ledger.

This is an adapter for isolated_launch.launch_review_render_once, NOT an outbox
poller or a renderer. It requires an authenticated server-owned claim receipt.
All requests are bounded POSTs to the exact configured Worker origin; failures
are ambiguous, fail closed, and are NEVER automatically retried here.
"""
from __future__ import annotations

import json
import os
import requests
from typing import Any, Callable
from urllib.parse import urlsplit
from urllib.request import (
    Request, HTTPRedirectHandler, build_opener,
)


class ReviewLedgerUnavailable(RuntimeError):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ReviewLedgerUnavailable("launch_ledger_redirect_forbidden")


def _validate_base(base: str) -> str:
    try:
        url = urlsplit(base)
    except ValueError as exc:
        raise ReviewLedgerUnavailable("launch_ledger_origin_invalid") from exc
    if (url.scheme != "https" or not url.netloc or url.username or
        url.password or url.path not in ("", "/") or
        url.query or url.fragment):
        raise ReviewLedgerUnavailable("launch_ledger_origin_invalid")
    return base.rstrip("/")


def _access_headers() -> dict[str, str]:
    """Use a configured Cloudflare Access service token for the protected Worker.

    Both parts must exist. The independent Worker job secret remains mandatory.
    No Access credential is logged, forwarded to Remotion, or put into an MP4.
    """
    client_id = os.environ.get("CF_ACCESS_CLIENT_ID", "").strip()
    client_secret = os.environ.get("CF_ACCESS_CLIENT_SECRET", "").strip()
    if bool(client_id) != bool(client_secret):
        raise ReviewLedgerUnavailable("review_access_credentials_incomplete")
    if not client_id:
        return {}
    return {
        "CF-Access-Client-Id": client_id,
        "CF-Access-Client-Secret": client_secret,
    }


class RemoteLaunchLedger:
    """Implements isolated_launch's operations against a protected Worker.

    transport(url, body, headers, timeout_seconds) -> decoded dict
    is injection-only for hermetic tests; production defaults to a non-
    redirecting one-shot urllib POST without application-level retries.
    """

    def __init__(
        self, *, worker_base: str, shared_secret: str, claim: dict,
        transport: Callable[..., dict] | None = None,
        timeout_seconds: float = 10.0,
    ):
        self.worker_base = _validate_base(worker_base)
        if (not isinstance(shared_secret, str) or len(shared_secret) < 24 or
            not isinstance(claim, dict) or claim.get("lease_verified") is not True or
            claim.get("ok") is not True or
            not isinstance(claim.get("lease_fence"), int) or
            claim["lease_fence"] < 1):
            raise ReviewLedgerUnavailable("trusted_render_claim_missing")
        for name in ("output_id", "job_id", "attempt_id", "session_id",
                     "plan_hash", "lease_owner"):
            if not isinstance(claim.get(name), str) or not claim[name]:
                raise ReviewLedgerUnavailable("trusted_render_claim_missing")
        if not (1 <= timeout_seconds <= 30):
            raise ReviewLedgerUnavailable("launch_ledger_timeout_invalid")
        self.claim = dict(claim)
        self.shared_secret = shared_secret
        self.transport = transport or self._one_shot_post
        self.timeout_seconds = timeout_seconds

    @staticmethod
    def _one_shot_post(url: str, body: dict, headers: dict, timeout: float) -> dict:
        """Exact one-request Worker ledger mutation; never retry or follow redirects."""
        try:
            with requests.post(
                url,
                headers={**headers, "User-Agent": ""},
                data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
                timeout=timeout,
                allow_redirects=False,
                stream=True,
            ) as resp:
                status=resp.status_code
                raw=resp.raw.read(8193, decode_content=True)
        except requests.RequestException as exc:
            raise ReviewLedgerUnavailable("launch_ledger_response_ambiguous_no_retry") from exc
        if status != 200:
            raise ReviewLedgerUnavailable("launch_ledger_http_status_unverified")
        if len(raw) > 8192:
            raise ReviewLedgerUnavailable("launch_ledger_response_too_large")
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError) as exc:
            raise ReviewLedgerUnavailable("launch_ledger_response_unverified") from exc

    def _call(self, action: str, **extra: Any) -> dict:
        body = {
            "action": action, "output_id": self.claim["output_id"],
            "job_id": self.claim["job_id"],
            "lease_owner": self.claim["lease_owner"],
            "lease_fence": self.claim["lease_fence"],
            **extra,
        }
        try:
            response = self.transport(
                self.worker_base + "/api/internal/rendering-review/launch-ledger",
                body, {
                    "Content-Type": "application/json",
                    "X-Rendering-Review-Job-Secret": self.shared_secret,
                    **_access_headers(),
                }, self.timeout_seconds,
            )
        except Exception as exc:
            raise ReviewLedgerUnavailable(
                "launch_ledger_response_ambiguous_no_retry"
            ) from exc
        if not isinstance(response, dict):
            raise ReviewLedgerUnavailable("launch_ledger_response_unverified")
        return response

    def _exact_job(self, job_id: str):
        if job_id != self.claim["job_id"]:
            raise ReviewLedgerUnavailable("launch_ledger_wrong_job")

    def _exact_fence(self, fence: int):
        if type(fence) is not int or fence != self.claim["lease_fence"]:
            raise ReviewLedgerUnavailable("launch_ledger_stale_fence")

    def read_authority(self, job_id: str) -> dict:
        self._exact_job(job_id)
        return self._call("read_authority")

    def reserve_launch_intent(self, job_id: str, fence: int,
                              payload_hash: str) -> dict:
        self._exact_job(job_id)
        self._exact_fence(fence)
        return self._call("reserve_intent", payload_hash=payload_hash)

    def read_launch_intent(self, job_id: str) -> dict:
        self._exact_job(job_id)
        return self._call("read_intent")

    def persist_launch_receipt(self, job_id: str, fence: int,
                               payload_hash: str, remotion_job_id: str,
                               status_url: str) -> dict:
        self._exact_job(job_id)
        self._exact_fence(fence)
        return self._call("persist_receipt", payload_hash=payload_hash,
                          remotion_job_id=remotion_job_id,
                          status_url=status_url)

    def read_launch_receipt(self, job_id: str) -> dict:
        self._exact_job(job_id)
        return self._call("read_receipt")
