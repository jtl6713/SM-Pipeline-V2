"""#2294 IG AP1C/AP4C pre-attempt native photo package regression."""
import json
from pathlib import Path

from apc.native_gallery_guard import (
    native_instagram_gallery_preflight_reason,
    native_instagram_v2_gallery,
)

REC = "rec1p9SOjrpxtpQkV"


def fixture(count=8):
    choices, slides = [], []
    for i in range(1, count + 1):
        url = f"https://media.chicagoshining.com/studio/previews/lettered/{REC}/{i-1}.jpg"
        drive = f"NYCImageVariant_GDrive_{i}_12345"
        family = f"rec{i:014d}"
        choices.append({"order": i, "url": url, "aspect_ratio": "4:5",
                        "googleDriveFileId": drive, "mediaAssetRecordId": family})
        slides.append({"id": f"rec{i+200:014d}", "fields": {
            "Platform Output": [REC], "PO_Output_ID": [10992],
            "Current Order": i, "Slide Number": i,
            "Deleted From Carousel": False, "Asset_4x5_Public_URL": url,
            "Asset_4x5_Public_Status": "Ready",
            "Google Drive File ID": drive, "Asset_Family_Key": family,
            "Shared_Asset_Approved": True, "Approved For Final": True,
            "Review Status": "Final Approved",
            "IG_Public_Asset_URL": url, "IG_Public_Asset_Status": "Ready",
        }})
    output = {"id": REC, "fields": {
        "Platform_Output_Type": "Instagram Carousel", "Output_ID": "10992",
        "Selected_Clip_Count": count,
        "Selected_Assets_JSON": json.dumps({"selected_clips": choices}),
        "Render_Clip_List_JSON": json.dumps(choices),
    }}
    return output, slides


def check(output, slides):
    return native_instagram_gallery_preflight_reason(output, slides)


def test_valid_owned_final_approved_staged_package():
    o, slides = fixture()
    assert native_instagram_v2_gallery(o)
    assert check(o, slides) is None


def test_zero_and_partial_slide_sets_fail_closed():
    o, slides = fixture()
    assert check(o, []) == "native_ig_gallery_canonical_slides_missing_or_partial"
    assert check(o, slides[:-1]) == "native_ig_gallery_canonical_slides_missing_or_partial"


def test_foreign_owner_or_duplicate_order_rejected():
    o, slides = fixture()
    slides[0]["fields"]["Platform Output"] = ["recFOREIGN000000A"]
    assert check(o, slides) == "native_ig_gallery_owner_order_invalid"
    o, slides = fixture()
    slides[1]["fields"]["Current Order"] = 1
    assert check(o, slides) == "native_ig_gallery_owner_order_invalid"


def test_actual_9x16_source_claim_does_not_become_4x5():
    o, slides = fixture()
    raw = json.loads(o["fields"]["Selected_Assets_JSON"])
    raw["selected_clips"][0]["aspect_ratio"] = "9:16"
    o["fields"]["Selected_Assets_JSON"] = json.dumps(raw)
    assert check(o, slides) == "native_ig_gallery_4x5_public_media_mismatch"


def test_manifest_url_drift_and_provenance_are_blocked():
    o, slides = fixture()
    slides[0]["fields"]["Asset_4x5_Public_URL"] += "?drift=true"
    assert check(o, slides) == "native_ig_gallery_4x5_public_media_mismatch"
    o, slides = fixture()
    slides[0]["fields"]["Google Drive File ID"] = "unrelated-file"
    assert check(o, slides) == "native_ig_gallery_original_source_mismatch"


def test_human_approval_and_actual_stage_ready_are_required():
    o, slides = fixture()
    slides[0]["fields"]["Approved For Final"] = False
    assert check(o, slides) == "native_ig_gallery_creative_approval_missing"
    o, slides = fixture()
    slides[0]["fields"]["IG_Public_Asset_Status"] = "Not Ready"
    assert check(o, slides) == "native_ig_gallery_instagram_public_asset_not_staged"


def test_v2_missing_manifest_never_falls_back_to_legacy():
    o, slides = fixture()
    o["fields"]["Selected_Assets_JSON"] = ""
    assert native_instagram_v2_gallery(o)
    assert check(o, slides) == "native_ig_gallery_manifest_incomplete"


def test_legacy_route_unaffected_without_v2_selected_package():
    o, slides = fixture()
    o["fields"].pop("Selected_Assets_JSON")
    o["fields"].pop("Selected_Clip_Count")
    assert not native_instagram_v2_gallery(o)
    assert check(o, []) is None


def test_instagram_child_and_publish_entrypoints_check_before_attempt_or_graph():
    for stem in ("ap1c", "ap4c"):
        path = Path(__file__).resolve().parents[1] / "apc" / f"{stem}.py"
        source = path.read_text()
        guard = source.index("preflight_reason = inspect_instagram_native_v2_package(client, output)")
        attempt = source.index('\"Publish_Attempt_Count\": (parse_int(field(output, "Publish_Attempt_Count")')
        assert guard < attempt
        assert '"native_gallery_preflight_only": True' in source[guard:attempt]
        assert "graph = InstagramCarouselClient" not in source[guard:attempt]
