"""Prevent Chicago-only source media checks in shared review rendering.

Loads only the pure source-selection function from the runner via AST. The
fixture uses an owned MP4 so no external files, credentials, or HTTP calls
are needed; it tests the real production function rather than a copy.
"""
from __future__ import annotations

import ast
import json
import re
import unittest
from pathlib import Path

CHICAGO = "recT2rbKX3MF7cVFU"
LA = "recF7UAn0LkMZZrWZ"
MEDIA_ID = "rec00000000000004"
REQUEST_ID = "rec00000000000005"
FILE = "1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
ASSET = "asset-video-12345"
URL = "https://drive.google.com/uc?export=download&id=" + FILE


class FakeClient:
    def __init__(self, profile_id):
        self.profile_id = profile_id

    def get_record(self, table, record_id):
        assert table == "Media Assets"
        assert record_id == MEDIA_ID
        return {"id": MEDIA_ID, "fields": {
            "Google Drive File ID": FILE, "Rights_Status": "Owned",
            "Asset_Status": "Available", "Active": True,
            "Do_Not_Use": False, "Content_Profile": [self.profile_id],
            "Media_Class": "Video", "MIME_Type": "video/mp4",
        }}


class FakeDrive:
    def get_file(self, file_id):
        return {"id": file_id, "mimeType": "video/mp4", "size": "150000"}


def extract_renderer():
    module = Path(__file__).resolve().parents[1] / "rendering_review" / "one_job.py"
    parsed = ast.parse(module.read_text(encoding="utf-8"))
    func = next(item for item in parsed.body
                if isinstance(item, ast.FunctionDef) and item.name == "_render_sources")

    def deny(message):
        raise ValueError(message)

    names = {
        "json": json, "MEDIA": "Media Assets",
        "IDENTITY": re.compile(r"[A-Za-z0-9_-]{8,120}\\Z"),
        "RECORD": re.compile(r"rec[A-Za-z0-9]{14}\\Z"),
        "one_link": lambda value: value[0] if isinstance(value, list)
                    and len(value) == 1 else "",
        "fail": deny,
    }
    exec(compile(ast.Module(body=[func], type_ignores=[]),
                 str(module), "exec"), names)
    return names["_render_sources"]


def source_fixture():
    request = {"id": REQUEST_ID, "fields": {"Studio_Variant_Manifest_JSON":
        json.dumps({"complete": True, "production_request_record_id": REQUEST_ID,
                    "assets": [{
                        "id": ASSET, "media_asset_record_id": MEDIA_ID,
                        "google_drive_file_id": FILE, "media_kind": "video",
                        "variants": {"9:16": {
                            "google_drive_file_id": FILE, "preview_status": "Ready",
                            "media_kind": "video",
                            "recipe_version": "video-passthrough",
                            "width": 1080, "height": 1920,
                        }},
                    }]})}}
    originals = {ASSET: {"google_drive_file_id": FILE,
                         "media_asset_record_id": MEDIA_ID}}
    props = {"clips": [{"mediaAssetRecordId": MEDIA_ID,
                        "googleDriveFileId": FILE, "url": URL, "src": URL}]}
    plan = {"asset_manifest": [{
        "asset_id": ASSET, "drive_file_id": FILE,
        "render_variant_drive_file_id": FILE,
        "render_url": URL, "rights_receipt_id": "rights-verified-1",
    }]}
    return request, originals, props, plan


class CrossProfileSourceTests(unittest.TestCase):
    def test_authorized_la_media_accepted_without_chicago_profile_assumption(self):
        select = extract_renderer()
        request, originals, props, plan = source_fixture()
        assets = select(FakeClient(LA), request, originals, props, plan,
                        drive=FakeDrive(), profile_id=LA)
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0]["profile_id"], LA)
        self.assertEqual(assets[0]["drive_file_id"], FILE)

    def test_chicago_media_cannot_be_used_for_la_correction(self):
        select = extract_renderer()
        request, originals, props, plan = source_fixture()
        with self.assertRaisesRegex(ValueError, "review_source_rights_or_profile_lost"):
            select(FakeClient(CHICAGO), request, originals, props, plan,
                   drive=FakeDrive(), profile_id=LA)

    def test_missing_profile_must_fail_closed(self):
        select = extract_renderer()
        request, originals, props, plan = source_fixture()
        with self.assertRaisesRegex(ValueError, "review_source_rights_or_profile_lost"):
            select(FakeClient(LA), request, originals, props, plan,
                   drive=FakeDrive(), profile_id=None)


if __name__ == "__main__":
    unittest.main()
