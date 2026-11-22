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
