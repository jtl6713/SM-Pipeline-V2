import os
from unittest.mock import patch

import pytest

from ap1_ig.publish_lease import IgPublishLease, IgPublishLeaseError, ig_publish_lease_required


def test_publish_lease_is_default_off_and_requires_explicit_opt_in():
    with patch.dict(os.environ, {"IG_PUBLISH_LEASE_REQUIRED": "false"}):
        assert ig_publish_lease_required() is False
    with patch.dict(os.environ, {"IG_PUBLISH_LEASE_REQUIRED": "true"}):
        assert ig_publish_lease_required() is True


def test_claim_remote_intent_and_heartbeat_share_exact_token():
    receipts = []
    def post(payload, headers):
        assert headers["X-Ig-Publish-Lease-Secret"] == "x"*32
        receipts.append(payload)
        return {
            "ok": True, "output_id": payload["output_id"],
            "attempt_id": "my_attempt_token_123456",
            "generation": 4,
            "phase": ("pre_remote" if payload["action"] == "claim" else
                      "remote_intent" if payload["action"] == "remote_intent" else
                      "finished" if payload["action"] == "finish" else "pre_remote"),
        }
    with patch.dict(os.environ, {
        "STUDIO_IG_PUBLISH_LEASE_WORKER_URL": "https://studio.example.test",
        "STUDIO_IG_PUBLISH_LEASE_SHARED_SECRET": "x"*32,
    }):
        lease = IgPublishLease("rec12345678901234", post=post)
        assert lease.claim()["phase"] == "pre_remote"
        stamp = "2026-11-02T18:00:00Z"
        assert lease.heartbeat(stamp)["phase"] == "pre_remote"
        assert lease.remote_intent(stamp)["phase"] == "remote_intent"
        assert receipts[2]["attempt_id"] == receipts[0].get("attempt_id", lease.attempt_id)
        assert receipts[2]["generation"] == 4


def test_ambiguous_or_fenced_worker_response_fails_before_meta_create():
    def post(payload, headers):
        if payload["action"] == "claim":
            return {"ok": True, "output_id": payload["output_id"],
                "attempt_id": "my_attempt_token_123456",
                "generation": 5, "phase": "pre_remote"}
        raise TimeoutError("worker unreachable")
    with patch.dict(os.environ, {
        "STUDIO_IG_PUBLISH_LEASE_WORKER_URL": "https://studio.example.test",
        "STUDIO_IG_PUBLISH_LEASE_SHARED_SECRET": "x"*32,
    }):
        lease = IgPublishLease("rec12345678901234", post=post)
        lease.claim()
        with pytest.raises(IgPublishLeaseError, match="publish_lease_unverified"):
            lease.remote_intent("2026-11-02T18:00:00Z")


def test_no_secret_no_claim_even_when_local_flag_enabled():
    with patch.dict(os.environ, {
        "STUDIO_IG_PUBLISH_LEASE_WORKER_URL": "https://studio.example.test",
        "STUDIO_IG_PUBLISH_LEASE_SHARED_SECRET": "",
    }):
        with pytest.raises(IgPublishLeaseError, match="publish_lease_remote_unconfigured"):
            IgPublishLease("rec12345678901234").claim()
