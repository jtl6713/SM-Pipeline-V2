import unittest
import ast
import copy
from pathlib import Path
from publish.rendering_review import REVIEW_MARKERS, rendering_review_reason, verify_before_reel_publication


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

class ProcessorBoundaryTests(unittest.TestCase):
    def exercise(self, after_poll):
        # Execute the real processor function with fixture transports. No
        # provider, Airtable, mirror, media, or scheduling service is contacted.
        source = Path(__file__).parents[1] / "ap1_ig" / "processor.py"
        tree = ast.parse(source.read_text())
        names = {"_append_notes", "_preview", "process_request", "_is_in_progress"}
        selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
        current = ReviewPublicationTests().record(Platform_Media_ID="container-1")
        counters = {"publish": 0, "reads": 0}
        class Transport:
            def get_record(self, table, output_id):
                counters["reads"] += 1
                if counters["reads"] > 1 and after_poll == "unavailable":
                    raise RuntimeError("Airtable unavailable")
                return copy.deepcopy(current)
            def update_record(self, table, output_id, fields, **kw):
                current["fields"].update(fields)
        client = Transport()
        class Graph:
            def __init__(self, **kw):
                pass
            def wait_for_container(self, *args, **kw):
                if isinstance(after_poll, dict):
                    current["fields"].update(after_poll)
            def publish(self, creation_id):
                counters["publish"] += 1
                return {"id": "fixture-post"}
            def media_meta(self, media_id):
                return {"permalink": "https://example.test/fixture"}
        field = lambda record, key: record["fields"].get(key)
        namespace = {
            "Any": object, "AirtableClient": lambda: client, "RECORD_ID_PREFIX": "rec",
            "PLATFORM_OUTPUTS_TABLE": "outputs", "field": field,
            "field_str": lambda r, k: str(field(r, k) or ""),
            "eligibility_reason": lambda *a, **kw: None,
            "ensure_public_cover_url": lambda *a: None,
            "native_grid_cover_required": lambda *a: False,
            "PipelineSettings": lambda c: {},
            "load_instagram_graph_settings": lambda *a, **kw: {"ig_user_id": "fixture", "token": "fixture", "version": "fixture"},
            "InstagramGraphError": type("GraphError", (Exception,), {}),
            "InstagramReelClient": Graph,
            "resolve_publish_location": lambda *a, **kw: None,
            "reel_create_body": lambda *a, **kw: {"video_url": current["fields"]["Publish_Asset_URL"]},
            "parse_int": lambda v, default: int(v or default),
            "stamp_minutes": lambda: "fixture", "iso_utc": lambda: "fixture",
            "verify_before_reel_publication": verify_before_reel_publication,
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

    def test_unselected_matching_video_uses_existing_publish_flow(self):
        result, calls, _ = self.exercise(None)
        self.assertTrue(result["processed"])
        self.assertEqual(calls["publish"], 1)

if __name__ == '__main__':
    unittest.main()
