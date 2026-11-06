"""Shared Worker R2 lease protocol for Python AP1-IG publishes.

Feature off by default. Fail closed on every ambiguous response. A durable
"remote_intent" is required before a Graph create; expired pre_remote owners
cannot call Graph after Quality Agent CAS fencing.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from typing import Callable, Any


def ig_publish_lease_required() -> bool:
    return os.environ.get("IG_PUBLISH_LEASE_REQUIRED", "").strip().lower() == "true"


class IgPublishLeaseError(Exception):
    pass


class IgPublishLease:
    def __init__(self, output_id: str, *, post: Callable[..., dict] | None = None):
        if not re.fullmatch(r"rec[A-Za-z0-9]{14}", str(output_id or "")):
            raise IgPublishLeaseError("publish_lease_output_id_invalid")
        self.output_id = output_id
        self._post = post
        self.attempt_id: str | None = None
        self.generation: int | None = None
        self.phase: str | None = None

    def _request(self, action: str, *, lock_stamp: str = "") -> dict[str, Any]:
        url = os.environ.get("STUDIO_IG_PUBLISH_LEASE_WORKER_URL", "").strip().rstrip("/")
        secret = os.environ.get("STUDIO_IG_PUBLISH_LEASE_SHARED_SECRET", "").strip()
        if not url.startswith("https://") or len(secret) < 24:
            raise IgPublishLeaseError("publish_lease_remote_unconfigured")
        payload: dict[str, Any] = {"action": action, "output_id": self.output_id}
        if action != "claim":
            if not self.attempt_id or not self.generation or not lock_stamp:
                raise IgPublishLeaseError("publish_lease_token_or_lock_missing")
            payload.update({
                "attempt_id": self.attempt_id,
                "generation": self.generation,
                "lock_stamp": lock_stamp,
            })
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Ig-Publish-Lease-Secret": secret,
        }
        for source, header in (
            ("CF_ACCESS_CLIENT_ID", "CF-Access-Client-Id"),
            ("CF_ACCESS_CLIENT_SECRET", "CF-Access-Client-Secret"),
        ):
            if os.environ.get(source):
                headers[header] = os.environ[source]
        def send() -> dict:
            request = urllib.request.Request(
                url + "/internal/quality/ig-publish-lease",
                data=json.dumps(payload).encode("utf-8"),
                headers=headers, method="POST",
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status != 200:
                    raise IgPublishLeaseError("publish_lease_http_rejected")
                return json.loads(response.read(4096).decode("utf-8"))
        try:
            receipt = self._post(payload, headers) if self._post else send()
        except Exception as exc:
            raise IgPublishLeaseError("publish_lease_unverified") from exc
        if not isinstance(receipt, dict) or receipt.get("ok") is not True or \
            receipt.get("output_id") != self.output_id or \
            receipt.get("phase") != ("pre_remote" if action == "claim" else
                                     "remote_intent" if action == "remote_intent" else
                                     "finished" if action == "finish" else self.phase):
            raise IgPublishLeaseError("publish_lease_bad_receipt")
        token = receipt.get("attempt_id")
        generation = receipt.get("generation")
        if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", token) \
                or not isinstance(generation, int) or generation < 1 \
                or (action != "claim" and (token != self.attempt_id
                                            or generation != self.generation)):
            raise IgPublishLeaseError("publish_lease_token_mismatch")
        self.attempt_id = token
        self.generation = generation
        self.phase = receipt["phase"]
        return receipt

    def claim(self) -> dict:
        return self._request("claim")

    def heartbeat(self, lock_stamp: str) -> dict:
        return self._request("heartbeat", lock_stamp=lock_stamp)

    def remote_intent(self, lock_stamp: str) -> dict:
        return self._request("remote_intent", lock_stamp=lock_stamp)

    def finish(self, lock_stamp: str) -> dict:
        return self._request("finish", lock_stamp=lock_stamp)
