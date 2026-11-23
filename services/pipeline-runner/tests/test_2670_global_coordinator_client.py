from __future__ import annotations
import os
import pytest

from studio_produce import global_coordinator as g

CFG = {
    "supabase_url": "https://example.supabase.co",
    "supabase_service_role_key": "a" * 64,
}

class Reply:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
    def json(self):
        return self.payload

def test_coordinator_stays_off_without_explicit_operator_flag(monkeypatch):
    monkeypatch.delenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", raising=False)
    assert not g.enabled()
    with pytest.raises(g.GlobalAdmissionUnavailable, match="not_enabled"):
        g.acquire("producer", "bounded-fully-unique-job-key", settings=CFG,
                  sender=lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not call provider")))

def test_cross_host_contract_one_rpc_and_private_hashed_identity(monkeypatch):
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    seen = []
    def fake_sender(url, *, json, headers, timeout, allow_redirects):
        seen.append((url, json, headers, timeout, allow_redirects))
        return Reply({"accepted": True, "replay": False, "reason": "admitted"})
    result = g.acquire("producer", "exact-output-rec12345678901234", settings=CFG,
                       sender=fake_sender)
    assert result.accepted and not result.replay
    assert len(result.claim_key) == 64 and "rec12345678901234" not in result.claim_key
    assert len(seen) == 1 and seen[0][0].endswith("/rpc/studio_global_workload_acquire")
    assert seen[0][1]["p_claim_key"] == result.claim_key
    assert seen[0][3] == 6 and seen[0][4] is False
    assert result.fence == seen[0][1]["p_fence"]
    assert seen[0][2]["apikey"] == CFG["supabase_service_role_key"]

def test_ambiguous_rpc_denied_and_never_replayed(monkeypatch):
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    calls = []
    def broken(*args, **kwargs):
        calls.append(1)
        raise OSError("network unavailable")
    with pytest.raises(g.GlobalAdmissionUnavailable, match="rpc_unconfirmed") as e:
        g.acquire("producer", "exact-output-rec12345678901234",
                  settings=CFG, sender=broken)
    assert len(calls) == 1
    assert CFG["supabase_service_role_key"] not in str(e.value)

def test_expired_or_stolen_owner_cannot_be_renewed_by_client(monkeypatch):
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    claim = g.GlobalClaim(True, "producer", "a" * 64, "00000000-0000-4000-8000-000000000000")
    assert g.renew(claim, settings=CFG, sender=lambda *a, **kw: Reply(False)) is False
    assert g.release(claim, verified_progress=True, settings=CFG,
                     sender=lambda *a, **kw: Reply(False)) is False

def test_database_trip_uses_global_scope_only(monkeypatch):
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    called = []
    def sender(url, *, json, **kw):
        called.append((url, json))
        return Reply(True)
    assert g.trip("http_5xx", settings=CFG, sender=sender)
    assert called[0][0].endswith("studio_global_workload_trip")
    assert called[0][1] == {"p_reason": "http_5xx", "p_cooldown_seconds": 90}


def test_opt_in_global_producer_context_is_zero_network_when_disabled(monkeypatch):
    monkeypatch.delenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", raising=False)
    monkeypatch.setattr(g, "acquire", lambda *a, **k: (_ for _ in ()).throw(
        AssertionError("disabled coordinator must not acquire")))
    with g.producer_lease("recProducerNoGlobal") as guard:
        assert guard.enabled is False
        assert guard.lost.is_set() is False
        guard.mark_progress()
        assert guard.verified_progress is True


def test_opt_in_global_producer_denial_is_fail_closed(monkeypatch):
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    claim = g.GlobalClaim(False, "producer", "a" * 64,
                          "00000000-0000-4000-8000-000000000000",
                          reason="scope_capacity")
    monkeypatch.setattr(g, "acquire", lambda *a, **k: claim)
    monkeypatch.setattr(g, "release", lambda *a, **k: (_ for _ in ()).throw(
        AssertionError("denied admission must not be released")))
    with pytest.raises(g.GlobalAdmissionUnavailable, match="capacity_denied"):
        with g.producer_lease("recProducerDenied"):
            raise AssertionError("denied global claim entered canonical work")


def test_opt_in_global_producer_lease_renews_and_release_marks_proven_progress(monkeypatch):
    import time
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    claim = g.GlobalClaim(True, "producer", "b" * 64,
                          "00000000-0000-4000-8000-000000000000")
    seen = {"acquire": [], "renew": 0, "released": []}
    def acquire(scope, identity, *, ttl_seconds):
        seen["acquire"].append((scope, identity, ttl_seconds))
        return claim
    def renew(owner, *, ttl_seconds):
        assert owner is claim and ttl_seconds == 60
        seen["renew"] += 1
        return True
    monkeypatch.setattr(g, "acquire", acquire)
    monkeypatch.setattr(g, "renew", renew)
    monkeypatch.setattr(g, "release", lambda owner, *, verified_progress:
                        seen["released"].append((owner, verified_progress)) or True)
    with g.producer_lease("recProducerSafe", renew_interval=1, ttl_seconds=60) as guard:
        assert guard.enabled is True and guard.lost.is_set() is False
        time.sleep(1.15)
        guard.mark_progress()
    assert seen["acquire"] == [("producer", "studio-produce:recProducerSafe", 60)]
    assert seen["renew"] >= 1
    assert seen["released"] == [(claim, True)]


def test_opt_in_global_producer_lost_renewal_never_clears_half_open(monkeypatch):
    import time
    monkeypatch.setenv("STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED", "true")
    claim = g.GlobalClaim(True, "producer", "c" * 64,
                          "00000000-0000-4000-8000-000000000000")
    releases = []
    monkeypatch.setattr(g, "acquire", lambda *a, **k: claim)
    monkeypatch.setattr(g, "renew", lambda *a, **k: False)
    monkeypatch.setattr(g, "release", lambda owner, *, verified_progress:
                        releases.append(verified_progress) or True)
    with g.producer_lease("recProducerLost", renew_interval=1, ttl_seconds=60) as guard:
        time.sleep(1.15)
        assert guard.lost.is_set() is True
        guard.mark_progress()
        assert guard.verified_progress is False
    assert releases == [False]
