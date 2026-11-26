"""#2294 non-mutating FB0 canonical native-photo-set preflight tests."""
import json
from pathlib import Path

from fb.assets import native_photo_preflight_reason

OUT = "recX9tOrTfQldqs32"
NUM = 10993
CDN = "https://media.chicagoshining.com/studio/previews/item4/reczvqjo1xs2jYXn0/"


def fixture(count=8):
    choices = []
    slides = []
    for i in range(1, count + 1):
        drive = f"DriveOriginalVariant_{i}_12345"
        family = f"rec{i:014d}"
        url = f"{CDN}fixed-original-{i}.jpg"
        choices.append({"order": i, "url": url, "googleDriveFileId": drive,
                        "mediaAssetRecordId": family})
        slides.append({"id": f"rec{i+200:014d}", "fields": {
            "Current Order": i, "Slide Number": i,
            "Platform Output": [OUT], "PO_Output_ID": [NUM],
            "Deleted From Carousel": False, "Google Drive File ID": drive,
            "Asset_Family_Key": family,
            "Asset_4x5_Public_URL": url, "Asset_4x5_Public_Status": "Ready",
            "Shared_Asset_Approved": True, "Approved For Final": True,
            "Review Status": "Final Approved", "FB_Photo_ID": "",
        }})
    record = {"id": OUT, "fields": {
        "Platform_Output_Type": "Facebook Photo Set", "Output_ID": str(NUM),
        "Selected_Clip_Count": count,
        "Selected_Assets_JSON": json.dumps({"selected_clips": choices}),
        "Render_Clip_List_JSON": json.dumps(choices),
    }}
    return record, slides


def test_valid_complete_native_photo_manifest():
    output, slides = fixture()
    assert native_photo_preflight_reason(output, slides) is None


def test_missing_and_partial_canonical_inventory_fail_before_any_attempt():
    out, slides = fixture()
    assert native_photo_preflight_reason(out, []) == "native_gallery_canonical_slide_count_mismatch"
    assert native_photo_preflight_reason(out, slides[:7]) == "native_gallery_canonical_slide_count_mismatch"


def test_foreign_slide_and_duplicate_order_rejected():
    out, slides = fixture()
    slides[0]["fields"]["Platform Output"] = ["recFOREIGN000000A"]
    assert native_photo_preflight_reason(out, slides) == "native_gallery_slide_identity_or_order_invalid"
    out, slides = fixture()
    slides[1]["fields"]["Current Order"] = 1
    assert native_photo_preflight_reason(out, slides) == "native_gallery_slide_identity_or_order_invalid"


def test_manifest_source_and_final_url_must_agree():
    out, slides = fixture()
    slides[0]["fields"]["Asset_4x5_Public_URL"] = "https://media.chicagoshining.com/bad.jpg"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_public_media_or_manifest_mismatch"
    out, slides = fixture()
    slides[0]["fields"]["Google Drive File ID"] = "different-original"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_original_source_provenance_invalid"
    out, slides = fixture()
    out["fields"]["Render_Clip_List_JSON"] = "[]"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_selected_render_manifest_missing_or_inconsistent"


def test_creative_approval_and_prior_provider_ids_are_never_inferred():
    out, slides = fixture()
    slides[0]["fields"]["Review Status"] = "Review Sent"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_final_creative_approval_missing"
    out, slides = fixture()
    slides[0]["fields"]["Approved For Final"] = False
    assert native_photo_preflight_reason(out, slides) == "native_gallery_final_creative_approval_missing"
    out, slides = fixture()
    slides[0]["fields"]["FB_Photo_ID"] = "historical-remote-asset"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_existing_provider_media_requires_reconciliation"


def test_preflight_does_not_affect_single_photo_or_other_routes():
    out, slides = fixture()
    out["fields"]["Platform_Output_Type"] = "Facebook Single Photo"
    assert native_photo_preflight_reason(out, []) is None


def test_fb0_reads_guard_before_any_attempt_or_lock_writes():
    src = (Path(__file__).resolve().parents[1] / "fb" / "fb0.py").read_text()
    check = src.index("preflight_reason = native_photo_preflight_reason(output, ready)")
    attempt = src.index('attempt = (parse_int(field(output, "Publish_Attempt_Count")')
    assert check < attempt
    assert 'if preflight_reason:' in src[check:attempt]
    assert '"native_gallery_preflight_only": True' in src[check:attempt]


def legacy_fixture():
    out, slides = fixture(4)
    record_id, number = "rec5bIppB59ZOoqAR", 10205
    out["id"] = record_id
    out["fields"].update({
        "Output_ID": str(number), "Review_Status": "Approved",
        "Output_Status": "Approved for Publishing", "Platform": "Facebook",
        "Studio_Output_Type": "Multi-Image Post",
        "FB_Image_Publish_Mode": "Multi-Photo Collage",
        "FB_Resolved_Publish_Mode": "Multi-Photo Collage",
        "Review_Decision_At": "2026-11-10T13:57:58.259Z",
        "Studio_Early_Hold_Recovery_Proof": "issue-2340-scheduled-hold-v1",
        "Studio_Early_Hold_Original_Dispatch_At": "2026-11-10T13:58:04.727Z",
        "Studio_Early_Hold_Original_Scheduled_At": "2026-11-23T16:30:00.000Z",
        "Scheduled_Post_Date": "2027-01-07T16:30:00Z",
        "Studio_Scheduled_At": "2027-01-07T16:30:00+00:00",
        "Studio_Overdue_MAE_Recovery_Receipt": {
            "state": "committed", "version": "issue-3096-mae-v1",
            "output_record_id": record_id, "platform": "Facebook",
            "output_type": "Facebook Photo Set",
            "planned_at": "2026-11-26T03:55:05.668Z",
            "original_dispatch_at": "2026-11-10T13:58:04.727Z",
            "original_scheduled_at": "2026-11-23T16:30:00Z",
            "scheduled_for": "2027-01-07T16:30:00Z",
        },
    })
    for slide in slides:
        slide["fields"]["Platform Output"] = [record_id]
        slide["fields"]["PO_Output_ID"] = [number]
        del slide["fields"]["Approved For Final"]
    return out, slides


def test_audited_legacy_missing_checkbox_with_committed_mae_and_exact_media():
    out, slides = legacy_fixture()
    assert native_photo_preflight_reason(out, slides) is None
    assert all("Approved For Final" not in slide["fields"] for slide in slides)


def test_audited_legacy_never_overrides_explicit_negative_or_bad_media():
    for key, value in [("Approved For Final", False), ("Approved For Final", None),
                       ("Shared_Asset_Approved", False), ("Review Status", "Review Sent")]:
        out, slides = legacy_fixture()
        slides[0]["fields"][key] = value
        assert native_photo_preflight_reason(out, slides) == "native_gallery_final_creative_approval_missing"
    out, slides = legacy_fixture()
    slides[0]["fields"]["Google Drive File ID"] = "different-original"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_original_source_provenance_invalid"
    out, slides = legacy_fixture()
    slides[0]["fields"]["FB_Photo_ID"] = "existing-remote"
    assert native_photo_preflight_reason(out, slides) == "native_gallery_existing_provider_media_requires_reconciliation"


def test_legacy_compatibility_requires_exact_cohort_and_matching_committed_receipt():
    for key, value in [
        ("Studio_Early_Hold_Recovery_Proof", ""),
        ("Review_Status", "Pending Review"),
        ("Review_Decision_At", "2026-11-10T14:00:00Z"),
        ("Scheduled_Post_Date", "2027-01-08T16:30:00Z"),
        ("FB_Resolved_Publish_Mode", "Slideshow Reel"),
    ]:
        out, slides = legacy_fixture()
        out["fields"][key] = value
        assert native_photo_preflight_reason(out, slides) == "native_gallery_final_creative_approval_missing"
    for key, value in [("state", "pending_commit"), ("output_record_id", OUT),
                       ("original_dispatch_at", "2026-11-09T13:58:04.727Z")]:
        out, slides = legacy_fixture()
        out["fields"]["Studio_Overdue_MAE_Recovery_Receipt"][key] = value
        assert native_photo_preflight_reason(out, slides) == "native_gallery_final_creative_approval_missing"
    out, slides = legacy_fixture()
    out["id"] = OUT
    out["fields"]["Studio_Overdue_MAE_Recovery_Receipt"]["output_record_id"] = OUT
    for slide in slides:
        slide["fields"]["Platform Output"] = [OUT]
    assert native_photo_preflight_reason(out, slides) == "native_gallery_final_creative_approval_missing"
