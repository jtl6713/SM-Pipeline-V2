import hashlib
import json
import os
import unittest
from unittest.mock import patch

from rendering_review.native_gallery_c5c6_executor import (
    NativeGalleryExecutionDenied, _json_hash, execute_one_native_gallery,
)

O = "rec00000000000001"
P = "rec00000000000002"
C = "rec00000000000003"
S = "rec00000000000004"
R = "rec00000000000005"
J = "ngjob_012345678901234567890"
L = "ngrunner_0123456789012345"
D = "original_drive_file_123456789012"
ND = "new_staged_drive_file_12345678901"
FOLDER = "private_native_staging_012345678"
SECRET = "native-gallery-service-secret-123456789"
OLD = {"slot_id": S, "order": 1, "output_id": O,
       "profile_id": P, "content_item_id": C, "drive_file_id": D,
       "sha256": "a"*64, "mime_type": "image/png",
       "byte_count": 2048, "width": 1080, "height": 1350,
       "watermark_verified": True, "rights_verified": True}
PLAN = {"output_id": O, "profile_id": P, "content_item_id": C,
        "original_manifest_sha256": "b"*64,
        "selected": [{"slide_id": S, "order": 1,
                      "instruction": "Brighten this verified Chicago skyline."}],
        "human_intent": "explicit_button", "allow_public_publish": False,
        "auto_approve": False,
        "mutate_original_production_request": False,
        "mutate_sibling_outputs": False}
CLAIM = {"job_id": J, "output_id": O, "lease_owner": L,
         "lease_fence": 1, "lease_verified": True}
INTENT = {"may_generate": True, "publication_authorized": False,
          "payload_hash": "d"*64}


class Client:
    def __init__(self):
        self.fields = {
            "Job_ID": J, "Output_Record_ID": O, "Profile_Record_ID": P,
            "Content_Item_Record_ID": C, "Job_State": "claimed",
            "Row_Version": 3, "Lease_Owner": L, "Lease_Fence": 1,
            "Launch_Intent_SHA256": "d"*64,
            "Original_Manifest_SHA256": "b"*64,
            "Plan_SHA256": _json_hash(PLAN),
            "Plan_JSON": json.dumps(PLAN, separators=(",", ":")),
            "Original_Manifest_JSON": json.dumps([OLD]),
            "Event_History_JSON": json.dumps([
                {"event": "native_gallery_job_created", "publication_authorized": False},
                {"event": "native_gallery_job_claimed", "publication_authorized": False},
                {"event": "native_gallery_launch_intent_reserved",
                 "lease_owner": L, "lease_fence": 1,
                 "payload_hash": "d"*64, "publication_authorized": False}
            ]),
            "Hold_ID": "hold_12345678", "Hold_Owner": "owner_12345678",
        }

    def list_records(self, *_args, **_kwargs):
        return [{"id": R, "fields": self.fields}]

    def get_record(self, *_args, **_kwargs):
        return {"id": O, "fields": {
            "Content_Item": [C], "Do_Not_Publish": True,
            "Platform_Output_Type": "IG Carousel",
            "Studio_Render_Review_Hold_Active": True,
            "Studio_Render_Review_Hold_ID": "hold_12345678",
            "Studio_Render_Review_Hold_Owner": "owner_12345678",
            "Studio_Render_Review_Session_ID": "owner_12345678",
        }}


class Media:
    def __init__(self):
        self.calls = 0
        self.profile_watermark = b"watermark-bytes"

    def generate_image(self, prompt, ratio):
        self.calls += 1
        assert ratio == "4:5"
        return b"generated"

    def watermark_image(self, raw, profile_id):
        assert profile_id == P
        assert raw == b"generated"
        return b"branded"

    def upload_image(self, name, content):
        assert content == b"branded"
        assert name.endswith("-01.png")
        return {"id": ND}

    def verify_drive_image(self, file_id, _sha, count):
        assert file_id == ND
        assert count == len(b"branded")
        return {"sha256": hashlib.sha256(b"branded").hexdigest(),
                "byte_count": len(b"branded"), "mime_type": "image/png",
                "google_drive_verified": True,
                "width": 1080, "height": 1350}


class C5C6Tests(unittest.TestCase):
    def run_job(self, *, refused=False, lost_hold=False):
        client, media, sends = Client(), Media(), []
        if lost_hold:
            client.get_record = lambda *_args, **_kwargs: {"id": O, "fields": {}}
        def transport(url, body, headers, timeout):
            sends.append((url, body))
            assert headers["X-Native-Gallery-Job-Secret"] == SECRET
            return {"ok": True, "replay": False, "job_id": J,
                    "output_id": O,
                    "manifest_sha256": _json_hash(body["revision_artifacts"]),
                    "publication_authorized": False,
                    "factory_approved": False, "creative_approved": False}
        patches = [
            patch("rendering_review.native_gallery_c5c6_executor.claim_one_native_gallery_job",
                  return_value={"claimed": True, "receipt": CLAIM}),
            patch("rendering_review.native_gallery_c5c6_executor.reserve_native_gallery_launch",
                  return_value=({**INTENT, "may_generate": False} if refused else INTENT)),
            patch("rendering_review.native_gallery_c5c6_executor.read_authoritative_gallery_source",
                  return_value={"content_item_id": C,
                                "original_artifacts_sha256": "b"*64,
                                "artifacts": [OLD], "sources_byte_verified": True,
                                "original_artifact_watermark_verified": True,
                                "aspect_ratio": "4:5", "platform": "Instagram"}),
            patch("rendering_review.native_gallery_c5c6_executor.GalleryMediaIO.from_profile_catalog",
                  return_value=media),
            patch("rendering_review.native_gallery_c5c6_executor.visible_source_watermark",
                  return_value=True),
            patch("rendering_review.native_gallery_c5c6_executor.private_permissions",
                  return_value=True),
            patch("rendering_review.native_gallery_c5c6_executor.register_native_gallery_rights",
                  return_value={"media_asset_record_id": R}),
        ]
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true"}):
            for p in patches:
                p.start()
            try:
                if refused or lost_hold:
                    with self.assertRaises(NativeGalleryExecutionDenied):
                        execute_one_native_gallery(
                            client=client, drive=object(),
                            worker_base="https://studio.example.com",
                            shared_secret=SECRET, consumer_identity=L,
                            staging_folder_id=FOLDER,
                            rights_clearance=lambda **_: {"approved": True},
                            transport=transport)
                else:
                    result = execute_one_native_gallery(
                        client=client, drive=object(),
                        worker_base="https://studio.example.com",
                        shared_secret=SECRET, consumer_identity=L,
                        staging_folder_id=FOLDER,
                        rights_clearance=lambda **_: {"approved": True},
                        transport=transport)
                    self.assertEqual(result["state"], "ready_for_review")
                    self.assertFalse(result["publication_authorized"])
                    self.assertEqual(len(sends), 1)
            finally:
                for p in reversed(patches):
                    p.stop()
        return media.calls, sends

    def test_generation_and_private_commit_once(self):
        calls, sends = self.run_job()
        self.assertEqual(calls, 1)
        self.assertTrue(sends[0][0].endswith("/commit-manifest"))

    def test_replay_refused_before_generator(self):
        calls, sends = self.run_job(refused=True)
        self.assertEqual(calls, 0)
        self.assertEqual(sends, [])

    def test_lost_hold_refused_before_generator(self):
        calls, sends = self.run_job(lost_hold=True)
        self.assertEqual(calls, 0)
        self.assertEqual(sends, [])


if __name__ == "__main__":
    unittest.main()
