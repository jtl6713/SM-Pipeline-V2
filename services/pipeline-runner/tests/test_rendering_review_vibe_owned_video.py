from __future__ import annotations
import hashlib
from unittest import TestCase
from unittest.mock import patch

from rendering_review.vibe_owned_video import validate_owned_vibe_mp4
from rendering_review.vibe_cut_validation import VibeMediaDenied
from test_rendering_review_vibe_cut_validation import MP4,probe,PROFILE

LOGO=b"\x89PNG\r\n\x1a\n"+b"logo"*64
FILE="drive_profile_logo_abcdefghijklmnopqrstuvwxyz"
def owned():
    return {"bytes":LOGO,"receipt":{
        "verified":True,"authority":"server",
        "media_authority":"google_drive","profile_id":PROFILE,
        "media_asset_record_id":"rec00000000000011",
        "drive_file_id":FILE,"sha256":hashlib.sha256(LOGO).hexdigest(),
    }}
class OwnedVibeTests(TestCase):
    def test_exact_drive_logo_used_for_music_video_visual_qa(self):
        def inspected(data,logo,profile_id,**kw):
            self.assertEqual(logo,LOGO)
            self.assertEqual(profile_id,PROFILE)
            self.assertEqual(kw["width"],1080)
            return {"verified":True,"authority":"server",
                    "profile_watermark_matched":True,"profile_id":PROFILE,
                    "frame_sample_count":3}
        with patch("rendering_review.vibe_owned_video.verify_video_profile_watermark",
                   inspected):
            result=validate_owned_vibe_mp4(MP4,profile_id=PROFILE,
                owned_logo=owned(),aspect_ratio="9:16",
                expected_duration=15.0,probe=probe)
        self.assertTrue(result["watermark_verified"])
        self.assertTrue(result["music_only"])
        self.assertEqual(result["watermark_profile_id"],PROFILE)
        self.assertFalse(result["ready_for_publication"])
    def test_logo_receipt_mismatch_is_rejected_before_visual_qa(self):
        for change in (
            lambda o:o["receipt"].update(profile_id="rec00000000000003"),
            lambda o:o["receipt"].update(sha256="b"*64),
            lambda o:o["receipt"].update(verified=False),
            lambda o:o["receipt"].update(media_asset_record_id="invalid"),
            lambda o:o.update(bytes=b"wrong-logo"),
        ):
            o=owned();change(o)
            with self.assertRaises(VibeMediaDenied):
                validate_owned_vibe_mp4(MP4,profile_id=PROFILE,
                    owned_logo=o,aspect_ratio="9:16",
                    expected_duration=15.0,probe=probe)
    def test_missing_frame_logo_qa_does_not_pass(self):
        with patch("rendering_review.vibe_owned_video.verify_video_profile_watermark",
                   return_value={"verified":False,"authority":"server",
                    "profile_id":PROFILE,"frame_sample_count":3}):
            with self.assertRaisesRegex(VibeMediaDenied,"branding"):
                validate_owned_vibe_mp4(MP4,profile_id=PROFILE,
                    owned_logo=owned(),aspect_ratio="9:16",
                    expected_duration=15.0,probe=probe)
