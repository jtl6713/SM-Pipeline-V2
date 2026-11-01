"""No external API calls or production writes in durable I1 tests."""
from __future__ import annotations

import sqlite3

import pytest

from airtable.constants import CONTENT_PROFILES_TABLE, IDEA_BATCHES_TABLE
from i1 import durable_jobs as q

BATCH = "rec" + "B" * 14
PROFILE = "rec" + "P" * 14


@pytest.fixture(autouse=True)
def durable_test_env(monkeypatch, tmp_path):
    monkeypatch.setenv("I1_DURABLE_ENABLED", "1")
    monkeypatch.setenv("I1_JOB_DB_PATH", str(tmp_path / "persistent" / "i1.sqlite3"))
    monkeypatch.setattr(q, "start_consumer", lambda: None)
    q._WAKE.clear()


def test_admission_commits_and_deduplicates():
    a = q.enqueue(BATCH, PROFILE, 10, "Balanced")
    b = q.enqueue(BATCH, PROFILE, 10, "Balanced")
    assert a["job_status"] == "queued"
    assert a["already_exists"] is False
    assert b["already_exists"] is True
    assert q.status(BATCH)["status"] == "queued"
    with pytest.raises(ValueError, match="different immutable"):
        q.enqueue(BATCH, PROFILE, 5, "Balanced")


def test_claim_is_exclusive_and_can_recover_expired_lease():
    q.enqueue(BATCH, PROFILE, 10, "Balanced")
    first = q._claim()
    assert first["batch_id"] == BATCH
    assert q._claim() is None
    with q._db() as db:
        db.execute("UPDATE jobs SET lease_until=0 WHERE batch_id=?", (BATCH,))
    replay = q._claim()
    assert replay["run_token"] != first["run_token"]
    assert q.status(BATCH)["attempts"] == 2
    # An old consumer cannot terminalize a lease taken by the new consumer.
    q._finish(first, "complete")
    assert q.status(BATCH)["status"] == "running"
    q._finish(replay, "failed", "simulated")
    assert q.status(BATCH)["status"] == "failed"


class FakeClient:
    def __init__(self, initial=0, status="Pending"):
        self.batch = {
            "Status": status, "Content_Profile": [PROFILE],
            "Requested_Count": 5, "Idea Candidates": ["rec" + str(i).zfill(14) for i in range(initial)],
        }
        self.profile = {"Manual_Idea_Batch": [BATCH]}
        self.writes = []

    def get_record(self, table, record_id):
        assert record_id in (BATCH, PROFILE)
        return {"id": record_id, "fields": dict(self.batch if table == IDEA_BATCHES_TABLE else self.profile)}

    def update_record(self, table, record_id, fields, typecast=False):
        self.writes.append((table, dict(fields)))
        target = self.batch if table == IDEA_BATCHES_TABLE else self.profile
        target.update(fields)
        return {"id": record_id, "fields": dict(target)}


def _job():
    return {"batch_id": BATCH, "profile_id": PROFILE, "requested_count": 5, "quality": "Balanced"}


def test_resume_only_generates_missing_candidates(monkeypatch):
    client = FakeClient(initial=3)
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    requested = []

    def produce(**kwargs):
        requested.append(kwargs["requested_count"])
        for i in (3, 4):
            client.batch["Idea Candidates"].append("rec" + str(i).zfill(14))
        return {"created_count": 2}

    monkeypatch.setattr(q, "process_request", produce)
    q._work(_job())
    assert requested == [2]
    assert client.batch["Generated_Count"] == 5
    assert client.batch["Status"] == "Complete"
    assert client.profile["Manual_Idea_Batch"] == []


def test_partial_failed_write_is_not_retried_and_count_is_preserved(monkeypatch):
    client = FakeClient(initial=2)
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    calls = []

    def partial(**kwargs):
        calls.append(kwargs)
        client.batch["Idea Candidates"].append("rec" + str(2).zfill(14))
        return {"partial_failure": True, "retry_requires_reconciliation": True,
                "error": "simulated ambiguous write"}

    monkeypatch.setattr(q, "process_request", partial)
    with pytest.raises(RuntimeError, match="reconcile batch"):
        q._work(_job())
    assert len(calls) == 1
    assert client.batch["Status"] == "Failed"
    assert client.batch["Generated_Count"] == 3
    assert "3/5 verified" in client.batch["Error"]


def test_existing_complete_is_not_regenerated(monkeypatch):
    client = FakeClient(initial=5, status="Complete")
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    monkeypatch.setattr(q, "process_request", lambda **kwargs: pytest.fail("model should not run"))
    q._work(_job())
    assert client.batch["Status"] == "Complete"


def test_terminal_shortfall_requires_manual_review(monkeypatch):
    client = FakeClient(initial=3, status="Failed")
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    monkeypatch.setattr(q, "process_request", lambda **kwargs: pytest.fail("model should not run"))
    with pytest.raises(q.TerminalBatchMismatch, match="manual reconciliation required"):
        q._work(_job())
    assert client.batch["Status"] == "Failed"


def test_absolute_persistent_db_path_required(monkeypatch):
    monkeypatch.setenv("I1_JOB_DB_PATH", ":memory:")
    with pytest.raises(RuntimeError, match="persistent"):
        q._connect()
