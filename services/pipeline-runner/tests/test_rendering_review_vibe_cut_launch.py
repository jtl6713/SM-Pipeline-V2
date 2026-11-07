from __future__ import annotations
from copy import deepcopy
import unittest

from rendering_review.vibe_cut_launch import launch_vibe_review_once
from rendering_review.isolated_launch import ReviewLaunchUnverified
from test_rendering_review_vibe_cut_revision import fixture
from test_rendering_review_isolated_launch import Adapter, Renderer, RENDERER

def setup():
    data=fixture()
    data["job"]["lease_owner"]="runner_lease_12345678"
    ops=Adapter(data["job"])
    renderer=Renderer()
    return data,ops,renderer

def launch(data,ops,renderer):
    return launch_vibe_review_once(**data,operations=ops,
        renderer=renderer,renderer_base=RENDERER)

class TestVibeLaunch(unittest.TestCase):
    def test_real_three_cut_music_only_plan_launches_once_without_publishing(self):
        d,ops,renderer=setup()
        v=launch(d,ops,renderer)
        self.assertTrue(v["ok"])
        self.assertEqual(v["media_kind"],"vibe_cut")
        self.assertEqual(v["expected_duration_seconds"],15)
        self.assertEqual(v["aspect_ratio"],"9:16")
        self.assertTrue(v["validation_required"])
        self.assertFalse(v["public_post_created"])
        self.assertFalse(v["original_output_modified"])
        self.assertEqual(ops.reservations,1)
        self.assertEqual(renderer.posts,1)
        again=launch(d,ops,renderer)
        self.assertFalse(again["ok"])
        self.assertEqual(again["status"],"reconciliation_required")
        self.assertEqual(renderer.posts,1)

    def test_wrong_brand_or_music_license_denies_before_reservation(self):
        for mutate in (
            lambda x:x["watermark"]["catalog_receipt"].update(profile_id="rec00000000000007"),
            lambda x:x["watermark"].update(render_url="https://example.test/logo.png"),
            lambda x:x["music"].update(license_verified=False),
            lambda x:x["plan"].update(allow_public_publish=True),
            lambda x:x["job"].update(profile_id="rec00000000000004"),
        ):
            d,ops,renderer=setup()
            mutate(d)
            with self.subTest(mutate=str(mutate)):
                with self.assertRaisesRegex(ReviewLaunchUnverified,"vibe_inputs"):
                    launch(d,ops,renderer)
                self.assertEqual(renderer.posts,0)
                self.assertIsNone(ops.reserved)

    def test_lost_hold_after_intent_cannot_invoke_remotion(self):
        d,ops,renderer=setup()
        ops.change_authority_after_reserve=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"authority_changed"):
            launch(d,ops,renderer)
        self.assertEqual(renderer.posts,0)
        self.assertEqual(ops.reservations,1)

    def test_ambiguous_render_response_requires_reconciliation_no_second_post(self):
        d,ops,renderer=setup()
        renderer.timeout=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"ambiguous_no_retry"):
            launch(d,ops,renderer)
        self.assertEqual(renderer.posts,1)
        self.assertEqual(ops.reservations,1)
        after=launch(d,ops,renderer)
        self.assertFalse(after["ok"])
        self.assertEqual(renderer.posts,1)

    def test_remote_status_url_cannot_switch_renderer_origin(self):
        d,ops,renderer=setup()
        renderer.status_url="https://untrusted.test/status/remotion_abc123"
        with self.assertRaisesRegex(ReviewLaunchUnverified,"receipt_untrusted"):
            launch(d,ops,renderer)
        self.assertEqual(renderer.posts,1)
        self.assertEqual(ops.reservations,1)

    def test_unverified_remotion_capacity_denies_without_intent(self):
        d,ops,renderer=setup()
        renderer.health_fail=True
        with self.assertRaisesRegex(ReviewLaunchUnverified,"capacity_unverified"):
            launch(d,ops,renderer)
        self.assertEqual(renderer.posts,0)
        self.assertIsNone(ops.reserved)

if __name__=="__main__":
    unittest.main()
