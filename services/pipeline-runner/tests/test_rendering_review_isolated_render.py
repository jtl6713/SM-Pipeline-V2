"""Isolated Renderer P020 contract fixtures. No Remotion/Airtable/Drive calls."""
from __future__ import annotations

import hashlib
import unittest
from copy import deepcopy

from rendering_review.isolated_render import (
    IsolatedRenderDenied, compile_isolated_render_payload,
)

CHICAGO = "recT2rbKX3MF7cVFU"
OUTPUT_ID = "recA1B2C3D4E5F6G7"
JOB_ID = "rrjob_12345678"
ATTEMPT_ID = "rrattempt_12345678"
PLAN_HASH = "a" * 64
NARRATION = "Chicago's neighborhoods tell a fascinating story."


def fixture():
    job = {
        "job_id": JOB_ID, "output_id": OUTPUT_ID,
        "session_id": "rrsession_12345678", "attempt_id": ATTEMPT_ID,
        "plan_hash": PLAN_HASH, "state": "claimed", "lease_verified": True,
        "lease_fence": 1,
    }
    plan = {
        "session_id": job["session_id"], "output_id": OUTPUT_ID,
        "profile_id": CHICAGO, "output_type": "Instagram Reel",
        "plan_hash": PLAN_HASH,
        "source_attempt_id": "rroriginal_12345678",
        "source_artifact_id": "drive-original-123",
        "source_drive_file_id": "drive-original-123",
        "media_authority": "google_drive",
        "allow_public_publish": False, "allow_platform_upload": False,
        "auto_approve": False, "mutate_original_production_request": False,
        "mutate_sibling_outputs": False,
        "branding_policy": "retain_current_approved",
        "blockers": [],
        "asset_manifest": [
            {"asset_id": "scene_asset_1234", "drive_file_id": "drive-photo-1"},
            {"asset_id": "scene_asset_5678", "drive_file_id": "drive-photo-2"},
        ],
        "creative": {
            "narration": NARRATION, "preserve": [],
            "acceptance_checks": ["Story has a clear opening"],
            "timeline": [
                {"start_seconds": 0, "end_seconds": 5, "asset_ids": ["scene_asset_1234"]},
                {"start_seconds": 5, "end_seconds": 12, "asset_ids": ["scene_asset_5678"]},
            ],
        },
    }
    source = {
        "verified": True, "authority": "server",
        "output_id": OUTPUT_ID, "attempt_id": plan["source_attempt_id"],
        "artifact_id": plan["source_artifact_id"],
        "drive_file_id": plan["source_drive_file_id"],
        "canonical_media_authority": "google_drive",
        "composition_id": "ChicagoShiningPhotoSequence",
    }
    assets = [
        {"asset_id": a, "drive_file_id": d, "verified": True,
         "rights_receipt_id": "rights-"+a,
         "authority": "server", "profile_id": CHICAGO,
         "canonical_media_authority": "google_drive",
         "render_url": "https://bridge.test/" + d,
         "media_kind": "image"}
        for a,d in [("scene_asset_1234","drive-photo-1"),
                    ("scene_asset_5678","drive-photo-2")]
    ]
    audio = {
        "verified": True, "authority": "server", "output_id": OUTPUT_ID,
        "attempt_id": ATTEMPT_ID, "plan_hash": PLAN_HASH,
        "canonical_media_authority": "google_drive",
        "drive_file_id": "drive-narration-2",
        "narration_sha256": hashlib.sha256(NARRATION.encode()).hexdigest(),
        "audio_url": "https://bridge.test/narration.mp3",
        "duration_seconds": 12.0,
    }
    watermark = {
        "verified": True, "authority": "server", "profile_id": CHICAGO,
        "policy": "retain_current_approved",
        "url": "https://bridge.test/approved-watermark.png",
    }
    return dict(job=job, plan=plan, source=source,
                resolved_assets=assets, voiceover=audio, watermark=watermark)


class IsolatedRenderTests(unittest.TestCase):
    def compile(self, overrides=None):
        parts=fixture()
        for key,value in (overrides or {}).items():
            parts[key]=value
        return compile_isolated_render_payload(**parts)

    def denied(self, callback, term):
        with self.assertRaisesRegex(IsolatedRenderDenied,term):
            callback()

    def test_exact_immutable_attempt_builds_isolated_standard_remotion_payload(self):
        result=self.compile()
        self.assertEqual(result["compositionId"],"ChicagoShiningPhotoSequence")
        self.assertEqual((result["width"],result["height"],result["fps"]),(1080,1920,30))
        self.assertEqual(result["durationInFrames"],360)
        self.assertEqual(result["expectedClipCount"],2)
        self.assertEqual(result["clips"][0]["durationFrames"],150)
        self.assertEqual(result["clips"][1]["startFrame"],150)
        self.assertEqual(result["voiceoverText"],NARRATION)
        self.assertFalse(result["watermarkRequired"])
        self.assertFalse(result["music"]["enabled"])
        self.assertEqual(result["studioRevision"]["attempt_id"],ATTEMPT_ID)
        self.assertEqual(result["studioRevision"]["job_id"],JOB_ID)
        self.assertIn(ATTEMPT_ID,result["filename"])
        self.assertNotIn("platform_upload",result)
        self.assertNotIn("publish",result)

    def test_owned_v1_music_and_spoken_caption_choice_remain_in_v2(self):
        original_music={
            "url":"https://drive.google.com/uc?export=download&id=1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2",
            "volume":0.6,"duckingEnabled":True,"duckingMultiplier":0.35,
            "duckFadeFrames":6,"fadeInFrames":15,"fadeOutFrames":15,
            "startFromSeconds":0,
        }
        source_mix={
            "verified":True,"authority":"server","output_id":OUTPUT_ID,
            "music":original_music,
            "music_drive_file_id":"1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2",
            "spoken_captions_enabled":False,
            "spoken_caption_words_per_page":4,
        }
        result=self.compile({"source_mix":source_mix})
        self.assertEqual(result["music"],original_music)
        self.assertFalse(result["spokenCaptionsEnabled"])
        self.assertEqual(result["spokenCaptionWordsPerPage"],4)
        self.assertFalse(result["watermarkRequired"])
        self.assertFalse(result["studioRevision"].get("publish",False))
        for change in [
            {"verified":False},
            {"authority":"model"},
            {"music_drive_file_id":"wrong-file"},
            {"spoken_captions_enabled":"false"},
        ]:
            bad=deepcopy(source_mix)
            bad.update(change)
            self.denied(lambda: self.compile({"source_mix":bad}),
                        "original_audio_or_caption_mix_unverified|original_music_mix_untrusted")

    def test_unleased_job_cannot_launch(self):
        for patch in [{"state":"queued"},{"lease_verified":False},
                      {"lease_fence":0},{"lease_fence":"3"},
                      {"plan_hash":"b"*64}]:
            parts=fixture()
            parts["job"].update(patch)
            self.denied(lambda:compile_isolated_render_payload(**parts),
                        "render_job_or_plan_not_authoritative")

    def test_cannot_use_sibling_or_altered_original_artifact(self):
        for patch in [{"source_artifact_id":"new-master"},
                      {"source_drive_file_id":"new-file"},
                      {"profile_id":"recO1T2H3E4R5P6R7"},
                      {"mutate_sibling_outputs":True},
                      {"allow_public_publish":True}]:
            parts=fixture()
            parts["plan"].update(patch)
            self.denied(lambda:compile_isolated_render_payload(**parts),
                        "original_artifact_changed|render_job_or_plan_not_authoritative")

    def test_unverified_narration_audio_or_mismatched_script_blocks(self):
        for patch in [{"verified":False},
                      {"narration_sha256":"b"*64},
                      {"plan_hash":"b"*64},
                      {"duration_seconds":20.0},
                      {"audio_url":"http://untrusted.test/file.mp3"}]:
            parts=fixture()
            parts["voiceover"].update(patch)
            self.denied(lambda:compile_isolated_render_payload(**parts),
                        "voiceover_audio_not_verified_for_plan|voiceover_timeline_mismatch")

    def test_missing_drive_asset_profile_rights_and_provenance_block(self):
        for patch in [{"rights_receipt_id":""},
                      {"profile_id":"recO1T2H3E4R5P6R7"},
                      {"drive_file_id":"changed-master"},
                      {"render_url":"http://insecure.test/asset.png"}]:
            parts=fixture()
            parts["resolved_assets"][0].update(patch)
            self.denied(lambda:compile_isolated_render_payload(**parts),
                        "asset_authority_or_rights_unverified|source_drive_asset_changed|asset_render_url_unverified")

    def test_multimedia_scene_cannot_silently_drop_extra_assets(self):
        parts=fixture()
        parts["plan"]["creative"]["timeline"][0]["asset_ids"]=[
            "scene_asset_1234","scene_asset_5678"]
        self.denied(lambda:compile_isolated_render_payload(**parts),
                    "scene_requires_exactly_one_verified_asset")

    def test_timeline_gap_or_overlap_or_time_invalid_blocks(self):
        for start in [4.0,6.0,float("nan")]:
            parts=fixture()
            parts["plan"]["creative"]["timeline"][1]["start_seconds"]=start
            self.denied(lambda:compile_isolated_render_payload(**parts),
                        "scene_timing_gap_or_overlap|scene_timing_invalid")

    def test_preserved_clip_requires_actual_original_segment_in_new_timeline(self):
        parts=fixture()
        parts["plan"]["creative"]["preserve"]=["Keep the opening clip"]
        self.denied(lambda:compile_isolated_render_payload(**parts),
                    "preservation_composition_not_verified")
        parts["plan"]["creative"]["timeline"][0]={
            "start_seconds":0,"end_seconds":5,"asset_ids":[],
            "preserve_source":True,"preserve_instruction":"Keep the opening clip",
        }
        self.denied(lambda:compile_isolated_render_payload(**parts),
                    "preservation_composition_not_verified")
        receipt={
            "verified":True,"authority":"server",
            "source_drive_file_id":"drive-original-123",
            "source_attempt_id":"rroriginal_12345678",
            "timeline_scene_index":0,
            "preserve_instruction":"Keep the opening clip",
            "render_url":"https://bridge.test/original.mp4",
            "source_start_seconds":0,"source_end_seconds":5,
        }
        parts["observed_source_segments"]=[receipt]
        result=self.compile(parts)
        self.assertEqual(result["expectedClipCount"],2)
        self.assertEqual(result["clips"][0]["google_drive_file_id"],"drive-original-123")
        self.assertEqual(result["clips"][0]["inSeconds"],0)
        self.assertEqual(result["clips"][0]["outSeconds"],5)
        self.assertEqual(result["clips"][0]["mediaKind"],"video")
        self.assertEqual(result["clips"][1]["google_drive_file_id"],"drive-photo-2")
        drift=deepcopy(parts)
        drift["observed_source_segments"][0]["source_end_seconds"]=4
        self.denied(lambda:compile_isolated_render_payload(**drift),
                    "preserved_clip_timing_drift")
        missing=deepcopy(parts)
        missing["plan"]["creative"]["timeline"][0]["preserve_source"]=False
        self.denied(lambda:compile_isolated_render_payload(**missing),
                    "scene_requires_exactly_one_verified_asset")

    def test_v2_plus_watermark_verification_missing_does_not_block_re_render(self):
        for value in [False, None]:
            parts=fixture()
            parts["watermark"]["verified"]=value
            parts["watermark"]["url"]=""
            rendered=compile_isolated_render_payload(**parts)
            self.assertFalse(rendered["watermarkRequired"])
            self.assertEqual(rendered["watermarkUrl"],"")
            self.assertEqual(rendered["expectedClipCount"],2)
        parts=fixture()
        parts["watermark"]={"url": "bad-url", "verified": False}
        rendered=compile_isolated_render_payload(**parts)
        self.assertEqual(rendered["watermarkUrl"],"")

    def test_original_r4_mutations_are_never_called(self):
        import inspect
        from rendering_review import isolated_render
        code=inspect.getsource(isolated_render.compile_isolated_render_payload)
        for forbidden in ("update_record(","post_render(","start_job(",
                          "delete_file(","graph.publish(","Platform_Post_ID"):
            self.assertNotIn(forbidden,code)


if __name__=="__main__":
    unittest.main()
