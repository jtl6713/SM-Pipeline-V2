from item4.processor import group_pending_variant_rows, process_variant_group


def _variant_row(record_id: str, source_id: str, ratio: str) -> dict:
    return {
        "id": record_id,
        "fields": {
            "Asset_Kind": "Platform Variant",
            "Transfer_Status": "Pending",
            "Source_Drive_File_ID": source_id,
            "Target_Drive_Folder_ID": "folder",
            "Target_File_Name": f"{record_id}.jpg",
            "Aspect_Ratio": ratio,
            "Transfer_ID": f"tid-{record_id}",
            "Variant_Style": "center",
        },
    }


def test_group_pending_variant_rows_by_source():
    rows = [
        _variant_row("r1", "driveA", "9:16"),
        _variant_row("r2", "driveA", "4:5"),
        _variant_row("r3", "driveB", "9:16"),
        {
            "id": "preview",
            "fields": {
                "Asset_Kind": "Platform Variant",
                "Transfer_Status": "Ready",
                "Preview_Status": "Pending",
                "Source_Drive_File_ID": "driveA",
            },
        },
    ]
    groups, leftover = group_pending_variant_rows(rows)
    assert set(groups) == {"driveA", "driveB"}
    assert [row["id"] for row in groups["driveA"]] == ["r1", "r2"]
    assert leftover[0]["id"] == "preview"


def test_process_variant_group_downloads_once(monkeypatch):
    class FakeDrive:
        def __init__(self):
            self.downloads = 0
            self.uploads = 0

        def download_file(self, _file_id):
            self.downloads += 1
            return b"master-bytes", "image/jpeg"

        def upload_file(self, _folder, _name, _body, _mime):
            self.uploads += 1
            return {"id": f"up{self.uploads}", "webViewLink": "https://drive.google.com/file/d/up/view"}

    class FakeVariant:
        def render(self, source, ratio, _gravity):
            assert source == b"master-bytes"
            return f"crop-{ratio}".encode()

    class FakeAirtable:
        def update_record(self, *_args, **_kwargs):
            return {}

    monkeypatch.setattr("item4.processor.ensure_media_asset", lambda *_args, **_kwargs: "recMedia")
    drive = FakeDrive()
    rows = [
        _variant_row("r1", "driveA", "9:16"),
        _variant_row("r2", "driveA", "4:5"),
        _variant_row("r3", "driveA", "16:9"),
    ]
    results = process_variant_group(FakeAirtable(), drive, FakeVariant(), rows)
    assert drive.downloads == 1
    assert drive.uploads == 3
    assert [row["ratio"] for row in results] == ["9:16", "4:5", "16:9"]
