from __future__ import annotations

from copy import deepcopy
import hashlib
import unittest

from rendering_review.gallery_attempt import (
    GalleryRevisionDenied, build_isolated_gallery_attempt,
)

OID = "rec00000000000001"
PID = "rec00000000000002"
JOB = {
    "output_id": OID, "profile_id": PID,
    "attempt_id": "rrattempt_01234567890",
    "job_id": "rrjob_01234567890",
    "session_id": "rrsession_01234567890",
    "plan_hash": "a" * 64, "state": "claimed",
    "lease_verified": True, "lease_fence": 3,
}
def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def original():
    slides = []
    for i in range(1, 4):
        slides.append({
            "slot_id": f"rec{i:014d}", "order": i,
            "drive_file_id": f"drive-original-{i}-abcdefghijklmnopqrstuvwxyz",
            "mime_type": "image/png", "byte_count": 120000,
            "width": 1080, "height": 1350, "sha256": digest(str(i).encode()),
            "canonical_media_authority": "google_drive", "authority": "server",
            "verified": True, "google_drive_verified": True,
            "watermark_verified": True, "rights_verified": True,
            "output_id": OID, "profile_id": PID,
        })
    return {
        "schema": "studio.render-review.gallery.1",
        "source_kind": "original", "media_kind": "image-set",
        "authority": "server", "verified": True,
        "output_id": OID, "profile_id": PID, "aspect_ratio": "4:5",
        "manifest_sha256": "b" * 64, "artifacts": slides,
    }

def plan():
    return {
        "output_id": OID, "profile_id": PID,
        "session_id": JOB["session_id"], "plan_hash": JOB["plan_hash"],
        "source_attempt_id": "rroriginal_01234567890",
        "original_manifest_sha256": "b" * 64,
        "aspect_ratio": "4:5", "human_intent": "explicit_button",
        "allow_platform_upload": False, "allow_public_publish": False,
        "auto_approve": False, "mutate_original_production_request": False,
        "mutate_sibling_outputs": False,
        "replacements": [{
            "slot_id": "rec00000000000002",
            "prompt": "Replace the incorrect night photo with an owned daytime photo.",
        }],
    }

class Operations:
    def __init__(self):
        self.hold = True
        self.reserved = False
        self.generated = 0
        self.watermarked = 0
        self.uploaded = 0
        self.committed = None
        self.last_branded = None\n        self.original_verified = True

    def verify_hold(self, output_id, session_id):
        assert output_id == OID and session_id == JOB["session_id"]
        return self.hold

    def verify_original_sources(self, original):\n        assert original["source_kind"] == "original"\n        return self.original_verified\n\n    def reserve_attempt(self, job, original_hash, changes_hash):
        assert original_hash == "b"*64
        assert len(changes_hash) == 64
        if self.reserved:
            return False
        self.reserved = True
        return True

    def generate_image(self, prompt, ratio):
        assert ratio == "4:5" and "daytime" in prompt
        self.generated += 1
        return b"i" * 1600

    def watermark_image(self, data, profile_id):
        assert data == b"i" * 1600 and profile_id == PID
        self.watermarked += 1
        self.last_branded = data + b"watermark-overlay"
        return self.last_branded

    def upload_image(self, name, data):
        assert name.startswith("review-"+OID+"-")
        assert data == self.last_branded
        self.uploaded += 1
        return {"id": "file-new-owned-daytime-abcdefghijklmnopqrstuvwxyz"}

    def verify_drive_image(self, file_id, sha256, byte_count):
        assert file_id.startswith("file-new-owned")
        assert sha256 == digest(self.last_branded)
        assert byte_count == len(self.last_branded)
        return {
            "google_drive_verified": True, "sha256": sha256,
            "byte_count": byte_count, "mime_type": "image/png",
            "width": 1080, "height": 1350,
        }

    def verify_generated_rights(self, output_id, slot_id, file_id, prompt, sha256):
        assert output_id == OID and slot_id == "rec00000000000002"
        assert file_id.startswith("file-new-owned")
        assert "daytime" in prompt and len(sha256) == 64
        return True

    def commit_manifest(self, job, manifest):
        assert job["attempt_id"] == manifest["attempt_id"]
        self.committed = deepcopy(manifest)
        return True

    def read_manifest(self, job):
        return deepcopy(self.committed)

def run(*, source=None, intent=None, job=None, ops=None, profiles=None):
    return build_isolated_gallery_attempt(
        job=deepcopy(job or JOB), original=deepcopy(source or original()),
        plan=deepcopy(intent or plan()), authorized_profiles=profiles if profiles is not None else [PID],
        operations=ops or Operations(),
    )

class TestIsolatedGallery(unittest.TestCase):
    def test_one_owned_slide_changes_and_originals_are_not_mutated(self):
        ops = Operations()
        source = original()
        saved = deepcopy(source)
        result = run(source=source, ops=ops)
        self.assertTrue(result["ok"])
        self.assertEqual(result["rendered_count"], 1)
        self.assertFalse(result["approved"])
        self.assertFalse(result["published"])
        self.assertEqual(ops.generated, 1)
        self.assertEqual(ops.watermarked, 1)
        self.assertEqual(ops.uploaded, 1)
        self.assertEqual(source, saved)
        target = ops.committed
        self.assertEqual(target["artifacts"][0], saved["artifacts"][0])
        self.assertEqual(target["artifacts"][2], saved["artifacts"][2])
        self.assertNotEqual(target["artifacts"][1]["drive_file_id"],
                            saved["artifacts"][1]["drive_file_id"])
        self.assertTrue(target["artifacts"][1]["watermark_verified"])
        self.assertFalse(target["publish_approved"])
        self.assertFalse(target["factory_approved"])

    def test_original_drive_bytes_missing_blocks_before_reservation(self):\n        ops = Operations()\n        ops.original_verified = False\n        with self.assertRaisesRegex(GalleryRevisionDenied, "original_drive_bytes_unverified"):\n            run(ops=ops)\n        self.assertFalse(ops.reserved)\n        self.assertEqual(ops.generated, 0)\n\n    def test_ambiguous_retry_does_not_regenerate_or_duplicate_drive_upload(self):
        ops = Operations()
        run(ops=ops)
        with self.assertRaisesRegex(GalleryRevisionDenied, "already_claimed"):
            run(ops=ops)
        self.assertEqual(ops.generated, 1)
        self.assertEqual(ops.uploaded, 1)

    def test_failure_after_launch_leaves_reconciliation_only_no_second_generation(self):
        ops = Operations()
        ops.watermark_image = lambda *_: None
        with self.assertRaisesRegex(GalleryRevisionDenied, "watermark"):
            run(ops=ops)
        self.assertTrue(ops.reserved)
        with self.assertRaisesRegex(GalleryRevisionDenied, "already_claimed"):
            run(ops=ops)
        self.assertEqual(ops.generated, 1)

    def test_cannot_start_without_exact_profile_authorization_and_owned_hold(self):
        for profiles in ([], ["rec00000000000003"]):
            ops = Operations()
            with self.assertRaises(GalleryRevisionDenied):
                run(ops=ops, profiles=profiles)
            self.assertFalse(ops.reserved)
        ops = Operations()
        ops.hold = False
        with self.assertRaisesRegex(GalleryRevisionDenied, "hold"):
            run(ops=ops)
        self.assertFalse(ops.reserved)

    def test_forged_or_stale_job_plan_source_cannot_generate(self):
        modifications = [
            ("job", lambda x: x.update(profile_id="rec00000000000003")),
            ("job", lambda x: x.update(lease_verified=False)),
            ("job", lambda x: x.update(state="queued")),
            ("plan", lambda x: x.update(human_intent="auto")),
            ("plan", lambda x: x.update(auto_approve=True)),
            ("plan", lambda x: x.update(allow_public_publish=True)),
            ("plan", lambda x: x.update(mutate_sibling_outputs=True)),
            ("plan", lambda x: x.update(original_manifest_sha256="c"*64)),
            ("original", lambda x: x["artifacts"][0].update(rights_verified=False)),
            ("original", lambda x: x["artifacts"][1].update(profile_id="rec00000000000003")),
            ("original", lambda x: x["artifacts"][1].update(watermark_verified=False)),
            ("plan", lambda x: x["replacements"][0].update(slot_id="rec00000000000099")),
            ("plan", lambda x: x["replacements"].append(deepcopy(x["replacements"][0]))),
            ("plan", lambda x: x["replacements"][0].update(prompt="hi")),
        ]
        for key, change in modifications:
            fixtures = {"job": deepcopy(JOB), "plan": plan(), "original": original()}
            change(fixtures[key])
            ops = Operations()
            with self.subTest(key=key,change=str(change)):
                with self.assertRaises(GalleryRevisionDenied):
                    run(job=fixtures["job"], intent=fixtures["plan"],
                        source=fixtures["original"], ops=ops)
                self.assertEqual(ops.generated, 0)
                self.assertFalse(ops.reserved)

    def test_drive_verification_failure_never_commits_a_gallery(self):
        ops = Operations()
        ops.verify_drive_image = lambda *args: {"google_drive_verified": False}
        with self.assertRaisesRegex(GalleryRevisionDenied, "readback"):
            run(ops=ops)
        self.assertIsNone(ops.committed)
        self.assertEqual(ops.uploaded, 1)

    def test_generated_image_without_independent_rights_receipt_is_denied(self):
        ops=Operations()
        ops.verify_generated_rights=lambda *args: False
        with self.assertRaisesRegex(GalleryRevisionDenied,"rights_unverified"):
            run(ops=ops)
        self.assertIsNone(ops.committed)
        self.assertTrue(ops.reserved)
        self.assertEqual(ops.generated,1)


if __name__ == "__main__":
    unittest.main()
