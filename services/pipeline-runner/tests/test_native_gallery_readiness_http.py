"""Hermetic auth, safety, rights and OAuth diagnostics for Stage 1."""
import json
import os
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.native_gallery_readiness_http import (
    create_native_gallery_readiness_blueprint, inspect_native_gallery_readiness,
)
from rendering_review.native_gallery_staging_settings import (
    NativeGalleryStagingDenied, read_native_gallery_staging_setting,
)

SECRET = "stage1-readiness-test-secret-123456"
FOLDER = "1VdULNl85JDoL_EaurRKMPm0tRi8xOawH"
SETTING = "NATIVE_GALLERY_STAGING_FOLDER_ID"
BASE = {
    "pipeline_runner_shared_secret": SECRET,
    "google_client_id": "configured-client-id",
    "google_client_secret": "configured-client-secret",
    "google_refresh_token": "configured-refresh-token",
}
FLAGS = {
    SETTING: "",
    "NATIVE_GALLERY_WORKER_BASE_URL": "https://studio.chicagoshining.com",
    "NATIVE_GALLERY_JOB_SHARED_SECRET": "configured-worker-job-secret-1234",
    "NATIVE_GALLERY_RUNNER_CONSUMER_ID": "one_shot_held_staging_probe",
    "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "false",
    "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "false",
    "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "false",
    "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED": "false",
}


class FakeAirtable:
    def __init__(self, records=None):
        self.records = records if records is not None else [{
            "fields": {
                "Setting_Name": SETTING, "Setting_Value": FOLDER,
                "Active": True,
            },
        }]

    def list_records(self, *args, **kwargs):
        return self.records


class FakeDrive:
    calls = 0

    def __init__(self, *, permission=None, shared=False, error=None):
        self.permission = permission if permission is not None else [
            {"type": "user", "role": "owner"}]
        self.shared = shared
        self.error = error
        self.calls = 0

    def get_file(self, folder, **kwargs):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return {
            "id": folder, "mimeType": "application/vnd.google-apps.folder",
            "trashed": False, "shared": self.shared,
        }

    def list_file_permissions(self, folder):
        self.calls += 1
        return self.permission


def approved(_settings):
    def clearance(**kwargs):
        return {"approved": True}
    clearance.preferred_account = "PRIMARY"
    return clearance


def inspect(*, client=None, drive=None, settings=None, rights=approved):
    return inspect_native_gallery_readiness(
        settings=BASE if settings is None else settings,
        client_factory=lambda: client or FakeAirtable(),
        drive_factory=lambda: drive or FakeDrive(),
        rights_policy_factory=rights,
    )


class ReadinessTests(unittest.TestCase):
    def test_exact_private_setting_and_owner_are_distinct_readbacks(self):
        with patch.dict(os.environ, FLAGS):
            report = inspect()
        self.assertTrue(report["canary_prerequisites_verified"])
        self.assertTrue(report["staging_airtable_setting_verified"])
        self.assertTrue(report["runner_can_access_private_staging"])
        self.assertFalse(report["can_generate"])
        self.assertFalse(report["can_publish"])
        self.assertNotIn(FOLDER, json.dumps(report))
        self.assertNotIn(SECRET, json.dumps(report))
        self.assertEqual(report["blockers"], [])

    def test_missing_oauth_is_actionable_without_attempting_drive(self):
        drive = FakeDrive()
        with patch.dict(os.environ, FLAGS):
            report = inspect(settings={**BASE, "google_refresh_token": ""}, drive=drive)
        self.assertTrue(report["staging_airtable_setting_verified"])
        self.assertFalse(report["runner_can_access_private_staging"])
        self.assertIn("RUNNER_GOOGLE_OAUTH_CREDENTIALS_MISSING", report["blockers"])
        self.assertEqual(drive.calls, 0)

    def test_missing_or_conflicting_airtable_setting_not_misreported_as_oauth(self):
        for rows, expected in [
            ([], "STAGING_AIRTABLE_NOT_UNIQUE"),
            ([{"fields": {"Setting_Name": SETTING, "Setting_Value": FOLDER,
                          "Active": False}}], "STAGING_AIRTABLE_INACTIVE"),
        ]:
            with patch.dict(os.environ, FLAGS):
                report = inspect(client=FakeAirtable(rows))
            self.assertIn(expected, report["blockers"])
            self.assertNotIn("RUNNER_GOOGLE_OAUTH_CREDENTIALS_MISSING",
                             report["blockers"])
        with patch.dict(os.environ, {**FLAGS, SETTING: "wrongfolder1234567890123456789"}):
            report = inspect()
        self.assertIn("STAGING_LOCAL_PIN_CONFLICT", report["blockers"])

    def test_drive_not_owner_only_denied_without_any_write(self):
        for drive in (
            FakeDrive(shared=True),
            FakeDrive(permission=[{"type": "anyone", "role": "reader"}]),
            FakeDrive(permission=[{"type": "user", "role": "owner"},
                                  {"type": "user", "role": "reader"}]),
        ):
            with patch.dict(os.environ, FLAGS):
                report = inspect(drive=drive)
            self.assertFalse(report["canary_prerequisites_verified"])
            self.assertIn("DRIVE_OWNER_ONLY_PERMISSIONS_UNVERIFIED",
                          report["blockers"])

    def test_google_oauth_and_folder_http_failures_are_classified_without_leakage(self):
        class HttpProblem(RuntimeError):
            def __init__(self, code, url):
                super().__init__("Private error payload must not be emitted")
                self.response = type("Reply", (), {
                    "status_code": code, "url": url,
                })()
        for code, url, expected in [
            (401, "https://oauth2.googleapis.com/token", "DRIVE_OAUTH_REFRESH_REJECTED"),
            (403, "https://www.googleapis.com/drive/v3/files/hidden",
             "DRIVE_RUNNER_ACCOUNT_ACCESS_DENIED"),
            (404, "https://www.googleapis.com/drive/v3/files/hidden",
             "DRIVE_FOLDER_NOT_VISIBLE_TO_RUNNER"),
        ]:
            with patch.dict(os.environ, FLAGS):
                report = inspect(drive=FakeDrive(error=HttpProblem(code, url)))
            self.assertIn(expected, report["blockers"])
            self.assertNotIn("hidden", json.dumps(report))
            self.assertNotIn("Private error payload", json.dumps(report))

    def test_rights_and_protected_worker_config_required_without_enabling_flags(self):
        with patch.dict(os.environ, {**FLAGS, "NATIVE_GALLERY_WORKER_BASE_URL": "http://insecure"}):
            report = inspect(rights=lambda _: (_ for _ in ()).throw(ValueError("unapproved")))
        self.assertIn("EXACT_PROVIDER_MODEL_RIGHTS_NOT_APPROVED", report["blockers"])
        self.assertIn("WORKER_ORIGIN_NOT_CONFIGURED", report["blockers"])
        self.assertTrue(report["auto_execution_disabled"])
        self.assertFalse(report["can_generate"])

    def test_readiness_endpoint_requires_server_secret_and_never_accepts_client_selection(self):
        calls = []
        app = Flask("native-gallery-readiness-test")
        app.register_blueprint(create_native_gallery_readiness_blueprint(
            BASE, inspector=lambda **_: (calls.append(True) or {
                "ok": True, "mode": "read_only_no_generation",
                "can_generate": False, "can_publish": False,
            }),
        ))
        c = app.test_client()
        endpoint = "/jobs/native-gallery/readiness"
        self.assertEqual(c.get(endpoint).status_code, 403)
        self.assertEqual(c.get(endpoint, headers={"X-Pipeline-Secret": "wrong"}).status_code, 403)
        self.assertEqual(c.get(endpoint+"?output_id=rec00000000000001",
                               headers={"X-Pipeline-Secret": SECRET}).status_code, 400)
        self.assertEqual(calls, [])
        response = c.get(endpoint, headers={"X-Pipeline-Secret": SECRET})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(calls, [True])
        self.assertFalse(response.json["can_generate"])
        self.assertFalse(response.json["can_publish"])

    def test_no_credentials_or_output_id_exposed_on_failed_inspection(self):
        app = Flask("stage1-readiness-unavailable")
        app.register_blueprint(create_native_gallery_readiness_blueprint(
            BASE, inspector=lambda **_: (_ for _ in ()).throw(RuntimeError(SECRET))))
        response = app.test_client().get("/jobs/native-gallery/readiness",
                                         headers={"X-Pipeline-Secret": SECRET})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json["blockers"],
                         ["RUNNER_READINESS_INSPECTION_UNAVAILABLE"])
        self.assertNotIn(SECRET, response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
