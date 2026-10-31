import unittest
from rendering_review.vibe_cut_validation import (
  VibeMediaDenied,validate_vibe_mp4,
)
MP4=b"\x00\x00\x00\x20ftyp"+b"0"*100004
PROFILE="rec00000000000002"
def probe(data):
    return {"streams":[
      {"codec_type":"video","codec_name":"h264","width":1080,"height":1920},
      {"codec_type":"audio","codec_name":"aac"}],
      "format":{"duration":"15.0","format_name":"mov,mp4,m4a,3gp,3g2,mj2"}}
def brand(data,ratio):
    return {"verified":True,"authority":"server",
            "profile_watermark_matched":True,
            "profile_id":PROFILE,"frame_sample_count":5}
def run(**overrides):
    args={"aspect_ratio":"9:16","expected_duration":15.0,
          "expected_profile_id":PROFILE,
          "probe":probe,"watermark_qa":brand}
    args.update(overrides)
    return validate_vibe_mp4(MP4,**args)
class TestVibeMedia(unittest.TestCase):
    def test_music_only_mp4_requires_actual_music_track_and_logo_qa(self):
        result=run()
        self.assertEqual(result["mime_type"],"video/mp4")
        self.assertTrue(result["audio_verified"])
        self.assertTrue(result["music_only"])
        self.assertFalse(result["voiceover_expected"])
        self.assertTrue(result["watermark_verified"])
        self.assertFalse(result["ready_for_publication"])
        self.assertEqual(result["byte_count"],len(MP4))
    def test_horizontal_vibe_preserves_16_by_9_and_identical_validation(self):
        def wide(_):
            r=probe(None)
            r["streams"][0].update(width=1920,height=1080)
            return r
        result=run(aspect_ratio="16:9",probe=wide)
        self.assertEqual((result["width"],result["height"]),(1920,1080))
    def test_fail_closed_when_audio_video_aspect_or_duration_drift(self):
        functions=[
            lambda r:r["streams"].pop(),
            lambda r:r["streams"][0].update(width=480),
            lambda r:r["streams"][0].update(codec_name="unknown"),
            lambda r:r["streams"][1].update(codec_name="unknown"),
            lambda r:r["format"].update(duration="0"),
            lambda r:r["format"].update(duration="99"),
        ]
        for change in functions:
            def tampered(data,change=change):
                r=probe(data);change(r);return r
            with self.subTest(change=str(change)):
                with self.assertRaises(VibeMediaDenied):
                    run(probe=tampered)
    def test_never_trust_renderer_watermark_flag_or_missing_independent_qa(self):
        with self.assertRaises(VibeMediaDenied):
            run(watermark_qa=None)
        for alter in (
            lambda x:x.update(profile_watermark_matched=False),
            lambda x:x.update(frame_sample_count=1),
            lambda x:x.update(authority="renderer"),
        ):
            def bad(data,ratio,alter=alter):
                r=brand(data,ratio);alter(r);return r
            with self.assertRaises(VibeMediaDenied):
                run(watermark_qa=bad)
    def test_actual_watermark_must_match_exact_held_content_profile(self):
        with self.assertRaisesRegex(VibeMediaDenied,"expected_profile_identity"):
            run(expected_profile_id=None)
        with self.assertRaisesRegex(VibeMediaDenied,"branding_not_verified"):
            run(expected_profile_id="rec00000000000003")

    def test_invalid_original_bytes_are_rejected_before_probe(self):
        for payload in [b"",b"\x00"*100003,b"\x00\x00\x00\x20HTML"+b"0"*100000]:
            with self.assertRaises(VibeMediaDenied):
                validate_vibe_mp4(payload,aspect_ratio="9:16",
                  expected_duration=15.0,expected_profile_id=PROFILE,
                  probe=probe,watermark_qa=brand)
if __name__=="__main__":
    unittest.main()
