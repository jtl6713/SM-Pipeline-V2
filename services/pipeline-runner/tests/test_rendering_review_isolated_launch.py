"""One-shot Remotion launch integration contract; no provider/network I/O."""
from __future__ import annotations

import unittest
from copy import deepcopy

from rendering_review.isolated_launch import (
    ReviewLaunchUnverified, launch_review_render_once,
)
from test_rendering_review_isolated_render import fixture

RENDERER="https://render.chicagoshining.com"


class Adapter:
    def __init__(self, job):
        self.job=job
        self.reserved=None
        self.receipt=None
        self.reads=0
        self.reservations=0
        self.events=[]
        self.change_authority_after_reserve=False
        self.skip_persist=False

    def read_authority(self, job_id):
        self.reads+=1
        return {
            "verified": True, "hold_active": True,
            "hold_owner_verified": True,
            "output_id": self.job["output_id"],
            "session_id": self.job["session_id"],
            "current_attempt_id": self.job["attempt_id"],
            "active_job_id": job_id,
            "active_plan_hash": self.job["plan_hash"],
            "job_state": "claimed",
            "lease_fence": self.job["lease_fence"],
            "lease_owner": self.job["lease_owner"],
            "published": False, "dispatch_started": False,
        } | ({"hold_active":False} if self.change_authority_after_reserve and self.reserved else {})

    def reserve_launch_intent(self, job_id, fence, payload_hash):
        self.reservations+=1
        if self.reserved:
            return {"created":False,"verified":True}
        self.reserved={"verified":True,"job_id":job_id,
                       "lease_fence":fence,"payload_hash":payload_hash}
        return {"created":True,"verified":True}

    def read_launch_intent(self, job_id):
        return deepcopy(self.reserved)

    def persist_launch_receipt(self, job_id, fence, payload_hash, remote_id, url):
        if not self.skip_persist:
            self.receipt={"verified":True,"job_id":job_id,
                          "lease_fence":fence,"payload_hash":payload_hash,
                          "remotion_job_id":remote_id,"status_url":url}

    def read_launch_receipt(self, job_id):
        return deepcopy(self.receipt)


class Renderer:
    def __init__(self):
        self.posts=0
        self.health_fail=False
        self.timeout=False
        self.status_url=RENDERER+"/status/remotion_abc123"

    def get_health(self):
        if self.health_fail:
            raise RuntimeError("Remotion offline")
        return {"remotionActiveRenders":0,"remotionMaxConcurrent":1}

    def post_render(self,payload):
        self.posts+=1
        if self.timeout:
            raise TimeoutError("Remotion accepted job but response was lost")
        return {"jobId":"remotion_abc123","statusUrl":self.status_url}


class LaunchTests(unittest.TestCase):
    def prep(self):
        args=fixture()
        args["job"]["lease_owner"]="runner_lease_12345678"
        operations=Adapter(args["job"])
        renderer=Renderer()
        return args,operations,renderer

    def launch(self,args,ops,renderer):
        return launch_review_render_once(
            **args,observed_source_segments=None,
            operations=ops,renderer=renderer,renderer_base=RENDERER)

    def test_once_only_and_remotion_receipt_readback(self):
        args,ops,renderer=self.prep()
        response=self.launch(args,ops,renderer)
        self.assertTrue(response["ok"])
        self.assertEqual(response["status"],"rendering")
        self.assertEqual(response["remotion_job_id"],"remotion_abc123")
        self.assertEqual(ops.reservations,1)
        self.assertEqual(renderer.posts,1)
        self.assertEqual(ops.reads,2)
        self.assertFalse(response["public_post_created"])
        self.assertFalse(response["original_output_modified"])
        again=self.launch(args,ops,renderer)
        self.assertFalse(again["ok"])
        self.assertEqual(again["status"],"reconciliation_required")
        self.assertEqual(renderer.posts,1)

    def test_lost_publisher_or_user_review_hold_denies_before_remotion(self):
        args,ops,renderer=self.prep()
        ops.read_authority=lambda _job:{"verified":True,"hold_active":False}
        with self.assertRaisesRegex(ReviewLaunchUnverified,"authority_changed"):
            self.launch(args,ops,renderer)
        self.assertEqual(renderer.posts,0)
        self.assertIsNone(ops.reserved)

    def test_hold_lost_after_durable_intent_never_starts_remote(self):
        args,ops,renderer=self.prep()
        ops.change_authority_after_reserve=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"authority_changed"):
            self.launch(args,ops,renderer)
        self.assertEqual(renderer.posts,0)
        self.assertIsNotNone(ops.reserved)

    def test_timing_or_drive_mismatch_blocks_without_launch_intent(self):
        args,ops,renderer=self.prep()
        args["source"]["drive_file_id"]="wrong"
        with self.assertRaisesRegex(ReviewLaunchUnverified,"render_inputs_not_verified"):
            self.launch(args,ops,renderer)
        self.assertIsNone(ops.reserved)
        self.assertEqual(renderer.posts,0)

    def test_unknown_remotion_capacity_fails_closed(self):
        args,ops,renderer=self.prep()
        renderer.health_fail=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"capacity_unverified"):
            self.launch(args,ops,renderer)
        self.assertEqual(renderer.posts,0)
        self.assertIsNone(ops.reserved)

    def test_remotion_timeout_never_causes_second_post(self):
        args,ops,renderer=self.prep()
        renderer.timeout=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"launch_ambiguous"):
            self.launch(args,ops,renderer)
        renderer.timeout=False
        again=self.launch(args,ops,renderer)
        self.assertFalse(again["ok"])
        self.assertEqual(again["status"],"reconciliation_required")
        self.assertEqual(renderer.posts,1)

    def test_untrusted_remote_status_url_leaves_intent_reserved(self):
        args,ops,renderer=self.prep()
        renderer.status_url="https://evil.test/status/remotion_abc123"
        with self.assertRaisesRegex(ReviewLaunchUnverified,"receipt_untrusted"):
            self.launch(args,ops,renderer)
        self.assertIsNotNone(ops.reserved)
        self.assertEqual(renderer.posts,1)

    def test_receipt_write_fails_without_relaunch(self):
        args,ops,renderer=self.prep()
        ops.skip_persist=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"remotion_receipt_readback_mismatch"):
            self.launch(args,ops,renderer)
        recovered=self.launch(args,ops,renderer)
        self.assertEqual(recovered["status"],"reconciliation_required")
        self.assertEqual(renderer.posts,1)

    def test_static_engine_never_mutates_original_output_or_publishes(self):
        import inspect
        from rendering_review import isolated_launch
        code=inspect.getsource(isolated_launch.launch_review_render_once)
        for token in ["update_record(","graph.publish(","media_publish(",
                      "start_job(","Delete_File","Platform_Post_ID"]:
            self.assertNotIn(token,code)


if __name__=="__main__":
    unittest.main()
