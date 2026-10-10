from vibe_cut import (
    desired_clip_count,
    expand_master_to_vibe_sources,
    parse_vibe_cut_directive,
    provisional_selects_from_duration,
    vibe_cut_target_seconds,
)
from vibe_cut.edit import build_vibe_cut_edit


NOTES = (
    "origin=ez-wizard; ez-input=vibe-cut; ez-caption=ai; ez-package=video\n"
    '[vibe-cut] {"schema_version":"vibe-cut.1","mode":"vibe_cut","style":"beat-cut",'
    '"energy":3,"target_seconds":30,"chronology":"best-moments","beat_sync":"on"}'
)


def test_parse_directive_normalizes_target():
    cfg = parse_vibe_cut_directive(NOTES)
    assert cfg is not None
    assert cfg["target_seconds"] == 30
    assert cfg["style"] == "beat-cut"
    assert vibe_cut_target_seconds(NOTES) == 30


def test_provisional_selects_span_source():
    selects = provisional_selects_from_duration(48.69, count=12)
    assert len(selects) == 12
    assert selects[0]["start_seconds"] < selects[-1]["start_seconds"]
    assert selects[-1]["end_seconds"] <= 48.69 + 1e-6


def test_build_edit_fills_target_with_many_clips():
    selects = provisional_selects_from_duration(48.69, count=16)
    edit = build_vibe_cut_edit(selects=selects, config=parse_vibe_cut_directive(NOTES))
    assert edit["clip_count"] >= 4
    # Short provisional pools must still pad out to the owner target.
    assert 28 <= float(edit["duration_seconds"]) <= 31


def test_expand_master_is_not_head_trim():
    master = {
        "id": "a1ce",
        "media_kind": "video",
        "duration_seconds": 48.69,
        "media_asset_record_id": "recVIDEO00000001",
        "google_drive_file_id": "drive123",
        "name": "chicago.mov",
        "mime_type": "video/quicktime",
        "caption": "Walk with me in Downtown Chicago",
    }
    sources = expand_master_to_vibe_sources(master, config=parse_vibe_cut_directive(NOTES))
    assert len(sources) >= 4
    starts = [float(row["in_seconds"]) for row in sources]
    assert max(starts) > 8
    assert any(start > 20 for start in starts)
    total = sum(float(row["out_seconds"]) - float(row["in_seconds"]) for row in sources)
    assert 20 <= total <= 35
    assert sources[0]["media_asset_record_id"] == "recVIDEO00000001"
    assert float(sources[0]["duration_seconds"]) < 3
    assert float(sources[0]["source_duration_seconds"]) == 48.69
    assert desired_clip_count(parse_vibe_cut_directive(NOTES), source_duration=48.69) >= 8
