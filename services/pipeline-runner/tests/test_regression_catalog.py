from __future__ import annotations

import json
from pathlib import Path

from idea.constants import CONTENT_TYPE_ALIASES, VALID_FORMATS
from studio_produce.job import derive_route
from studio_produce.steps import thumbnail_required
from ap0.public_cover import graph_fetchable_cover_url, native_grid_cover_required
from ap1_ig.caption import reel_create_body

CATALOG = json.loads(
    (Path(__file__).resolve().parents[3] / "tests" / "regression" / "catalog.json").read_text(encoding="utf-8")
)


def _outputs(spec: dict) -> list[dict]:
    rows = []
    for platform, output_type in (spec.get("overrides") or {}).items():
        rows.append({"fields": {"Platform": platform, "Studio_Output_Type": output_type}})
    for extra in spec.get("extras") or []:
        platform, output_type = extra.split("::", 1)
        rows.append({"fields": {"Platform": platform, "Studio_Output_Type": output_type}})
    return rows


def _notes(spec: dict) -> str:
    origin = spec.get("origin") or "ez-wizard"
    parts = [f"origin={origin}"]
    if spec.get("ez_input"):
        parts.append(f"ez-input={spec['ez_input']}")
    if spec.get("caption_mode"):
        parts.append(f"ez-caption={spec['caption_mode']}")
    return "; ".join(parts)


def test_catalog_rotation_matches_live_keys():
    assert sorted(CATALOG["rotation"]) == sorted(CATALOG["live"])


def test_i1_formats_alias_reel_and_exclude_raw_reel():
    assert "Reel" not in VALID_FORMATS
    assert CONTENT_TYPE_ALIASES["Reel"] == "Vertical Short Video"
    for name in VALID_FORMATS:
        assert name != "Reel"


def test_drive_urls_are_not_graph_covers():
    assert not graph_fetchable_cover_url("https://drive.google.com/uc?id=abc")
    assert graph_fetchable_cover_url("https://media.chicagoshining.com/publish/cover.jpg")


def test_reel_create_omits_thumb_offset_when_cover_url_present():
    record = {
        "fields": {
            "Thumbnail_URL": "https://media.chicagoshining.com/publish/cover.jpg",
            "Publish_Asset_URL": "https://media.chicagoshining.com/publish/reel.mp4",
            "Output_Caption": "Navy Pier at dusk",
        }
    }
    body = reel_create_body(record)
    assert body["cover_url"].endswith("cover.jpg")
    assert "thumb_offset" not in body


def test_native_single_image_is_not_a_grid_cover_surface():
    assert not native_grid_cover_required({"fields": {"Studio_Output_Type": "Single Image"}})
    assert native_grid_cover_required({"fields": {"Studio_Output_Type": "Reel"}})


def test_thumbnail_mode_no_still_required_for_rendered_video():
    request = {"fields": {"Thumbnail_Mode": "No"}}
    outputs = [{"fields": {"Studio_Output_Type": "Reel"}}]
    assert thumbnail_required(request, outputs) is True
    stills = [{"fields": {"Studio_Output_Type": "Single Image"}}]
    assert thumbnail_required(request, stills) is False


def test_catalog_expected_routes():
    for live_id, spec in CATALOG["live"].items():
        if spec.get("kind") != "studio-scenario" or not spec.get("expected_route"):
            continue
        assets = []
        if spec.get("ez_input") in {"single-ai", "multiple-ai"}:
            assets = [{"id": "a1", "source": "studio_ai"}]
        elif spec.get("ez_input") == "mixed":
            assets = [{"id": "a1", "source": "upload"}, {"id": "a2", "source": "studio_ai"}]
        elif spec.get("photos") or spec.get("photo_count"):
            assets = [{"id": "a1", "source": "upload"}]
        fields = {
            "Production_Notes": _notes(spec),
            "Carousel_Image_Mode": spec.get("carousel_image_mode") or "Manual Upload",
            "Studio_Master_Assets_JSON": json.dumps(assets),
        }
        route = derive_route(fields, _outputs(spec))
        assert route == spec["expected_route"], f"{live_id}: {route} != {spec['expected_route']}"
