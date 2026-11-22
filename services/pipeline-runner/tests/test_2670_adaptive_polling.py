"""Incident #2670: adaptive polling and progress persistence checks."""
from datetime import datetime, timedelta, timezone

from studio_produce.context import job_write_required, write_job_if_changed
from studio_produce.processor import wait_interval


def test_adaptive_wait_schedule():
    assert [wait_interval(n, jitter=0) for n in range(1, 7)] == [5, 15, 30, 60, 60, 60]
    assert wait_interval(4, jitter=0.1) <= 66


def test_unchanged_state_does_not_write():
    now = datetime.now(timezone.utc).isoformat()
    previous = {"step": "crops", "detail": "waiting", "percent": 42, "updated_at": now}
    desired = {**previous, "updated_at": "tomorrow"}
    assert job_write_required(previous, desired) is False

    class Client:
        def update_record(self, *_args, **_kwargs):
            raise AssertionError("unchanged status must not mutate Supabase")

    assert write_job_if_changed(Client(), "recRequest", previous, desired) is False


def test_changed_detail_persists_immediately():
    now = datetime.now(timezone.utc).isoformat()
    before = {"step": "render", "detail": "1 of 4", "percent": 80, "updated_at": now}
    after = {**before, "detail": "2 of 4"}
    assert job_write_required(before, after) is True


def test_heartbeat_persists_after_interval():
    old = (datetime.now(timezone.utc) - timedelta(seconds=70)).isoformat()
    state = {"step": "crops", "detail": "waiting", "updated_at": old}
    assert job_write_required(state, state) is True
