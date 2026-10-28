import unittest
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

if __name__ == '__main__':
    unittest.main()
