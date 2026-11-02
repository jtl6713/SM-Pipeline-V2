"""Authoritative original narration must be reused for visual-only edits.

Unit-level fake Drive proves zero TTS/zero writes for reuse and fail-closed
behavior for tampered original URLs, metadata or bytes.
"""
import unittest
from unittest.mock import patch

from rendering_review.one_job import _voiceover, ExactReviewRenderDenied

FILE="1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2"
URL="https://drive.google.com/uc?export=download&id="+FILE
SCRIPT="Chicago's waterfront comes alive at sunset"
CLAIM={"output_id":"recA1B2C3D4E5F6G7","attempt_id":"rrattempt_12345678",
       "plan_hash":"a"*64}


def plan(reuse=True):
    return {"creative":{"narration":SCRIPT,"target_duration_seconds":12.0,
                        "preserve_original_audio":reuse}}


class Drive:
    def __init__(self):
        self.data=b"fake mp3 fixture"*100
        self.metadata={"id":FILE,"mimeType":"audio/mpeg",
                       "size":str(len(self.data)),"trashed":False}
        self.uploads=[]
        self.shares=[]
    def get_file(self,which):
        return dict(self.metadata)
    def download_file(self,which):
        return self.data,"audio/mpeg"
    def upload_file(self,*args):
        self.uploads.append(args)
        return {"id":FILE}
    def share_anyone_reader(self,which):
        self.shares.append(which)


class OriginalVoiceoverTests(unittest.TestCase):
    def props(self):
        return {"voiceoverText":SCRIPT,"voiceover":{"url":URL}}

    def test_visual_only_reuses_identical_source_audio_without_tts_or_write(self):
        drive=Drive()
        with patch("rendering_review.one_job.synthesize_voiceover_by_id",
                   side_effect=AssertionError("TTS forbidden")), \\
             patch("rendering_review.one_job.probe_audio_duration_bytes",return_value=11.8):
            proof=_voiceover(None,drive,{},plan(),CLAIM,original_props=self.props())
        self.assertTrue(proof["source_audio_reused"])
        self.assertEqual(proof["audio_url"],URL)
        self.assertEqual(proof["drive_file_id"],FILE)
        self.assertEqual(proof["source_audio_sha256"],__import__("hashlib").sha256(drive.data).hexdigest())
        self.assertEqual(drive.uploads,[])
        self.assertEqual(drive.shares,[])

    def test_untrusted_source_text_and_links_fail_without_tts_fallback(self):
        for changed in [
            {"voiceoverText":"Changed narration"},
            {"voiceover":{"url":"https://example.org/voice.mp3"}},
            {"voiceover":{"url":URL+"&id=another-file"}},
            {"voiceover":{"url":URL+"&unsafe=1"}},
            {"voiceover":{"url":URL+"#fragment"}},
            {"voiceover":{"url":"http://drive.google.com/uc?export=download&id="+FILE}},
            {"voiceover":{"url":"https://drive.google.com/uc?id="+FILE+"&export=download"}},
        ]:
            props={**self.props(),**changed}
            drive=Drive()
            with self.subTest(props=props):
                with patch("rendering_review.one_job.synthesize_voiceover_by_id",
                           side_effect=AssertionError("unsafe TTS fallback")):
                    with self.assertRaises(ExactReviewRenderDenied):
                        _voiceover(None,drive,{},plan(),CLAIM,original_props=props)
                self.assertEqual(drive.uploads,[])

    def test_metadata_binary_and_length_fail_closed(self):
        variants=[
            ("trashed",lambda d:d.metadata.update(trashed=True)),
            ("mime",lambda d:d.metadata.update(mimeType="text/html")),
            ("wrong id",lambda d:d.metadata.update(id="anotherid12345678")),
            ("size",lambda d:d.metadata.update(size="100000")),
            ("download truncated",lambda d:setattr(d,"data",b"short")),
        ]
        for label,modify in variants:
            drive=Drive()
            modify(drive)
            with self.subTest(label=label):
                with patch("rendering_review.one_job.probe_audio_duration_bytes",return_value=11.8):
                    with self.assertRaises(ExactReviewRenderDenied):
                        _voiceover(None,drive,{},plan(),CLAIM,original_props=self.props())
                self.assertEqual(drive.uploads,[])

    def test_reused_audio_duration_cannot_exceed_storyboard(self):
        with patch("rendering_review.one_job.probe_audio_duration_bytes",return_value=20.0):
            with self.assertRaisesRegex(ExactReviewRenderDenied,"duration_mismatch"):
                _voiceover(None,Drive(),{},plan(),CLAIM,original_props=self.props())

    def test_changed_script_keeps_original_tts_path(self):
        drive=Drive()
        with patch("rendering_review.one_job.resolve_content_voice_id",return_value="voice-id"), \\
             patch("rendering_review.one_job.synthesize_voiceover_by_id",return_value=b"new audio") as synth, \\
             patch("rendering_review.one_job.normalize_voiceover",return_value=(None,b"new-mp3")), \\
             patch("rendering_review.one_job.probe_audio_duration_bytes",return_value=12.0):
            proof=_voiceover(None,drive,{},plan(reuse=False),CLAIM,original_props=self.props())
        synth.assert_called_once()
        self.assertNotIn("source_audio_reused",proof)
        self.assertEqual(len(drive.uploads),1)
        self.assertEqual(drive.shares,[FILE])


if __name__=="__main__":
    unittest.main()
