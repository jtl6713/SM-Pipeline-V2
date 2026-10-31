from copy import deepcopy
import unittest
from rendering_review.vibe_cut_revision import (
  compile_vibe_review_payload, VibeRevisionDenied,
)
OUTPUT="rec00000000000001"
PROFILE="rec00000000000002"
FILE="drive_owned_source_video_abcdefghi"
MUSIC="drive_owned_music_file_abcdefghi"
def fixture(ratio="9:16"):
  job={"output_id":OUTPUT,"profile_id":PROFILE,"attempt_id":"rrattempt_12345678",
       "job_id":"rrjob_12345678","session_id":"rrsession_12345678",
       "plan_hash":"a"*64,"state":"claimed","lease_verified":True,"lease_fence":1}
  source={"verified":True,"authority":"server","output_id":OUTPUT,
          "profile_id":PROFILE,"source_kind":"original_video",
          "canonical_media_authority":"google_drive","mime_type":"video/mp4",
          "rights_verified":True,"google_drive_verified":True,
          "published_or_dispatching":False,"review_hold_active":True,
          "drive_file_id":FILE,"sha256":"b"*64,"duration_seconds":90}
  plan={"schema":"studio.render-review.vibe.1","mode":"vibe_cut",
        "source_kind":"video","output_id":OUTPUT,"profile_id":PROFILE,
        "session_id":job["session_id"],"plan_hash":job["plan_hash"],
        "human_intent":"explicit_button","allow_public_publish":False,
        "allow_platform_upload":False,"auto_approve":False,
        "mutate_original_production_request":False,
        "mutate_sibling_outputs":False,"voiceover":"off","narration":"",
        "aspect_ratio":ratio,"source_drive_file_id":FILE,
        "source_sha256":"b"*64,"music_drive_file_id":MUSIC,
        "cuts":[{"start_seconds":10,"end_seconds":14},
                {"start_seconds":30,"end_seconds":36},
                {"start_seconds":0,"end_seconds":5}]}
  music={"verified":True,"authority":"server","license_verified":True,
         "google_drive_verified":True,"profile_id":PROFILE,"output_id":OUTPUT,
         "drive_file_id":MUSIC,
         "render_url":"https://drive.google.com/uc?export=download&id="+MUSIC,
         "volume":0.24}
  watermark={"verified":True,"authority":"server","profile_id":PROFILE,
             "policy":"retain_current_approved","drive_file_id":"drive_logo_abcdefghijklmnopqrstuvwxyz",
             "render_url":"https://drive.google.com/uc?export=download&id=drive_logo_abcdefghijklmnopqrstuvwxyz",
             "catalog_receipt":{"verified":True,"authority":"server",
               "media_authority":"google_drive","profile_id":PROFILE,
               "media_asset_record_id":"rec00000000000011",
               "drive_file_id":"drive_logo_abcdefghijklmnopqrstuvwxyz",
               "sha256":"c"*64}}
  return {"job":job,"source":source,"plan":plan,"music":music,
          "watermark":watermark,"authorized_profiles":[PROFILE]}
def run(data):
  return compile_vibe_review_payload(**data)
class TestVibeCutRevision(unittest.TestCase):
  def test_exact_source_three_cuts_no_voiceover_preserved_music_all_profiles(self):
    for ratio,size in [("9:16",(1080,1920)),("16:9",(1920,1080))]:
      for profile in (PROFILE,"rec00000000000003","rec00000000000004","rec00000000000005"):
        data=fixture(ratio)
        for item in (data["job"],data["plan"],data["source"],data["music"],data["watermark"]):
          item["profile_id"]=profile
        data["watermark"]["catalog_receipt"]["profile_id"]=profile
        data["authorized_profiles"]=[profile]
        source_copy=deepcopy(data["source"])
        payload=run(data)
        self.assertEqual((payload["width"],payload["height"]),size)
        self.assertEqual(payload["durationInFrames"],450)
        self.assertEqual(payload["voiceover"],{"enabled":False})
        self.assertFalse(payload["spokenCaptionsEnabled"])
        self.assertEqual(payload["music"]["volume"],0.24)
        self.assertTrue(payload["watermarkRequired"])
        self.assertEqual(len(payload["clips"]),3)
        self.assertEqual(data["source"],source_copy)
        self.assertTrue(all(x["mediaKind"]=="video" and x["muted"] and
                       not x["keepSourceAudio"] for x in payload["clips"]))
        self.assertFalse(payload["studioRevision"]["allow_public_publish"])

  def test_no_claim_without_profile_hold_or_explicit_button(self):
    for key,change in [
      ("job",lambda x:x.update(lease_verified=False)),
      ("job",lambda x:x.update(state="queued")),
      ("job",lambda x:x.update(profile_id="rec00000000000006")),
      ("source",lambda x:x.update(review_hold_active=False)),
      ("source",lambda x:x.update(published_or_dispatching=True)),
      ("source",lambda x:x.update(google_drive_verified=False)),
      ("plan",lambda x:x.update(human_intent="auto")),
      ("plan",lambda x:x.update(allow_public_publish=True)),
      ("plan",lambda x:x.update(allow_platform_upload=True)),
      ("plan",lambda x:x.update(auto_approve=True)),
      ("plan",lambda x:x.update(voiceover="on")),
      ("plan",lambda x:x.update(mutate_sibling_outputs=True)),
      ("plan",lambda x:x.update(source_sha256="e"*64)),
      ("music",lambda x:x.update(license_verified=False)),
      ("music",lambda x:x.update(volume=1.2)),
      ("watermark",lambda x:x.update(profile_id="rec00000000000007")),
    ]:
      data=fixture()
      change(data[key])
      with self.subTest(key=key):
        with self.assertRaises(VibeRevisionDenied):
          run(data)

  def test_source_must_be_same_owned_master_and_complete_timed_edits(self):
    mutations=[
      lambda x:x["plan"]["cuts"][0].update(end_seconds=100),
      lambda x:x["plan"]["cuts"][0].update(start_seconds=-1),
      lambda x:x["plan"]["cuts"][0].update(end_seconds=10.01),
      lambda x:x["plan"]["cuts"][0].update(end_seconds=50),
      lambda x:x["plan"]["cuts"].clear(),
      lambda x:x["plan"]["cuts"][0].update(extra="unexpected"),
      lambda x:x["plan"].update(cuts=[{"start_seconds":0,"end_seconds":1}]),
      lambda x:x["plan"].update(source_drive_file_id="unowned.mp4"),
      lambda x:x["music"].update(render_url="https://other-host/music.mp3"),
      lambda x:x["watermark"].update(verified=False),
    ]
    for mutate in mutations:
      data=fixture()
      mutate(data)
      with self.subTest(mutate=str(mutate)):
        with self.assertRaises(VibeRevisionDenied):
          run(data)

  def test_music_only_revision_never_invents_voiceover_captions_or_public_publish(self):
    data=fixture()
    payload=run(data)
    self.assertEqual(payload["voiceoverText"],"")
    self.assertEqual(payload["captionTrackMode"],"none")
    self.assertFalse(payload["spokenCaptionsEnabled"])
    self.assertFalse(payload["music"]["duckingEnabled"])
    self.assertEqual(payload["studioRevision"]["source"],"rendering_review_vibe_cut")
if __name__=="__main__":
  unittest.main()

  def test_logo_must_match_verified_owned_profile_receipt_and_exact_url(self):
    for mutation in (
      lambda w:w.update(render_url="https://example.test/watermark.png"),
      lambda w:w.update(drive_file_id="some_other_file_abcdefghijklmnopqrst"),
      lambda w:w["catalog_receipt"].update(profile_id="rec00000000000004"),
      lambda w:w["catalog_receipt"].update(media_asset_record_id="not-valid"),
      lambda w:w["catalog_receipt"].update(sha256="x"*64),
      lambda w:w["catalog_receipt"].update(verified=False),
      lambda w:w.pop("catalog_receipt"),
    ):
      data=fixture()
      mutation(data["watermark"])
      with self.subTest(mutation=str(mutation)):
        with self.assertRaisesRegex(VibeRevisionDenied,"catalog_watermark"):
          run(data)
