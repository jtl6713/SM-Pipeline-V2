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




def test_verified_nine_of_ten_shortfall_refilled_with_only_missing(monkeypatch):
    client = FakeClient(initial=4)
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    requests = []

    def produce(**kwargs):
        missing = kwargs["requested_count"]
        requests.append(missing)
        # First verified pass generates 4 of 6; next produces just 1;
        # final round creates the remaining 1. Never regenerates 10.
        count = [4, 1, 1][len(requests) - 1]
        for index in range(count):
            next_id = len(client.batch["Idea Candidates"])
            client.batch["Idea Candidates"].append("rec" + str(next_id).zfill(14))
        return {"created_count": count}

    # Match an actual 10-idea NYC request, including initial verified links.
    client.batch["Requested_Count"] = 10
    job = {**_job(), "requested_count": 10}
    monkeypatch.setattr(q, "process_request", produce)
    q._work(job)
    assert requests == [6, 2, 1]
    assert client.batch["Status"] == "Complete"
    assert client.batch["Generated_Count"] == 10
    assert len(set(client.batch["Idea Candidates"])) == 10


def test_bounded_shortfall_stops_after_seven_confirmed_passes(monkeypatch):
    client = FakeClient(initial=0)
    client.batch["Requested_Count"] = 10
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    requests = []

    def produce(**kwargs):
        requests.append(kwargs["requested_count"])
        index = len(client.batch["Idea Candidates"])
        client.batch["Idea Candidates"].append("rec" + str(index).zfill(14))
        return {"created_count": 1}

    monkeypatch.setattr(q, "process_request", produce)
    with pytest.raises(RuntimeError, match="Only 7 of 10 linked ideas verified"):
        q._work({**_job(), "requested_count": 10})
    assert requests == [10, 9, 8, 7, 6, 5, 4]
    assert client.batch["Status"] == "Failed"
    assert client.batch["Generated_Count"] == 7



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


def test_verified_nine_of_ten_retries_only_unwritten_duplicate_and_preserves_ids(monkeypatch):
    client = FakeClient(initial=9)
    client.batch["Requested_Count"] = 10
    initial_ids = list(client.batch["Idea Candidates"])
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    calls = []

    def produce(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return {
                "created_count": 0,
                "processed": False,
                "reason": "no_unique_candidates_after_regeneration",
                "skipped_duplicate_titles": ["NYC Hidden Subway Entrance"],
            }
        assert kwargs["requested_count"] == 1
        assert kwargs["excluded_titles"] == ("NYC Hidden Subway Entrance",)
        client.batch["Idea Candidates"].append("rec" + str(9).zfill(14))
        return {"processed": True, "created_count": 1,
                "created_record_ids": ["rec" + str(9).zfill(14)]}

    monkeypatch.setattr(q, "process_request", produce)
    q._work({**_job(), "requested_count": 10})
    assert len(calls) == 2
    assert [x["requested_count"] for x in calls] == [1, 1]
    assert client.batch["Idea Candidates"][:9] == initial_ids
    assert len(set(client.batch["Idea Candidates"])) == 10
    assert client.batch["Status"] == "Complete"
    assert client.batch["Generated_Count"] == 10


def test_acknowledged_but_unlinked_idea_is_never_recreated(monkeypatch):
    client = FakeClient(initial=9)
    client.batch["Requested_Count"] = 10
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    calls = []

    def produce(**kwargs):
        calls.append(kwargs)
        # Accepted Airtable response, but reciprocal links not visible yet.
        return {"processed": True, "created_count": 1,
                "created_record_ids": ["rec" + str(9).zfill(14)]}

    monkeypatch.setattr(q, "process_request", produce)
    with pytest.raises(RuntimeError, match="acknowledged candidate IDs not yet linked"):
        q._work({**_job(), "requested_count": 10})
    assert len(calls) == 1
    assert len(client.batch["Idea Candidates"]) == 9
    assert client.batch["Status"] == "Failed"


def test_repeated_verified_no_write_is_bounded_and_never_makes_11(monkeypatch):
    client = FakeClient(initial=9)
    client.batch["Requested_Count"] = 10
    monkeypatch.setattr(q, "AirtableClient", lambda: client)
    calls = []

    def produce(**kwargs):
        calls.append(kwargs)
        return {"processed": False, "created_count": 0,
                "reason": "no_unique_candidates_after_regeneration",
                "skipped_duplicate_titles": ["Old Idea %s" % len(calls)]}

    monkeypatch.setattr(q, "process_request", produce)
    with pytest.raises(RuntimeError, match="Only 9 of 10 linked ideas verified"):
        q._work({**_job(), "requested_count": 10})
    assert len(calls) == q._MAX_ZERO_WRITE_PASSES
    assert calls[0]["requested_count"] == 1
    assert calls[1]["excluded_titles"] == ("Old Idea 1",)
    assert len(client.batch["Idea Candidates"]) == 9
    assert client.batch["Generated_Count"] == 9
    assert client.batch["Status"] == "Failed"


def test_absolute_persistent_db_path_required(monkeypatch):
    monkeypatch.setenv("I1_JOB_DB_PATH", ":memory:")
    with pytest.raises(RuntimeError, match="persistent"):
        q._connect()
