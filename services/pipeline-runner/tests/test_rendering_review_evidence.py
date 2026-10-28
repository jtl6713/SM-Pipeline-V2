import copy
import json
import unittest
from rendering_review.evidence import load_evidence, SESSIONS, OUTPUTS, CONTENT, REQUESTS, PROFILES, MEDIA
from rendering_review.producer import CHICAGO_PROFILE_ID

OUTPUT = "recA1B2C3D4E5F6G7"
SESSION = "session-12345678"
CONTENT_ID = "recB1B2C3D4E5F6G7"
REQUEST_ID = "recC1B2C3D4E5F6G7"


class EvidenceTests(unittest.TestCase):
    def fixture(self):
        session = {"schema": "studio.render-review.1", "id": SESSION, "output_id": OUTPUT,
                   "profile_id": CHICAGO_PROFILE_ID, "output_type": "Instagram Reel", "version": 3,
                   "state": "discussing", "review_hold": {"id": "hold-12345678", "active": True},
                   "messages": [{"role": "user", "content": "Explain the decision"}]}
        rows = {SESSIONS: [{"id": "recD1B2C3D4E5F6G7", "fields": {"Session_ID": SESSION, "Row_Version": 3, "Session_JSON": json.dumps(session)}}],
            OUTPUTS: {"id": OUTPUT, "fields": {"Platform": "Instagram", "Platform_Output_Type": "Instagram Reel",
                "Studio_Render_Review_Hold_Active": True, "Studio_Render_Review_Hold_ID": "hold-12345678",
                "Studio_Render_Review_Hold_Owner": SESSION, "Studio_Render_Review_Session_ID": SESSION, "Content_Item": [CONTENT_ID]}},
            CONTENT: {"id": CONTENT_ID, "fields": {"Content_Profile": [CHICAGO_PROFILE_ID], "Production_Request": [REQUEST_ID],
                "Content_Title": "Train directions", "Voiceover_Script": "Existing narration"}},
            REQUESTS: {"id": REQUEST_ID, "fields": {"Studio_Master_Assets_JSON": json.dumps([{"id": "asset-1", "name": "Station", "url": "private-url"}])}},
            PROFILES: {"id": CHICAGO_PROFILE_ID, "fields": {"Brand_Voice": "Practical"}}}
        class Client:
            def list_records(self, table, **kwargs):
                if table == MEDIA:
                    if "RECORD_ID()" in kwargs.get("formula", ""):
                        return copy.deepcopy(rows.get("linked_media", []))
                    return copy.deepcopy(rows.get("library_media", []))
                assert kwargs["max_records"] == 2
                assert OUTPUT in kwargs["formula"]
                return copy.deepcopy(rows[table])
            def get_record(self, table, record_id):
                return copy.deepcopy(rows[table])
        return Client(), rows

    def test_reads_authoritative_script_and_history_without_visual_claims(self):
        client, _ = self.fixture()
        e = load_evidence(client, OUTPUT, SESSION, 3)
        self.assertEqual(e["narration"], "Existing narration")
        self.assertEqual(e["messages"][0]["content"], "Explain the decision")
        self.assertNotIn("url", e["assets"][0])
        self.assertFalse(e["inspection"]["frames_inspected"])

    def test_existing_morning_still_and_wider_sunrise_photo_available_without_upload(self):
        client, rows = self.fixture()
        linked = "rec00000000000001"
        sunrise = "rec00000000000002"
        fields = {"Media_Class": "Image", "Asset_Status": "Available",
                  "Rights_Status": "Owned", "Active": True,
                  "Content_Profile": [CHICAGO_PROFILE_ID],
                  "Google Drive File ID": "1ABCDEFGHIJKLMNOPQRSTUV",
                  "Location": "Chicago Riverwalk"}
        rows[REQUESTS]["fields"]["Studio_Master_Assets_JSON"] = json.dumps([
            {"id": "source-morning", "name": "Chicago Riverwalk 8",
             "media_asset_record_id": linked,
             "google_drive_file_id": "1ABCDEFGHIJKLMNOPQRSTUV"}])
        rows[OUTPUTS]["fields"]["Remotion_Props_JSON"] = json.dumps({
            "compositionId": "ChicagoShiningPhotoSequence", "fps": 30,
            "clips": [{"mediaAssetRecordId": linked, "startFrame": 0,
                       "durationFrames": 90}]})
        rows["linked_media"] = [{"id": linked, "fields": {
            **fields, "Asset Name": "Chicago Riverwalk 8",
            "Time_Of_Day": "Morning",
            "Asset_Description": "Sunny riverwalk photograph.\n[watermarked:Chicago] ID: private"}}]
        rows["library_media"] = [{"id": sunrise, "fields": {
            **fields, "Asset Name": "Chicago River Bridge 8",
            "Time_Of_Day": "Sunrise",
            "Asset_Description": "Sunrise over downtown Chicago River"}}]
        e = load_evidence(client, OUTPUT, SESSION, 3)
        self.assertEqual(e["assets"][0]["time_of_day"], "Morning")
        self.assertEqual(e["assets"][0]["description"], "Sunny riverwalk photograph.")
        self.assertNotIn("Google Drive File ID", e["assets"][0])
        self.assertEqual(e["original_timeline"][0]["asset_id"], "source-morning")
        self.assertEqual(e["original_timeline"][0]["end_seconds"], 3.0)
        self.assertEqual(e["library_candidates"][0]["time_of_day"], "Sunrise")
        self.assertEqual(e["library_candidates"][0]["media_asset_record_id"], sunrise)
        self.assertFalse(e["inspection"]["frames_inspected"])
        self.assertFalse(e["library_candidates"][0]["frames_inspected"])

    def test_bad_rights_and_wrong_profile_never_reach_the_model(self):
        client, rows = self.fixture()
        rows["library_media"] = [
            {"id": "rec00000000000003", "fields": {
                "Asset Name": "Chicago River Bridge 8", "Media_Class": "Image",
                "Asset_Status": "Available", "Rights_Status": "Unknown", "Active": True,
                "Content_Profile": [CHICAGO_PROFILE_ID],
                "Google Drive File ID": "1ABCDEFGHIJKLMNOPQRSTUV",
                "Time_Of_Day": "Sunrise"}},
            {"id": "rec00000000000004", "fields": {
                "Asset Name": "Chicago Riverwalk 6", "Media_Class": "Image",
                "Asset_Status": "Available", "Rights_Status": "Owned", "Active": True,
                "Content_Profile": ["rec11111111111111"],
                "Google Drive File ID": "1ABCDEFGHIJKLMNOPQRSTUV",
                "Time_Of_Day": "Afternoon"}}]
        e = load_evidence(client, OUTPUT, SESSION, 3)
        self.assertEqual(e["library_candidates"], [])

    def test_stale_version_denies_before_model(self):
        client, _ = self.fixture()
        with self.assertRaisesRegex(ValueError, "Stale"): load_evidence(client, OUTPUT, SESSION, 2)

    def test_exact_hold_id_owner_and_active_required(self):
        for key, value in (("Studio_Render_Review_Hold_Active", False), ("Studio_Render_Review_Hold_ID", "replacement"),
                           ("Studio_Render_Review_Hold_Owner", "other"), ("Studio_Render_Review_Session_ID", "other")):
            client, rows = self.fixture()
            rows[OUTPUTS]["fields"][key] = value
            with self.assertRaisesRegex(ValueError, "hold"): load_evidence(client, OUTPUT, SESSION, 3)

    def test_duplicate_sessions_deny(self):
        client, rows = self.fixture()
        rows[SESSIONS] *= 2
        with self.assertRaisesRegex(ValueError, "exactly one"): load_evidence(client, OUTPUT, SESSION, 3)

    def test_profile_drift_and_publication_deny(self):
        client, rows = self.fixture()
        rows[CONTENT]["fields"]["Content_Profile"] = ["another-city"]
        with self.assertRaisesRegex(ValueError, "profile"): load_evidence(client, OUTPUT, SESSION, 3)
        for field in ("Publish_Started_At", "Publish_Locked_At", "Publish_Locked_By",
                      "Platform_Media_ID", "Platform_Post_ID", "Platform_Post_URL",
                      "Published_At"):
            with self.subTest(field=field):
                client, rows = self.fixture()
                rows[OUTPUTS]["fields"][field] = "saved-provider-identity"
                with self.assertRaisesRegex(ValueError, "publication"):
                    load_evidence(client, OUTPUT, SESSION, 3)


    def test_published_status_without_receipt_denies_model_planning(self):
        client, rows = self.fixture()
        rows[OUTPUTS]["fields"]["Publish_Status"] = "Published"
        with self.assertRaisesRegex(ValueError, "publication"):
            load_evidence(client, OUTPUT, SESSION, 3)

if __name__ == '__main__': unittest.main()
