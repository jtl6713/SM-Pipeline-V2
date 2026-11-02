"""Fail-closed regression tests for the automatic Rendering Review dispatcher."""
import os
import unittest
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from rendering_review import auto_dispatch as d

ROW_ID = "rec12345678901234"
OUTPUT_ID = "rec23456789012345"
JOB_ID = "rrjob_abcdefghijklmnopqrstuvwxyz123456"


def candidate(*, minutes=5, **overrides):
    fields = {
        "Job_ID": JOB_ID, "Output_Record_ID": OUTPUT_ID,
        "Job_State": "queued", "Progress_Stage": "awaiting_isolated_renderer",
        "Retry_Count": 0, "Progress_Percent": 0,
        "Lease_Fence": 0, "Lease_Owner": None, "Event_History_JSON": "[]",
    }
    fields.update(overrides)
    return {"id": ROW_ID, "fields": fields,
            "createdTime": (datetime.now(timezone.utc) -
                            timedelta(minutes=minutes)).isoformat()}


class Airtable:
    def __init__(self, row):
        self.row = deepcopy(row)
        self.writes = []
        self.reads = []
    def list_records(self, table, **kwargs):
        self.reads.append((table, kwargs))
        return [deepcopy(self.row)]
    def update_record(self, table, record, fields):
        self.writes.append(deepcopy(fields))
        self.row["fields"].update(fields)
    def get_record(self, table, record):
        return deepcopy(self.row)


class Response:
    status_code = 202
    def json(self):
        return {"ok": True, "accepted": True, "job_id": JOB_ID,
                "output_id": OUTPUT_ID}


class DispatchTest(unittest.TestCase):
    def setUp(self):
        self.config = patch.dict(os.environ, {
            "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED": "true",
            "RENDERING_REVIEW_EXACT_RENDER_ENABLED": "true",
            "PIPELINE_RUNNER_SHARED_SECRET": "a" * 32,
        })
        self.config.start()
        self.addCleanup(self.config.stop)
        self.now = datetime.now(timezone.utc)
    def test_disabled_without_explicit_two_flags(self):
        with patch.dict(os.environ, {"RENDERING_REVIEW_AUTO_DISPATCH_ENABLED": "false"}):
            self.assertEqual(d.sweep_once()["status"], "disabled")
    def test_guard_rejects_young_claimed_attempted_and_ambiguous_rows(self):
        for row in [
            candidate(minutes=1),
            candidate(Job_State="claimed"),
            candidate(Retry_Count=1),
            candidate(Lease_Fence=1),
            candidate(Lease_Owner="another-runner"),
            candidate(Event_History_JSON='[{"event":"launch"}]'),
            candidate(Progress_Percent=10),
            {**candidate(), "createdTime": "invalid"},
        ]:
            self.assertIsNone(d.eligible_candidate(row, self.now))
        self.assertIsNotNone(d.eligible_candidate(candidate(), self.now))
    def test_durable_marker_read_back_before_only_post_and_no_replay(self):
        client = Airtable(candidate())
        posted = []
        def sender(url, **kwargs):
            posted.append((url, kwargs, deepcopy(client.row["fields"])))
            return Response()
        def authority(output_id, job_id, *, client):
            self.assertEqual((output_id, job_id), (OUTPUT_ID, JOB_ID))
            self.assertEqual(client.row["fields"]["Retry_Count"], 0)
            return True
        first = d.sweep_once(client=client, now=self.now,
                             sender=sender, authority=authority)
        self.assertEqual(first["status"], "accepted")
        self.assertEqual(client.writes, [{"Retry_Count": 1}])
        self.assertEqual(len(posted), 1)
        url, kwargs, fields = posted[0]
        self.assertEqual(url, "http://127.0.0.1:3350/jobs/rendering-review/run-exact")
        self.assertEqual(fields["Retry_Count"], 1)
        self.assertEqual(kwargs["json"], {"output_id": OUTPUT_ID, "job_id": JOB_ID})
        self.assertFalse(kwargs["allow_redirects"])
        second = d.sweep_once(client=client, now=self.now,
                              sender=sender, authority=authority)
        self.assertFalse(second["dispatched"])
        self.assertEqual(len(posted), 1)
    def test_authority_denial_never_marks_or_dispatches(self):
        client = Airtable(candidate())
        def denied(*a, **kw):
            raise RuntimeError("unlaunched_authority_unverified")
        result = d.sweep_once(client=client, now=self.now,
                              authority=denied, sender=lambda *a, **kw: self.fail("sent"))
        self.assertEqual(result["status"], "requires_attention")
        self.assertEqual(client.writes, [])
        self.assertEqual(result["reason_code"], "unlaunched_authority_unverified")
    def test_ambiguous_or_rejected_response_is_not_retried(self):
        for sender in [lambda *a, **kw: (_ for _ in ()).throw(TimeoutError()),
                       lambda *a, **kw: object()]:
            client = Airtable(candidate())
            first = d.sweep_once(client=client, now=self.now,
                                  sender=sender, authority=lambda *a, **kw: True)
            self.assertEqual(first["status"], "requires_attention")
            self.assertEqual(client.writes, [{"Retry_Count": 1}])
            self.assertEqual(d.sweep_once(client=client, now=self.now,
                sender=lambda *a, **kw: self.fail("automatic second POST"),
                authority=lambda *a, **kw: True)["status"], "no_eligible_job")
    def test_fail_closed_when_marker_readback_missing(self):
        client = Airtable(candidate())
        client.get_record = lambda *a: candidate()
        result = d.sweep_once(client=client, now=self.now,
                              authority=lambda *a, **kw: True,
                              sender=lambda *a, **kw: self.fail("POST without readback"))
        self.assertEqual(result["reason_code"], "dispatch_marker_readback_failed")


if __name__ == "__main__":
    unittest.main()
