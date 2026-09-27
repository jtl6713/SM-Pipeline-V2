from studio_produce.queue import upsert_variant_queue


def test_upsert_variant_queue_batches_airtable_writes():
    class FakeClient:
        def __init__(self):
            self.creates = []
            self.updates = []
            self.lists = 0

        def list_records(self, *_args, **_kwargs):
            self.lists += 1
            return [
                {
                    "id": "recOld",
                    "fields": {
                        "Transfer_ID": "ITEM4-VARIANT-fill-crop-v2-req-photo1-9x16",
                        "Transfer_Status": "Pending",
                        "Asset_Kind": "Platform Variant",
                    },
                }
            ]

        def create_records(self, table_id, records, *, typecast=True):
            self.creates.append((table_id, list(records), typecast))
            return [{"id": f"recNew{i}", "fields": row} for i, row in enumerate(records)]

        def update_records(self, table_id, records, *, typecast=True):
            self.updates.append((table_id, list(records), typecast))
            return records

        def update_record(self, *_args, **_kwargs):
            raise AssertionError("single-row update_record should not be used")

    class SettingsClient(FakeClient):
        def list_records(self, table_id, **kwargs):
            formula = str(kwargs.get("formula") or "")
            if "STUDIO_VARIANT_DRIVE_FOLDER_ID" in formula or "Setting_Name" in formula:
                return [{"id": "recSetting", "fields": {"Setting_Value": "folderDrive"}}]
            return FakeClient.list_records(self, table_id, **kwargs)

    client = SettingsClient()
    assets = [
        {
            "id": "photo1",
            "name": "a.jpg",
            "google_drive_file_id": "drive1",
            "media_asset_record_id": "recMedia1",
            "order": 1,
        },
        {
            "id": "photo2",
            "name": "b.jpg",
            "google_drive_file_id": "drive2",
            "media_asset_record_id": "recMedia2",
            "order": 2,
        },
    ]
    count = upsert_variant_queue(
        client,
        "req",
        assets,
        ["9:16", "4:5"],
        test_run_id="",
        plan=None,
    )
    assert count >= 3
    assert client.creates, "expected batched creates for new ratios"
    assert client.updates, "expected batched updates for existing pending rows"
    # One create call should carry multiple rows when possible.
    created_rows = client.creates[0][1]
    assert len(created_rows) >= 2
