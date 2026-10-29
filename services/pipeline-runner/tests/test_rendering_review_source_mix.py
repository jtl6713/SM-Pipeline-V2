"""Source music and captions are V1-owned, never model-created; offline tests."""
import unittest
from rendering_review.one_job import _source_mix, ExactReviewRenderDenied


class Drive:
    def get_file(self, file_id):
        return {"id":file_id,"mimeType":"audio/mpeg","size":"4767329"}


FILE="1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2"
MUSIC={"url":"https://drive.google.com/uc?export=download&id="+FILE,
       "volume":0.6,"duckingEnabled":True,"duckingMultiplier":0.35,
       "duckFadeFrames":6,"fadeInFrames":15,"fadeOutFrames":15,
       "startFromSeconds":0}


class SourceMixTests(unittest.TestCase):
    def test_actual_v1_music_and_caption_settings_bound_to_source(self):
        result=_source_mix(Drive(),{"music":dict(MUSIC),
                          "spokenCaptionsEnabled":False,
                          "spokenCaptionWordsPerPage":4},
                          "rec0uVrVeiUM6shp9")
        self.assertTrue(result["verified"])
        self.assertEqual(result["music"],MUSIC)
        self.assertEqual(result["music_drive_file_id"],FILE)
        self.assertFalse(result["spoken_captions_enabled"])
        self.assertEqual(result["spoken_caption_words_per_page"],4)

    def test_unverified_music_source_and_caption_choice_are_denied(self):
        for props in [
            {"music":dict(MUSIC),"spokenCaptionsEnabled":"false"},
            {"music":{**MUSIC,"url":"http://untrusted.test/audio.mp3"},
              "spokenCaptionsEnabled":False},
            {"music":{**MUSIC,"volume":2},"spokenCaptionsEnabled":False},
            {"music":{**MUSIC,"unsafe_model_override":True},
              "spokenCaptionsEnabled":False},
        ]:
            with self.subTest(props=props):
                with self.assertRaises(ExactReviewRenderDenied):
                    _source_mix(Drive(),props,"rec0uVrVeiUM6shp9")

    def test_missing_drive_music_fails_closed(self):
        class WrongDrive:
            def get_file(self,file_id): return {"id":"another","mimeType":"image/jpeg"}
        with self.assertRaisesRegex(ExactReviewRenderDenied,
                                   "original_music_drive_not_verified"):
            _source_mix(WrongDrive(),{"music":MUSIC,"spokenCaptionsEnabled":False},
                        "rec0uVrVeiUM6shp9")

if __name__=="__main__":
    unittest.main()
