import json
from urllib.parse import quote

from r4.render_request import choose_render_request
from studio_produce.shared_render import build_shared_render_plan, render_equivalence_key
from studio_produce.stamp import source_package, stamp_fields
from studio_produce.steps import apply_voiceover_script, ensure_slide_voiceover_timeline, exact_requested_script
from studio_produce.timed_script import (
    assign_stills_in_order,
    directive_line,
    estimate_narration_seconds,
    exact_voiceover_text,
    parse_timed_script_markdown,
    parse_time_range,
    segment_duration_frames,
    slight_speech_rate,
    timed_script_from_request,
    validate_timeline,
)
from t1.apply import apply_timeline

NYC_SUBWAY_SCRIPT = """
| Time      | Voiceover                                                                                                                                                                                        | Suggested still                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 0:00–0:07 | "First time on the NYC subway? Here's everything you need to know in 90 seconds."                                                                                                                | Wide shot of a busy subway platform with a train pulling in                 |
| 0:07–0:20 | "Paying is easy. Skip the MetroCard and just tap your phone, smartwatch, or contactless card on the OMNY reader at the turnstile. After 12 rides in 7 days, the rest of the week is free."       | Close-up of a phone tapping an OMNY reader                                  |
| 0:20–0:33 | "Before you go down the stairs, check the sign. Many entrances are only for one direction, Uptown or Downtown, and you can't always cross over inside. Pick the wrong one and you'll pay twice." | Station entrance sign reading "Uptown & The Bronx" or "Downtown & Brooklyn" |
| 0:33–0:46 | "Trains go by letter or number, and the color just tells you which avenue line they run on. Lines that share a color often split up later, so always check the letter, not just the color."      | Close-up of the colored line bullets on a station sign                      |
| 0:46–0:58 | "Know local versus express. Locals stop everywhere, express skips stops. On the map, a white dot means every train stops there, and a black dot means local only."                               | Subway map zoomed in on a section with white and black station dots         |
| 0:58–1:10 | "Use Google Maps, Citymapper, or the MTA app for live times, and always check for service changes, especially nights and weekends when lines get rerouted."                                      | Phone screen showing a transit app route                                    |
| 1:10–1:22 | "A few unwritten rules: let people off before you get on, take your backpack off, don't block the doors, and if a car is weirdly empty on a packed train, there's probably a reason."            | Interior of a subway car with doors open and riders stepping off            |
| 1:22–1:30 | "That's it. You're ready to ride like a local. Save this for your trip and follow for more NYC tips."                                                                                            | Train pulling away down the tunnel, or a skyline shot to close              |
"""

EXPECTED_DURATIONS = [7, 13, 13, 13, 12, 12, 12, 8]


def test_nyc_subway_table_parses_exact_durations_and_total():
    parsed = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)
    assert parsed["errors"] == []
    assert parsed["issues"] == []
    assert parsed["ok"] is True
    timeline = parsed["timeline"]
    assert len(timeline["segments"]) == 8
    assert [segment["duration_seconds"] for segment in timeline["segments"]] == EXPECTED_DURATIONS
    assert timeline["duration_seconds"] == 90
    assert timeline["timing_mode"] == "authoritative"
    assert timeline["timing_source"] == "timed_script"
    assert all(segment["force_exact_voiceover"] is True for segment in timeline["segments"])
    assert timeline["segments"][0]["voiceover_text"].startswith("First time on the NYC subway?")
    assert "Wide shot" not in timeline["segments"][0]["voiceover_text"]
    assert timeline["segments"][1]["suggested_visual"].startswith("Close-up of a phone")
    assert [segment_duration_frames(segment) for segment in timeline["segments"]] == [
        210, 390, 390, 390, 360, 360, 360, 240
    ]
    assert sum(segment_duration_frames(segment) for segment in timeline["segments"]) == 2700


def test_hyphen_and_en_dash_and_minute_timestamps():
    assert parse_time_range("0:00–0:07") == (0, 7)
    assert parse_time_range("0:07-0:20") == (7, 20)
    assert parse_time_range("1:10–1:22") == (70, 82)
    assert parse_time_range("1:10-1:22") == (70, 82)
    hyphen = NYC_SUBWAY_SCRIPT.replace("–", "-")
    parsed = parse_timed_script_markdown(hyphen)
    assert parsed["ok"] is True
    assert parsed["timeline"]["duration_seconds"] == 90
    assert parsed["timeline"]["segments"][5]["start_seconds"] == 58
    assert parsed["timeline"]["segments"][5]["end_seconds"] == 70
    assert parsed["timeline"]["segments"][6]["start_seconds"] == 70


def test_invalid_timestamps_gaps_overlaps_and_zero_length_are_reported():
    invalid = parse_timed_script_markdown("| Time | Voiceover | Suggested still |\n| --- | --- | --- |\n| tomorrow | Hello | A sign |")
    assert invalid["ok"] is False
    assert any("invalid timestamp" in error for error in invalid["errors"])

    gap = validate_timeline([
        {"start_seconds": 0, "end_seconds": 7, "duration_seconds": 7},
        {"start_seconds": 9, "end_seconds": 20, "duration_seconds": 11},
    ])
    assert any(issue.startswith("Gap of") for issue in gap)

    overlap = validate_timeline([
        {"start_seconds": 0, "end_seconds": 7, "duration_seconds": 7},
        {"start_seconds": 6, "end_seconds": 20, "duration_seconds": 14},
    ])
    assert any(issue.startswith("Overlap of") for issue in overlap)

    zero = validate_timeline([
        {"start_seconds": 4, "end_seconds": 4, "duration_seconds": 0},
    ])
    assert any("zero-length" in issue for issue in zero)

    backwards = validate_timeline([
        {"start_seconds": 20, "end_seconds": 7, "duration_seconds": -13},
    ])
    assert any("before start" in issue for issue in backwards)

    empty = parse_timed_script_markdown("not a table")
    assert empty["timeline"] is None
    assert empty["errors"]


def test_eight_scenes_map_to_eight_stills_and_suggested_visual_is_not_narration():
    parsed = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)
    assets = [{"id": f"still-{index}", "order": index} for index in range(1, 9)]
    timeline = assign_stills_in_order(parsed["timeline"], assets)
    assert [segment["asset_id"] for segment in timeline["segments"]] == [f"still-{index}" for index in range(1, 9)]
    narration = exact_voiceover_text(timeline)
    assert narration.startswith("First time on the NYC subway?")
    assert "Close-up of a phone tapping an OMNY reader" not in narration
    assert "Uptown & The Bronx" not in narration
    assert "skyline shot" not in narration
    for segment in timeline["segments"]:
        assert segment["suggested_visual"]
        assert segment["suggested_visual"] not in narration
    request = {"fields": {"Script_Mode": "AI decides", "Requested_Script": "", "Production_Notes": directive_line(timeline)}}
    assert exact_requested_script(request) == narration
    assert "phone tapping" not in exact_requested_script(request)


def test_timed_script_survives_trailing_photo_wait_tokens_on_same_line():
    """Live NYC bug: ez-photo-wait appended with '; ' onto the timed-script line."""
    timeline = assign_stills_in_order(
        parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)["timeline"],
        [{"id": f"still-{index}", "order": index} for index in range(1, 9)],
    )
    # Stale asset_ids that do not match master order (scene 1 pointed at still-3).
    stale = json.loads(json.dumps(timeline))
    stale["segments"][0]["asset_id"] = "still-3"
    notes = (
        "[render-settings] preset=auto; duration_mode=auto; pacing=normal; beat_sync=off\n"
        f"{directive_line(stale)}; ez-photo-wait=off; ez-photo-reject=recW7moQtdrPbNXg1,recbSIPdykCogPqZr"
    )
    request = _photo_request(notes, count=8)
    parsed = timed_script_from_request(request)
    assert parsed is not None
    assert parsed["duration_seconds"] == 90
    assert [segment_duration_frames(segment) for segment in parsed["segments"]] == [
        210, 390, 390, 390, 360, 360, 360, 240
    ]
    output = {
        "id": "recPO",
        "fields": {
            "Platform": "Instagram",
            "Studio_Output_Type": "Reel",
            "Aspect_Ratio": "9:16",
            "Platform_Output_Type": "Reel",
        },
    }
    package = source_package(request, output, None)
    assert package is not None
    clips = json.loads(package["render_clip_list_json"])
    # Positional fallback keeps master still order; durations follow VO windows.
    assert [clip["durationFrames"] for clip in clips] == [210, 390, 390, 390, 360, 360, 360, 240]
    assert clips[0]["durationFrames"] == 210
    assert package["total_frames"] == 2700
    assert all(clip["timingSource"] == "timed_script" for clip in clips)


def test_assign_stills_in_order_overwrites_stale_asset_ids():
    parsed = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)
    stale = parsed["timeline"]
    stale["segments"][0]["asset_id"] = "old-wrong-id"
    assets = [{"id": f"still-{index}", "order": index} for index in range(1, 9)]
    timeline = assign_stills_in_order(stale, assets)
    assert timeline["segments"][0]["asset_id"] == "still-1"
    assert [segment["asset_id"] for segment in timeline["segments"]] == [f"still-{index}" for index in range(1, 9)]


def test_assign_stills_matches_suggested_filenames_out_of_order():
    parsed = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:05 | Start at 72nd Street. | UpperWestSide_72nd_platform.jpg |\n"
        "| 0:05–0:12 | Tap OMNY and walk through. | OMNY_reader_closeup.jpg |\n"
    )
    assets = [
        {"id": "recOmny2", "order": 1, "name": "OMNY_reader_closeup.jpg"},
        {"id": "recWide1", "order": 2, "name": "UpperWestSide_72nd_platform.jpg"},
    ]
    timeline = assign_stills_in_order(parsed["timeline"], assets)
    assert timeline["segments"][0]["asset_id"] == "recWide1"
    assert timeline["segments"][1]["asset_id"] == "recOmny2"


def test_authoritative_timing_survives_stamp_and_ignores_pacing_and_beat_sync():
    timeline = assign_stills_in_order(
        parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)["timeline"],
        [{"id": f"still-{index}", "order": index} for index in range(1, 9)],
    )
    overrides = quote(json.dumps({"still-1": {"motion": "pan_left", "transition": "none", "fit": "contain"}}), safe="")
    notes = "\n".join([
        "origin=ez-wizard; ez-input=multiple-photos",
        "[render-settings] preset=energetic; motion=ken_burns; transition=push; duration_mode=fixed; duration_seconds=4; pacing=fast; beat_sync=on; fit=cover",
        f"[render-overrides] {overrides}",
        directive_line(timeline),
    ])
    request = _photo_request(notes, count=8)
    output = {"id": "recPO", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel", "Aspect_Ratio": "9:16", "Platform_Output_Type": "Reel"}}
    package = source_package(request, output, None)
    assert package is not None
    clips = json.loads(package["render_clip_list_json"])
    assert [clip["durationFrames"] for clip in clips] == [210, 390, 390, 390, 360, 360, 360, 240]
    assert package["total_frames"] == 2700
    assert all(clip["beatSync"] is False for clip in clips)
    assert all(clip["timingMode"] == "authoritative" for clip in clips)
    assert all(clip["timingSource"] == "timed_script" for clip in clips)
    assert clips[0]["motionStyle"] == "panLeft"
    assert clips[0]["renderDirective"]["frameOverride"]["motion"] == "pan_left"
    assert clips[0]["renderDirective"]["fit"] == "contain"
    assert clips[0]["fitMode"] == "full_with_solid_background"
    assert clips[1]["motionStyle"] != "none"
    voiceover = exact_voiceover_text(timed_script_from_request(request))
    for clip in clips:
        assert clip["voiceoverText"]
        assert clip["voiceoverText"] in voiceover
        assert clip.get("caption") != clip["voiceoverText"]
        assert clip["suggestedVisual"] not in (clip.get("caption") or "")
        assert clip["suggestedVisual"] != clip["voiceoverText"]
    fields = stamp_fields(package, None, existing={"fields": {"Timing_Status": "Ready", "Timing_Timeline_JSON": "{\"clips\":[{\"duration_frames\":30}]}"}})
    assert fields["Timing_Status"] == "Skipped"
    assert fields["Timing_Timeline_JSON"] is None
    assert fields["Render_Total_Frames"] == 2700
    assert json.loads(fields["Render_Clip_List_JSON"])[0]["durationFrames"] == 210


def test_normal_timing_path_still_uses_owner_duration():
    from studio_produce.stamp import assign_clip_frames

    clips = [{"source": {"media_kind": "photo"}} for _ in range(2)]
    frames, total = assign_clip_frames(
        clips,
        story=False,
        effective={"video_duration_seconds": 10},
        request={"fields": {"Video_Duration_Seconds": 10, "Production_Notes": "origin=ez-wizard"}},
        output=None,
    )
    assert total == 300
    assert frames == [150, 150]


def test_photo_voiceover_timeline_ignores_stored_thirty_seconds():
    from studio_produce.stamp import assign_clip_frames
    from studio_produce.timed_script import apply_measured_durations, timeline_from_slide_lines

    assets = [
        {"id": "recA", "order": 1, "media_kind": "photo", "caption": "River"},
        {"id": "recB", "order": 2, "media_kind": "photo", "caption": "Bean"},
        {"id": "recC", "order": 3, "media_kind": "photo", "caption": "Skyline"},
    ]
    planned = timeline_from_slide_lines([
        {"line": "Start at the river and keep walking downtown.", "silent": False},
        {"line": "The Bean is the second stop on this walk.", "silent": False},
        {"line": "", "silent": True, "hold_seconds": 2.5},
    ], assets)
    measured = apply_measured_durations(planned, [4.2, 6.4, 2.5])
    clips = [
        {"source": {"id": "recA", "media_kind": "photo"}},
        {"source": {"id": "recB", "media_kind": "photo"}},
        {"source": {"id": "recC", "media_kind": "photo"}},
    ]
    frames, total = assign_clip_frames(
        clips,
        story=False,
        effective={
            "video_duration_seconds": 30,
            "voiceover_mode": "Yes",
            "voiceover_duration_seconds": 10.6,
            "voiceover_tail_seconds": 15,
        },
        request={"fields": {"Video_Duration_Seconds": 30, "Production_Notes": directive_line(measured), "Voiceover_Mode": "Yes"}},
        output=None,
    )
    expected = [segment_duration_frames(segment) for segment in measured["segments"]]
    assert frames == expected
    assert total == sum(expected)
    assert total != 30 * 30
    assert measured["segments"][2]["silent"] is True
    assert measured["segments"][2]["duration_seconds"] == 2.5


def test_photo_voiceover_without_timeline_uses_measured_speech_not_owner_duration():
    from studio_produce.stamp import assign_clip_frames

    clips = [{"source": {"media_kind": "photo"}} for _ in range(2)]
    frames, total = assign_clip_frames(
        clips,
        story=False,
        effective={"video_duration_seconds": 30, "voiceover_mode": "Yes", "voiceover_duration_seconds": 12},
        request={"fields": {"Video_Duration_Seconds": 30, "Voiceover_Mode": "Yes"}},
        output=None,
    )
    assert total == 12 * 30
    assert frames == [180, 180]


def test_beat_sync_cannot_rewrite_authoritative_scene_lengths():
    clips = [
        {"url": "https://media.chicagoshining.com/a.jpg", "durationFrames": 210, "beatSync": True, "timingMode": "authoritative"},
        {"url": "https://media.chicagoshining.com/b.jpg", "durationFrames": 390, "beatSync": True, "timingSource": "timed_script"},
    ]
    rewritten = apply_timeline(clips, {"timeline": {"clips": [{"duration_frames": 30}, {"duration_frames": 45}]}})
    assert [clip["durationFrames"] for clip in rewritten] == [210, 390]


def test_shared_render_groups_identical_authoritative_timelines_only():
    def clip(frames):
        return json.dumps([{
            "url": "https://media.chicagoshining.com/a.jpg",
            "durationFrames": frames,
            "timingMode": "authoritative",
            "timingSource": "timed_script",
            "overlay": {"text": "Cover"},
        }])

    common = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Render_Total_Frames": 210,
        "Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Voiceover_URL": "https://media.chicagoshining.com/vo.mp3",
        "Timing_Status": "Skipped",
    }
    ig = {"id": "recIG", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel", "Output_ID": "1", "Render_Clip_List_JSON": clip(210), **common}}
    fb = {"id": "recFB", "fields": {"Platform": "Facebook", "Studio_Output_Type": "Reel", "Output_ID": "2", "Render_Clip_List_JSON": clip(210), **common}}
    yt = {"id": "recYT", "fields": {"Platform": "YouTube", "Studio_Output_Type": "Short", "Output_ID": "3", "Render_Clip_List_JSON": clip(390), **common}}
    assert render_equivalence_key(ig) == render_equivalence_key(fb)
    assert render_equivalence_key(ig) != render_equivalence_key(yt)
    plan = build_shared_render_plan([ig, fb, yt])
    assert plan["recIG"]["role"] == "canonical"
    assert plan["recFB"]["role"] == "sibling"
    assert plan["recYT"]["role"] == "solo"


def test_render_request_locks_authoritative_timeline():
    clips = json.dumps([
        {"url": "https://media.chicagoshining.com/a.jpg", "durationFrames": 210, "timingMode": "authoritative", "timingSource": "timed_script"},
        {"url": "https://media.chicagoshining.com/b.jpg", "durationFrames": 390, "timingMode": "authoritative"},
    ])
    output = {
        "fields": {
            "Output_Filename": "nyc.mp4",
            "Composition_ID": "ChicagoShiningPhotoSequence",
            "Aspect_Ratio": "9:16",
            "Render_Total_Frames": 600,
            "Render_Clip_List_JSON": clips,
            "Voiceover_URL": "https://media.chicagoshining.com/vo.mp3",
            "Voiceover_Tail_Seconds": 2,
            "Timing_Timeline_JSON": json.dumps({"duration_frames": 90, "clips": [{"duration_frames": 45}, {"duration_frames": 45}]}),
            "Music_URL": "",
        }
    }
    route, payload = choose_render_request(output, {"fields": {"Voiceover_Script": "Exact narration."}}, default_music=0.35, default_voice=1)
    assert route == "voiceover"
    assert payload["timingMode"] == "authoritative"
    assert payload["timingSource"] == "timed_script"
    assert payload["durationIsExplicit"] is True
    assert payload["voiceoverTailSeconds"] == 0
    assert payload["endHoldFrames"] == 0
    assert "timingPlan" not in payload
    assert [clip["durationFrames"] for clip in payload["clips"]] == [210, 390]


def test_slight_speech_rate_does_not_change_words():
    text = "Paying is easy. Skip the MetroCard and just tap your phone."
    segment = {"duration_seconds": 2, "voiceover_text": text, "speech_rate": 1}
    rate = slight_speech_rate(segment)
    assert rate > 1
    assert rate <= 1.15
    assert estimate_narration_seconds(text, rate) <= estimate_narration_seconds(text, 1)
    assert text == segment["voiceover_text"]


def test_import_timeline_parses_scene3_at_20_as_planning_hint():
    """Import clocks remain useful for ordering until P2 rewrites from speech."""
    from studio_produce.timed_script import notes_with_timed_script

    timeline = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)["timeline"]
    assert timeline["segments"][2]["start_seconds"] == 20
    assert timeline["segments"][2]["voiceover_text"].startswith("Before you go down the stairs")
    notes = notes_with_timed_script(
        "[render-settings] beat_sync=off\nez-photo-wait=off",
        timeline,
    )
    request = _photo_request(notes, count=8)
    package = source_package(request, {"id": "recPO", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel", "Aspect_Ratio": "9:16", "Platform_Output_Type": "Reel"}}, None)
    clips = json.loads(package["render_clip_list_json"])
    assert clips[2]["sceneStartSeconds"] == 20
    assert clips[2]["startFrame"] == 600
    assert clips[2]["durationFrames"] == 390
    assert clips[2]["voiceoverText"].startswith("Before you go down the stairs")


def test_apply_measured_durations_rewrites_import_20s_scene_to_spoken_13s():
    """VO-driven: import scene3 @20s / 13s window; TTS 13s → still 13s at new start."""
    from studio_produce.timed_script import apply_measured_durations, notes_with_timed_script

    timeline = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)["timeline"]
    assert timeline["segments"][2]["start_seconds"] == 20
    # Per-scene spoken lengths (not proportional restamp of the 90s import).
    spoken = [5.0, 9.0, 13.0, 11.0, 10.0, 8.0, 7.5, 4.5]
    rebuilt = apply_measured_durations(timeline, spoken)
    assert rebuilt is not None
    assert rebuilt["segments"][2]["duration_seconds"] == 13.0
    assert rebuilt["segments"][2]["start_seconds"] == 14.0  # 5+9, not import 20
    assert rebuilt["duration_seconds"] == sum(spoken)
    notes = notes_with_timed_script(
        "[render-settings] beat_sync=off\nez-photo-wait=off",
        rebuilt,
    )
    request = _photo_request(notes, count=8)
    package = source_package(request, {"id": "recPO", "fields": {"Platform": "Instagram", "Studio_Output_Type": "Reel", "Aspect_Ratio": "9:16", "Platform_Output_Type": "Reel"}}, None)
    clips = json.loads(package["render_clip_list_json"])
    assert clips[2]["sceneStartSeconds"] == 14.0
    assert clips[2]["startFrame"] == 420
    assert clips[2]["durationFrames"] == 390  # 13s * 30fps
    assert clips[2]["voiceoverText"].startswith("Before you go down the stairs")
    assert sum(int(clip["durationFrames"]) for clip in clips) == round(sum(spoken) * 30)


def test_apply_measured_durations_helper_rebuilds_when_explicitly_asked():
    from studio_produce.timed_script import apply_measured_durations

    timeline = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)["timeline"]
    rebuilt = apply_measured_durations(timeline, [2.0] * 8)
    assert rebuilt is not None
    assert rebuilt["duration_seconds"] == 16
    assert rebuilt["segments"][2]["start_seconds"] == 4


def test_notes_with_timed_script_preserves_trailer_tokens_on_new_lines():
    from studio_produce.timed_script import notes_with_timed_script

    timeline = parse_timed_script_markdown(NYC_SUBWAY_SCRIPT)["timeline"]
    notes = notes_with_timed_script(
        "[render-settings] beat_sync=off\n[timed-script] {\"mode\":\"timed_script\",\"segments\":[]}\nez-photo-wait=off",
        timeline,
    )
    assert "ez-photo-wait=off" in notes
    assert notes.count("[timed-script]") == 1
    assert '"duration_seconds":90' in notes or '"duration_seconds":90.0' in notes


def _photo_request(notes: str, count: int = 8):
    masters = []
    manifest = []
    for index in range(1, count + 1):
        asset_id = f"still-{index}"
        media_id = f"recSTILL{index:07d}"
        url = f"https://media.chicagoshining.com/nyc-{index}.jpg"
        masters.append({
            "id": asset_id,
            "order": index,
            "name": f"nyc-{index}.jpg",
            "caption": f"Photo caption {index}",
            "preview_url": url,
            "media_asset_record_id": media_id,
        })
        manifest.append({
            "id": asset_id,
            "order": index,
            "name": f"nyc-{index}.jpg",
            "caption": f"Photo caption {index}",
            "media_asset_record_id": media_id,
            "variants": {
                "9:16": {
                    "preview_url": url,
                    "media_asset_record_id": media_id,
                    "file_name": f"nyc-{index}.jpg",
                }
            },
        })
    return {
        "id": "recPRNYC",
        "fields": {
            "Production_Request_ID": "PR-NYC",
            "Production_Notes": notes,
            "Studio_Variant_Status": "Ready",
            "Video_Duration_Seconds": 30,
            "Studio_Master_Assets_JSON": json.dumps(masters),
            "Studio_Variant_Manifest_JSON": json.dumps({"assets": manifest}),
            "Studio_Output_Plan_JSON": json.dumps({
                "items": [{"platform": "Instagram", "output_type": "Reel", "aspect_ratio": "9:16"}]
            }),
        },
    }


def test_theme_generation_does_not_replace_a_locked_timed_script():
    class Client:
        def __init__(self):
            self.writes = []

        def update_record(self, *args, **kwargs):
            self.writes.append(args)

    client = Client()
    parent = {"id": "recParent", "fields": {"Voiceover_Script": "Exact subway narration.", "Voiceover_URL": ""}}
    apply_voiceover_script(
        client,
        parent,
        {"voiceover_script": "A short guide the operator never typed."},
        locked=True,
    )
    assert client.writes == []
    assert parent["fields"]["Voiceover_Script"] == "Exact subway narration."


def test_continuous_eight_word_voiceover_across_twelve_photos_stays_continuous():
    """Regression for Content 325: ordinary narration must not become one word per still."""
    class Client:
        def __init__(self):
            self.writes = []

        def update_record(self, table, record_id, fields, typecast=False):
            self.writes.append((table, record_id, fields, typecast))

    script = "These architectural eyebrows do more than look stylish."
    request = _photo_request("[render-settings] preset=auto; beat_sync=on", count=12)
    request["fields"]["Voiceover_Mode"] = "Yes"
    parent = {
        "id": "recParent325",
        "fields": {
            "Voiceover_Script": script,
            "Voiceover_Status": "Ready",
            "Voiceover_URL": "",
        },
    }
    client = Client()

    ensure_slide_voiceover_timeline(
        client,
        request,
        parent,
        {"voiceover_script": script},
        total=12,
    )

    assert "[timed-script]" not in request["fields"]["Production_Notes"]
    assert client.writes == []


def test_auto_slide_voiceover_timeline_is_removed_when_narration_is_not_explicit_per_slide():
    """Stale auto timing must not keep word/silence segmentation alive on retries."""
    from studio_produce.timed_script import timeline_from_slide_lines

    class Client:
        def __init__(self):
            self.writes = []

        def update_record(self, table, record_id, fields, typecast=False):
            self.writes.append((table, record_id, fields, typecast))

    script = "These architectural eyebrows do more than look stylish."
    assets = [{"id": f"still-{index}", "order": index} for index in range(1, 13)]
    auto_lines = [
        {"line": word, "silent": False}
        for word in script.rstrip(".").split()
    ] + [
        {"line": "", "silent": True, "hold_seconds": 2.5}
        for _ in range(4)
    ]
    auto_timeline = timeline_from_slide_lines(auto_lines, assets)
    assert auto_timeline["source"] == "slide_voiceover"

    request = _photo_request(directive_line(auto_timeline), count=12)
    request["fields"]["Voiceover_Mode"] = "Yes"
    parent = {
        "id": "recParent325",
        "fields": {
            "Voiceover_Script": script,
            "Voiceover_Status": "Ready",
            "Voiceover_URL": "",
        },
    }
    client = Client()

    ensure_slide_voiceover_timeline(
        client,
        request,
        parent,
        {"voiceover_script": script},
        total=12,
    )

    assert "[timed-script]" not in request["fields"]["Production_Notes"]
    assert request["fields"]["Voiceover_Tail_Seconds"] == 2.0
    assert len(client.writes) == 1
    assert "[timed-script]" not in client.writes[0][2]["Production_Notes"]
    assert client.writes[0][2]["Voiceover_Tail_Seconds"] == 2.0


def test_measured_auto_slide_timeline_preserves_source_marker():
    from studio_produce.timed_script import apply_measured_durations, timeline_from_slide_lines

    planned = timeline_from_slide_lines(
        [
            {"line": "First continuous phrase.", "silent": False},
            {"line": "Second continuous phrase.", "silent": False},
        ],
        [{"id": "still-1", "order": 1}, {"id": "still-2", "order": 2}],
    )
    assert planned["source"] == "slide_voiceover"
    measured = apply_measured_durations(planned, [2.1, 2.4])
    assert measured is not None
    assert measured["source"] == "slide_voiceover"
