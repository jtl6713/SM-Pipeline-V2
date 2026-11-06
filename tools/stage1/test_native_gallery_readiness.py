import importlib.util
import json
import pathlib
import unittest

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("native_gallery_readiness",
    HERE/"native_gallery_readiness.py")
probe=importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
FOLDER="1VdULNl85JDoL_EaurRKMPm0tRi8xOawH"
VERSION="2026-11-03-r4-story-final-job-fence-v2"


def healthy():
    return dict(expected_version=VERSION,code_version=VERSION,
      reported_version=VERSION,health_ok=True,
      rights_policy_verified=True,candidate_folder_private=True,
      canonical_folder_verified=True,
      env={"STAGE1_CANDIDATE_FOLDER_ID":FOLDER,
           "NATIVE_GALLERY_STAGING_FOLDER_ID":"",
           "NATIVE_GALLERY_WORKER_BASE_URL":"https://studio.chicagoshining.com",
           "NATIVE_GALLERY_RUNNER_CONSUMER_ID":"stage1_held_probe_runner_12345",
           "NATIVE_GALLERY_JOB_SHARED_SECRET":"x"*28,
           "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED":"false",
           "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED":"false",
           "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED":"false",
           "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED":"false",
           "NATIVE_GALLERY_RIGHTS_REVIEWED":"true",
      })


class NativeGalleryReadinessTests(unittest.TestCase):
    def test_good_prerequisites_are_not_an_execution_or_legal_authorization(self):
        report=probe.assess(**healthy())
        self.assertTrue(report["ok"])
        self.assertEqual(report["mode"],"read_only_no_generation")
        self.assertTrue(report["canary_prerequisites_verified"])
        self.assertFalse(report["production_execution_flags"]["NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED"])
        self.assertTrue(report["auto_generation_disabled"])
        self.assertNotIn("x"*28,json.dumps(report))
        self.assertNotIn(FOLDER,json.dumps(report))
        self.assertEqual(report["blockers"],[])

    def test_rights_mismatch_always_blocks(self):
        inp=healthy();inp["rights_policy_verified"]=False
        report=probe.assess(**inp)
        self.assertFalse(report["canary_prerequisites_verified"])
        self.assertIn("EXACT_PROVIDER_MODEL_RIGHTS_NOT_CONFIGURED_OR_MATCHED",report["blockers"])

    def test_runner_code_version_and_live_health_both_required(self):
        for change in (dict(reported_version="old"),dict(code_version="old"),
                       dict(health_ok=False)):
            inp=healthy();inp.update(change)
            report=probe.assess(**inp)
            self.assertFalse(report["canary_prerequisites_verified"])

    def test_private_folder_requires_exact_id_and_exactly_owner_only(self):
        good={"id":FOLDER,"mimeType":"application/vnd.google-apps.folder",
              "trashed":False}
        self.assertTrue(probe.is_private_folder(good,[{"type":"user","role":"owner"}],FOLDER))
        for meta,perms in [
           (good,[]),(good,[{"type":"anyone","role":"reader"}]),
           (good,[{"type":"user","role":"owner"},{"type":"user","role":"reader"}]),
           ({"id":FOLDER,"mimeType":"application/vnd.google-apps.folder","shared":True},[{"type":"user","role":"owner"}]),
           (good,[{"type":"domain","role":"reader"}]),
           ({"id":"wrong","mimeType":"application/vnd.google-apps.folder"},[{"type":"user","role":"owner"}]),
           ({"id":FOLDER,"mimeType":"image/png"},[{"type":"user"}]),
           ({"id":FOLDER,"mimeType":"application/vnd.google-apps.folder","trashed":True},[{"type":"user"}])
        ]:
            self.assertFalse(probe.is_private_folder(meta,perms,FOLDER))

    def test_optional_env_pin_secret_and_worker_origin_are_checked(self):
        for key,bad in (
            ("NATIVE_GALLERY_STAGING_FOLDER_ID","wrong"),
            ("NATIVE_GALLERY_JOB_SHARED_SECRET","short"),
            ("NATIVE_GALLERY_WORKER_BASE_URL","http://localhost"),
            ("NATIVE_GALLERY_RUNNER_CONSUMER_ID","wrong"),
        ):
            inp=healthy();inp["env"][key]=bad
            report=probe.assess(**inp)
            self.assertFalse(report["canary_prerequisites_verified"],key)

    def test_canonical_airtable_folder_readback_is_required_without_local_pin(self):
        inp=healthy()
        report=probe.assess(**inp)
        self.assertTrue(report["candidate_folder_pinned_in_runner"])
        inp["canonical_folder_verified"]=False
        report=probe.assess(**inp)
        self.assertIn("AIRTABLE_STAGING_SETTING_NOT_VERIFIED",report["blockers"])
        self.assertFalse(report["candidate_folder_pinned_in_runner"])

    def test_generating_or_auto_dispatch_must_remain_off_during_audit(self):
        for key in ("NATIVE_GALLERY_AUTO_EXECUTE_ENABLED",
                    "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED",
                    "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED",
                    "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED"):
            inp=healthy();inp["env"][key]="true"
            report=probe.assess(**inp)
            self.assertFalse(report["canary_prerequisites_verified"],key)

    def test_no_mutations_or_generation_calls_in_inspection_module(self):
        text=(HERE/"native_gallery_readiness.py").read_text()
        for forbidden in ("execute_one_native_gallery(",
                          "claim_one_native_gallery_job(",
                          "generate_carousel_png(",
                          ".upload_file(", ".upsert_record(", ".update_record("):
            self.assertNotIn(forbidden,text)
        self.assertIn("urlopen(\"http://127.0.0.1:3350/health\"",text)


if __name__ == "__main__":
    unittest.main()
