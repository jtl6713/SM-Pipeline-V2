"""Regression: approved Supabase outputs with Final_File_URL but no Final_File_ID.

The final Drive file is already rendered. AP0 must stage it to public R2
without starting a render, touching Airtable, or invoking any Meta publisher.
"""

from pathlib import Path

from ap0.eligibility import asset_plan, eligibility_reason
from ap0.public_mp4 import download_mp4_bytes, download_mp4_to_path, final_drive_file_id


DRIVE_ID = "1B8Wceybj2bkagU4QDQuz1rlAFjp210rJ"
DRIVE_URL = f"https://drive.google.com/file/d/{DRIVE_ID}/view"


def _record(**overrides):
    fields = {
        "Output_ID": 3562,
        "Platform": "Facebook",
        "Platform_Output_Type": "Facebook Reel",
        "Review_Status": "Approved",
        "Output_Status": "Approved for Publishing",
        "Publish_Method": "Automated",
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Status": "Ready to Publish",
        "Final_File_ID": "",
        "Final_File_URL": DRIVE_URL,
    }
    fields.update(overrides)
    return {"id": "recujO7oNV11qYrDp", "fields": fields}


def test_drive_final_url_without_final_id_is_eligible_and_keyed_deterministically():
    record = _record()
    assert final_drive_file_id(record) == DRIVE_ID
    assert eligibility_reason(record) is None
    assert asset_plan(record) == {
        "r2_object_key": f"publish/platform-output-3562/{DRIVE_ID}.mp4",
        "publish_asset_url": f"https://media.chicagoshining.com/publish/platform-output-3562/{DRIVE_ID}.mp4",
        "publish_asset_file_name": f"platform-output-3562-{DRIVE_ID}.mp4",
    }


def test_explicit_id_wins_over_url_and_missing_source_is_denied():
    assert final_drive_file_id(_record(Final_File_ID="differentExplicitId")) == "differentExplicitId"
    assert eligibility_reason(_record(Final_File_ID="", Final_File_URL="")) == "missing_final_file_id"


def test_untrusted_or_invalid_drive_urls_cannot_supply_file_identity():
    for bad in (
        f"http://drive.google.com/file/d/{DRIVE_ID}/view",
        f"https://drive.google.com.evil.example/file/d/{DRIVE_ID}/view",
        f"https://attacker.example/redirect?url=https://drive.google.com/file/d/{DRIVE_ID}/view",
        f"https://drive.google.com/other/path/{DRIVE_ID}",
        "https://drive.google.com/file/d/short/view",
        "/file/d/" + DRIVE_ID + "/view",
    ):
        record = _record(Final_File_URL=bad)
        assert final_drive_file_id(record) == ""
        assert eligibility_reason(record) == "missing_final_file_id"


def test_drive_download_path_uses_derived_final_id(monkeypatch, tmp_path):
    requested = []

    class FakeGoogleDrive:
        def download_file_to_path(self, file_id, output_path):
            requested.append(file_id)
            Path(output_path).write_bytes(b"verified-mp4")

    monkeypatch.setattr("integrations.google_drive.GoogleDriveClient", FakeGoogleDrive)
    output = tmp_path / "rendered.mp4"
    result = download_mp4_to_path(None, _record(), str(output))
    assert result == str(output)
    assert output.read_bytes() == b"verified-mp4"
    assert requested == [DRIVE_ID]


def test_drive_download_bytes_uses_derived_final_id(monkeypatch):
    requested = []

    class FakeGoogleDrive:
        def download_file(self, file_id):
            requested.append(file_id)
            return b"verified-mp4", "video/mp4"

    monkeypatch.setattr("integrations.google_drive.GoogleDriveClient", FakeGoogleDrive)
    assert download_mp4_bytes(None, _record()) == b"verified-mp4"
    assert requested == [DRIVE_ID]


def test_existing_final_file_approval_and_publication_guards_unchanged():
    assert eligibility_reason(_record(Review_Status="Pending")) == "review_not_approved"
    assert eligibility_reason(_record(Do_Not_Publish=True)) == "do_not_publish"
    assert eligibility_reason(_record(Published_At="2026-11-20T06:00:00Z")) == "already_published"
    assert eligibility_reason(_record(Publish_Status="Publishing")) == "publish_status_not_ready"
