import unittest
import ast
import copy
from pathlib import Path
from publish.rendering_review import (REVIEW_MARKERS, rendering_review_reason,
    verify_before_reel_creation, verify_before_reel_publication)


class Client:
    def __init__(self, record):
        self.record = record
        self.reads = []

    def get_record(self, table, output_id):
        self.reads.append((table, output_id))
        return self.record


class ReviewPublicationTests(unittest.TestCase):
    def record(self, **fields):
        return {"id": "recA1B2C3D4E5F6G7", "fields": {"Do_Not_Publish": False, "Final_File_ID": "drive-1",
            "Publish_Asset_URL": "https://example.test/video.mp4", "Platform_Media_ID": "container-1", **fields}}

    def test_unselected_unchanged(self):
        self.assertIsNone(rendering_review_reason(self.record()))

    def test_every_marker_survives_factory_boolean_release(self):
        for marker in REVIEW_MARKERS:
            with self.subTest(marker=marker):
                self.assertEqual(rendering_review_reason(self.record(**{marker: True})), "rendering_review_requires_exact_approval")

    def test_fresh_hold_before_publication(self):
        previous = self.record()
        client = Client(self.record(Studio_Render_Review_Session_ID="session-1"))
        self.assertEqual(verify_before_reel_publication(client, "outputs", previous["id"], previous), "rendering_review_requires_exact_approval")
        self.assertEqual(client.reads, [("outputs", previous["id"])])

    def test_artifact_changed_during_poll(self):
        previous = self.record()
        for field in ("Final_File_ID", "Final_File_URL", "Publish_Asset_URL", "Platform_Media_ID"):
            with self.subTest(field=field):
                self.assertEqual(verify_before_reel_publication(Client(self.record(**{field: "changed"})), "outputs", previous["id"], previous), "publication_artifact_changed")

    def test_missing_authority_denies(self):
        previous = self.record()
        for result in (None, {}, {"id": previous["id"]}):
            self.assertEqual(verify_before_reel_publication(Client(result), "outputs", previous["id"], previous), "review_output_unavailable")

    def test_unrelated_hold_denies(self):
        previous = self.record()
        self.assertEqual(verify_before_reel_publication(Client(self.record(Do_Not_Publish=True)), "outputs", previous["id"], previous), "do_not_publish")

    def test_matching_legacy_artifact_passes(self):
        previous = self.record()
        self.assertIsNone(verify_before_reel_publication(Client(previous), "outputs", previous["id"], previous))

    def test_read_exception_propagates_to_fail_closed_caller(self):
        class Unavailable:
            def get_record(self, *args):
                raise RuntimeError("Airtable unavailable")
        with self.assertRaises(RuntimeError):
            verify_before_reel_publication(Unavailable(), "outputs", self.record()["id"], self.record())

    def test_precreate_fresh_read_denies_every_review_hold_marker(self):
        original = self.record(Platform_Media_ID="")
        for marker in REVIEW_MARKERS:
            with self.subTest(marker=marker):
                new_fields = {"Platform_Media_ID": "", marker: "rrhold-test"}
                changed = self.record(**new_fields)
                self.assertEqual(
                    verify_before_reel_creation(Client(changed), "outputs", original["id"], original),
                    "rendering_review_requires_exact_approval",
                )

    def test_precreate_refuses_remote_objects_and_artifact_drift(self):
        original = self.record(Platform_Media_ID="")
        for field in ("Platform_Media_ID", "Platform_Post_ID", "Platform_Post_URL", "Published_At"):
            with self.subTest(field=field):
                changed = self.record(**{"Platform_Media_ID": "", field: "remote-object"})
                self.assertEqual(verify_before_reel_creation(
                    Client(changed), "outputs", original["id"], original),
                    "remote_publication_already_started")
        altered = self.record(Platform_Media_ID="", Final_File_ID="different-render")
        self.assertEqual(verify_before_reel_creation(
            Client(altered), "outputs", original["id"], original), "publication_artifact_changed")

    def test_precreate_requires_exact_current_lock_and_blocks_prior_owners(self):
        original = self.record(Platform_Media_ID="", Publish_Locked_By="ap1-ig",
            Publish_Locked_At="2026-10-28T12:00:00Z", Publish_Started_At="2026-10-28T12:00:00Z",
            Publish_Status="Publishing")
        self.assertIsNone(verify_before_reel_creation(
            Client(original), "outputs", original["id"], original, require_lock=True))
        for patch in [
            {"Publish_Locked_By": "other-owner"},
            {"Publish_Locked_At": "different-lease-time"},
            {"Publish_Started_At": None},
            {"Publish_Status": "Ready to Publish"},
        ]:
            with self.subTest(patch=patch):
                changed = copy.deepcopy(original)
                changed["fields"].update(patch)
                self.assertEqual(verify_before_reel_creation(
                    Client(changed), "outputs", original["id"], original, require_lock=True),
                    "publication_lock_changed")
        self.assertEqual(verify_before_reel_creation(
            Client(original), "outputs", original["id"], original), "publication_lock_already_owned")

class ProcessorBoundaryTests(unittest.TestCase):
    def exercise(self, after_poll, *, before_create=None, new_container=False,
                 after_lock=None, before_lock=None, location_failure=False,
                 after_location_failure=None, fail_at_read=None,
                 shared_claim=False, shared_claim_error=None):
        # Execute the real processor function with fixture transports. No
        # provider, Airtable, mirror, media, or scheduling service is contacted.
        source = Path(__file__).parents[1] / "ap1_ig" / "processor.py"
        tree = ast.parse(source.read_text())
        names = {"_append_notes", "_preview", "process_request", "_is_in_progress",
                 "_release_preflight_lock_if_exact_owner"}
        selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        current = ReviewPublicationTests().record(
            Platform_Media_ID="" if new_container else "container-1"
        )
        counters = {"publish": 0, "create": 0, "reads": 0, "writes": 0}
        GraphError = type("GraphError", (Exception,), {})
        class Transport:
            def get_record(self, table, output_id):
                counters["reads"] += 1
                # First read = eligibility; second = fresh pre-Graph fence.
                if counters["reads"] == 2 and before_create:
                    current["fields"].update(before_create)
                if (counters["reads"] > 2 and after_poll == "unavailable") or counters["reads"] == fail_at_read:
                    raise RuntimeError("Airtable unavailable")
                return copy.deepcopy(current)
            def update_record(self, table, output_id, fields, **kw):
                counters["writes"] += 1
                current["fields"].update(fields)
                if after_lock and "Publish_Locked_By" in fields:
                    current["fields"].update(after_lock)
        client = Transport()
        class Graph:
            def __init__(self, **kw):
                pass
            def create_reel(self, body):
                counters["create"] += 1
                if location_failure and counters["create"] == 1:
                    if after_location_failure:
                        current["fields"].update(after_location_failure)
                    raise GraphError("LOCATION invalid")
                return {"id": "container-new"}
            def wait_for_container(self, *args, **kw):
                if isinstance(after_poll, dict):
                    current["fields"].update(after_poll)
            def publish(self, creation_id):
                counters["publish"] += 1
                return {"id": "fixture-post"}
            def media_meta(self, media_id):
                return {"permalink": "https://example.test/fixture"}
        field = lambda record, key: record["fields"].get(key)
        class ClaimError(Exception):
            pass
        def fake_claim(output):
            if shared_claim_error:
                raise ClaimError("publisher_shared_claim_unverified")
            counters["shared_claim"] = counters.get("shared_claim", 0) + 1
            return {"ok": True}
        namespace = {
            "shared_dispatch_claim_required": lambda _output_id=None: shared_claim,
            "ig_publish_lease_required": lambda: False,
            "IgPublishLeaseError": type("IgPublishLeaseError", (Exception,), {}),
            "ReviewDispatchClaimError": ClaimError,
            "is_chicago_reel": lambda _client, _output: True,
            "claim_chicago_dispatch": fake_claim,
            "Any": object, "AirtableClient": lambda: client, "RECORD_ID_PREFIX": "rec",
            "PLATFORM_OUTPUTS_TABLE": "outputs", "field": field,
            "field_str": lambda r, k: str(field(r, k) or ""),
            "eligibility_reason": lambda *a, **kw: None,
            "ensure_public_cover_url": lambda *a: None,
            "native_grid_cover_required": lambda *a: False,
            "PipelineSettings": lambda c: {},
            "load_instagram_graph_settings": lambda *a, **kw: {"ig_user_id": "fixture", "token": "fixture", "version": "fixture"},
            "InstagramGraphError": GraphError,
            "InstagramReelClient": Graph,
            "resolve_publish_location": lambda *a, **kw: (current["fields"].update(before_lock) if before_lock else None),
            "reel_create_body": lambda *a, **kw: {
                "video_url": current["fields"]["Publish_Asset_URL"],
                **({"location_id": "bad-place"} if location_failure else {}),
            },
            "parse_int": lambda v, default: int(v or default),
            "stamp_minutes": lambda: "fixture", "iso_utc": lambda: "fixture",
            "verify_before_reel_publication": verify_before_reel_publication,
            "verify_before_reel_creation": verify_before_reel_creation,
            "MAKE_SCENARIO_ID": 0, "MAKE_SCENARIO_NAME": "fixture",
            "PUBLISH_LOCKED_BY": "fixture", "PUBLISH_STATUS_PUBLISHING": "Publishing",
            "PUBLISH_STATUS_PUBLISHED": "Published", "PUBLISH_METHOD": "Automated",
        }
        exec(compile(ast.Module(body=selected, type_ignores=[]), str(source), "exec"), namespace)
        result = namespace["process_request"](output_record_id=current["id"])
        return result, counters, current

    def test_hold_created_during_poll_prevents_real_processor_publish(self):
        result, calls, current = self.exercise({"Studio_Render_Review_Hold_ID": "hold-new"})
        self.assertFalse(result["processed"])
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(current["fields"]["Platform_Media_ID"], "container-1")
        self.assertEqual(current["fields"]["Studio_Render_Review_Hold_ID"], "hold-new")

    def test_unavailable_final_read_prevents_real_processor_publish(self):
        result, calls, _ = self.exercise("unavailable")
        self.assertEqual(result["reason"], "review_authority_unavailable")
        self.assertEqual(calls["publish"], 0)

    def test_changed_video_prevents_real_processor_publish(self):
        result, calls, _ = self.exercise({"Final_File_ID": "new-render"})
        self.assertEqual(result["reason"], "publication_artifact_changed")
        self.assertEqual(calls["publish"], 0)

    def test_hold_claimed_after_initial_snapshot_blocks_first_graph_create(self):
        result, calls, current = self.exercise(
            None, before_create={"Studio_Render_Review_Hold_ID": "review-hold-new"},
            new_container=True
        )
        self.assertFalse(result["processed"])
        self.assertEqual(result["reason"], "rendering_review_requires_exact_approval")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(current["fields"]["Platform_Media_ID"], "")
        self.assertEqual(current["fields"]["Studio_Render_Review_Hold_ID"], "review-hold-new")

    def test_container_identity_changed_after_first_read_blocks_graph_create(self):
        result, calls, current = self.exercise(
            None, before_create={"Platform_Media_ID": "another-dispatch-container"},
            new_container=True
        )
        self.assertEqual(result["reason"], "remote_publication_already_started")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(current["fields"]["Platform_Media_ID"], "another-dispatch-container")

    def test_review_hold_before_publish_lock_avoids_any_worker_write(self):
        result, calls, current = self.exercise(None, new_container=True,
            before_lock={"Studio_Render_Review_Hold_ID": "rrhold-before-lock"})
        self.assertEqual(result["reason"], "rendering_review_requires_exact_approval")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(calls["writes"], 0)
        self.assertEqual(current["fields"]["Studio_Render_Review_Hold_ID"], "rrhold-before-lock")

    def test_review_hold_claimed_after_lock_blocks_first_create(self):
        result, calls, current = self.exercise(None, new_container=True,
            after_lock={"Studio_Render_Review_Hold_ID": "rrhold-after-lock"})
        self.assertEqual(result["reason"], "rendering_review_requires_exact_approval")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(current["fields"]["Studio_Render_Review_Hold_ID"], "rrhold-after-lock")

    def test_missing_authority_after_lock_blocks_first_create(self):
        result, calls, _ = self.exercise(None, new_container=True, fail_at_read=3)
        self.assertEqual(result["reason"], "review_authority_unavailable")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)

    def test_new_remote_container_after_lock_blocks_second_create(self):
        result, calls, current = self.exercise(None, new_container=True,
            after_lock={"Platform_Media_ID": "other-dispatch-container"})
        self.assertEqual(result["reason"], "remote_publication_already_started")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(current["fields"]["Platform_Media_ID"], "other-dispatch-container")

    def test_review_hold_during_location_retry_stops_second_create(self):
        result, calls, _ = self.exercise(None, new_container=True,
            location_failure=True,
            after_location_failure={"Studio_Render_Review_Hold_ID": "rrhold-after-location"})
        self.assertEqual(result["reason"], "rendering_review_requires_exact_approval")
        self.assertEqual(calls["create"], 1)
        self.assertEqual(calls["publish"], 0)

    def test_shared_claim_denial_blocks_graph_before_python_lock_patch(self):
        result, calls, _ = self.exercise(
            None, new_container=True, shared_claim=True, shared_claim_error=True)
        self.assertEqual(result["reason"], "publisher_shared_claim_unverified")
        self.assertEqual(calls["create"], 0)
        self.assertEqual(calls["publish"], 0)
        self.assertEqual(calls["writes"], 0)

    def test_verified_chicago_shared_claim_allows_existing_graph_flow(self):
        result, calls, _ = self.exercise(None, new_container=True, shared_claim=True)
        self.assertTrue(result["processed"])
        self.assertEqual(calls["shared_claim"], 1)
        self.assertEqual(calls["create"], 1)
        self.assertEqual(calls["publish"], 1)

    def test_unheld_new_reel_can_still_create_and_publish(self):
        result, calls, _ = self.exercise(None, new_container=True)
        self.assertTrue(result["processed"])
        self.assertEqual(calls["create"], 1)
        self.assertEqual(calls["publish"], 1)

    def test_unselected_matching_video_uses_existing_publish_flow(self):
        result, calls, _ = self.exercise(None)
        self.assertTrue(result["processed"])
        self.assertEqual(calls["publish"], 1)

if __name__ == '__main__':
    unittest.main()
