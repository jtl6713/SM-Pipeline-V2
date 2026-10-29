"""No-launch proof and idempotent exact-job recovery; all tests are offline."""
import copy
import json
import os
import threading
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.recovery import (
    require_unlaunched_authority, ReviewRecoveryDenied,
)
from rendering_review.one_job_http import (
    create_exact_review_render_blueprint, _ACTIVE, _RESULTS, _LOCK,
)

OUTPUT = "rec0uVrVeiUM6shp9"
JOB = "rrjob_26054929500b8abe981e3f6131b5c668209bf9c765edb06c"
ATTEMPT = "rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c"
SESSION = "rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796"
V1 = "1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4"
HASH = "9fe906751435e1ea0923fd755d16dade990bc6d3e991c59f939069ceb1028bac"


def snapshot():
    return {
        "output": {"id": OUTPUT, "fields": {
            "Do_Not_Publish": True, "Studio_Render_Review_Hold_Active": True,
            "Final_File_ID": V1,
        }},
        "job": {"fields": {
            "Job_ID": JOB, "Output_Record_ID": OUTPUT,
            "Session_ID": SESSION, "Attempt_ID": ATTEMPT, "Job_State": "queued",
            "Progress_Stage": "awaiting_isolated_renderer",
            "Progress_Percent": 0, "Lease_Fence": 0,
            "Event_History_JSON": "[]", "Plan_Hash": HASH,
        }},
        "attempt": {"fields": {
            "Attempt_ID": ATTEMPT, "Output_Record_ID": OUTPUT,
            "Job_ID": JOB, "Attempt_Number": 2, "Attempt_Status": "queued",
        }},
        "session": {"fields": {
            "Session_JSON": json.dumps({
                "id": SESSION, "output_id": OUTPUT, "state": "queued",
                "review_hold": {"active": True}, "current_attempt_id": ATTEMPT,
                "active_job": {"id": JOB, "attempt_id": ATTEMPT,
                               "plan_hash": HASH},
                "attempts": [
                    {"id": "rroriginal", "number": 1, "artifact_id": V1},
                    {"id": ATTEMPT, "number": 2, "status": "queued",
                     "artifact_id": None, "job_id": JOB}],
            }),
        }},
    }


class FakeClient:
    def __init__(self, data):
        self.data = data
        self.reads = []

    def get_record(self, table, rid):
        self.reads.append(("get", table, rid))
        return copy.deepcopy(self.data["output"])


def verified(data):
    client = FakeClient(data)
    rows = {"Job_ID": data["job"], "Attempt_ID": data["attempt"],
            "Output_Record_ID": data["session"]}
    def select(client_, table, field, value):
        client.reads.append(("select", table, field, value))
        return copy.deepcopy(rows[field])
    with patch("rendering_review.recovery.select_one", side_effect=select):
        outcome = require_unlaunched_authority(OUTPUT, JOB, client=client)
    return outcome, client.reads


class RecoveryProof(unittest.TestCase):
    def test_authoritative_unlaunched_job_is_accepted_without_writes(self):
        result, calls = verified(snapshot())
        self.assertTrue(result)
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(x[0] in ("select", "get") for x in calls))

    def test_exact_existing_claim_can_replay_only_before_any_launch_intent(self):
        data=snapshot()
        job=data["job"]["fields"]
        job["Job_State"]="claimed"
        job["Progress_Stage"]="claimed"
        job["Lease_Fence"]=1
        job["Lease_Owner"]="rrrunner_588b9c34df9a2b95e9f11e15b0cbdb1776a9d1d5dbe31854"
        self.assertTrue(verified(data)[0])
        for changed in (
            {"Lease_Owner":"another-runner"},
            {"Lease_Fence":2},
            {"Event_History_JSON":json.dumps([{"kind":"review_remotion_launch_intent"}])},
            {"Progress_Stage":"voiceover_uploaded"},
            {"Progress_Percent":25},
        ):
            with self.subTest(change=changed):
                unsafe=copy.deepcopy(data)
                unsafe["job"]["fields"].update(changed)
                with self.assertRaises(ReviewRecoveryDenied):
                    verified(unsafe)

    def test_all_possible_previous_launch_indicators_are_denied(self):
        mutations = [
            ("job", "Job_State", "claimed"),
            ("job", "Lease_Fence", 1),
            ("job", "Lease_Owner", "another-worker"),
            ("job", "Event_History_JSON", '[{"type":"LAUNCH_INTENT"}]'),
            ("job", "Progress_Percent", 35),
            ("job", "Progress_Stage", "rendering"),
            ("attempt", "Attempt_Status", "rendering"),
            ("attempt", "Artifact_File_ID", "file2"),
            ("attempt", "Validation_Evidence_JSON", "{}"),
            ("output", "Do_Not_Publish", False),
            ("output", "Studio_Render_Review_Hold_Active", False),
            ("output", "Platform_Post_ID", "already-posted"),
            ("output", "Final_File_ID", None),
        ]
        for row, key, value in mutations:
            with self.subTest(key=key):
                data = snapshot()
                data[row]["fields"][key] = value
                with self.assertRaises(ReviewRecoveryDenied):
                    verified(data)

    def test_session_version_and_attempt_identity_must_be_current(self):
        for change in [
            lambda d: d.update({"state": "published"}),
            lambda d: d["active_job"].update({"id": "anotherjob"}),
            lambda d: d["review_hold"].update({"active": False}),
            lambda d: d["attempts"][1].update({"artifact_id": "already-rendered"}),
        ]:
            data = snapshot()
            session = json.loads(data["session"]["fields"]["Session_JSON"])
            change(session)
            data["session"]["fields"]["Session_JSON"] = json.dumps(session)
            with self.assertRaises(ReviewRecoveryDenied):
                verified(data)


class RecoveryEndpoint(unittest.TestCase):
    def setUp(self):
        self.old = {k: os.environ.get(k) for k in
                    ("RENDERING_REVIEW_EXACT_RENDER_ENABLED", "RENDERING_REVIEW_EXACT_OUTPUT_ID")}
        os.environ["RENDERING_REVIEW_EXACT_RENDER_ENABLED"] = "true"
        os.environ["RENDERING_REVIEW_EXACT_OUTPUT_ID"] = OUTPUT
        with _LOCK:
            _ACTIVE.clear()
            _RESULTS.clear()

    def tearDown(self):
        for key, value in self.old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        with _LOCK:
            _ACTIVE.clear()
            _RESULTS.clear()

    def client(self, guard, runner=None):
        calls = []
        done = threading.Event()
        def fake_runner(output, job):
            calls.append((output, job))
            done.set()
            return {"ok": True, "attempt_id": ATTEMPT,
                    "drive_file_id": "v2private"}
        app = Flask(__name__)
        app.register_blueprint(create_exact_review_render_blueprint(
            {"pipeline_runner_shared_secret": "x" * 32},
            runner=runner or fake_runner, recovery_guard=guard))
        return app.test_client(), calls, done

    def test_same_job_only_and_no_second_execution(self):
        checks = []
        client, calls, done = self.client(lambda o, j: checks.append((o, j)) or True)
        with _LOCK:
            _RESULTS[JOB] = {"state": "needs_reconciliation"}
        body = {"output_id": OUTPUT, "job_id": JOB}
        headers = {"X-Pipeline-Secret": "x" * 32}
        reply = client.post("/jobs/rendering-review/reconcile-exact",
                            json=body, headers=headers)
        self.assertEqual(reply.status_code, 202)
        self.assertTrue(done.wait(3))
        self.assertEqual(calls, [(OUTPUT, JOB)])
        self.assertEqual(checks, [(OUTPUT, JOB)])
        duplicate = client.post("/jobs/rendering-review/reconcile-exact",
                                json=body, headers=headers)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(len(calls), 1)
        self.assertFalse(reply.json["public_post_created"])

    def test_unverified_or_unauthenticated_cannot_launch(self):
        client, calls, done = self.client(lambda *_: False)
        body = {"output_id": OUTPUT, "job_id": JOB}
        self.assertEqual(client.post("/jobs/rendering-review/reconcile-exact",
                                     json=body).status_code, 401)
        reply = client.post("/jobs/rendering-review/reconcile-exact", json=body,
                            headers={"X-Pipeline-Secret": "x" * 32})
        self.assertEqual(reply.status_code, 409)
        self.assertEqual(calls, [])
        self.assertFalse(done.is_set())

    def test_known_running_or_finished_never_reconciles(self):
        checks = []
        client, calls, _ = self.client(lambda o, j: checks.append(True) or True)
        for state in ("accepted", "rendering", "ready_for_review"):
            with _LOCK:
                _RESULTS[JOB] = {"state": state}
            reply = client.post("/jobs/rendering-review/reconcile-exact",
                                json={"output_id": OUTPUT, "job_id": JOB},
                                headers={"X-Pipeline-Secret": "x" * 32})
            self.assertEqual(reply.status_code, 409)
        self.assertFalse(checks)
        self.assertFalse(calls)


if __name__ == "__main__":
    unittest.main()
