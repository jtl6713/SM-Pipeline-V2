from studio_produce.shared_render import (
    build_shared_render_plan,
    is_shared_render_eligible,
    pick_canonical,
    propagate_fields_from_source,
    render_equivalence_key,
)


def _output(**fields):
    return {"id": fields.pop("id"), "fields": fields}


def test_shared_render_eligibility():
    reel = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", Aspect_Ratio="9:16")
    story = _output(id="recST", Platform="Instagram", Studio_Output_Type="Story", Aspect_Ratio="9:16")
    finished = _output(
        id="recFIN",
        Platform="Instagram",
        Studio_Output_Type="Reel",
        Aspect_Ratio="9:16",
        Output_Notes="origin=az-finished-video; ez-input=finished-video. Finished passthrough.",
        Render_Status="Rendered",
    )
    assert is_shared_render_eligible(reel) is True
    assert is_shared_render_eligible(story) is False
    assert is_shared_render_eligible(finished) is False


def test_pick_canonical_prefers_instagram():
    rows = [
        _output(id="recTT", Platform="TikTok", Studio_Output_Type="Video Draft", Aspect_Ratio="9:16", Output_ID="4"),
        _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", Aspect_Ratio="9:16", Output_ID="1"),
        _output(id="recYT", Platform="YouTube", Studio_Output_Type="Short", Aspect_Ratio="9:16", Output_ID="3"),
    ]
    assert pick_canonical(rows)["id"] == "recIG"


def test_build_shared_render_plan_groups_equivalent_outputs():
    clip = '[{"url":"https://media.chicagoshining.com/a.jpg","durationFrames":90,"overlay":{"enabled":true,"text":"Hi","position":"lower-third"}}]'
    common = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Render_Total_Frames": 900,
        "Render_Clip_List_JSON": clip,
        "Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Voiceover_URL": "https://media.chicagoshining.com/vo.mp3",
        "Music_Volume": 0.6,
        "Music_Ducked_Volume": 0.0504,
        "Voiceover_Render_Volume": 1,
        "Timing_Status": "Ready",
    }
    ig = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", Output_ID="1", **common)
    fb = _output(id="recFB", Platform="Facebook", Studio_Output_Type="Reel", Output_ID="2", **common)
    yt = _output(id="recYT", Platform="YouTube", Studio_Output_Type="Short", Output_ID="3", **common)
    tt = _output(id="recTT", Platform="TikTok", Studio_Output_Type="Video Draft", Output_ID="4", **common)
    plan = build_shared_render_plan([ig, fb, yt, tt])
    assert plan["recIG"]["role"] == "canonical"
    assert plan["recFB"]["role"] == "sibling"
    assert plan["recYT"]["role"] == "sibling"
    assert plan["recTT"]["role"] == "sibling"
    assert set(plan["recIG"]["sibling_ids"]) == {"recFB", "recYT", "recTT"}


def test_stale_duration_frames_still_share_one_render():
    short_clip = '[{"url":"https://media.chicagoshining.com/a.jpg","durationFrames":75,"overlay":{"text":"A"}}]'
    long_clip = '[{"url":"https://media.chicagoshining.com/a.jpg","durationFrames":122,"overlay":{"text":"A"}}]'
    common = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Voiceover_URL": "https://media.chicagoshining.com/vo.mp3",
        "Music_Volume": 0.6,
        "Timing_Status": "Ready",
        "Timing_Timeline_JSON": '{"duration_frames":1460,"duration_seconds":48.6667}',
    }
    ig = _output(
        id="recIG",
        Platform="Instagram",
        Studio_Output_Type="Reel",
        Output_ID="1",
        Render_Total_Frames=1460,
        Render_Clip_List_JSON=long_clip,
        **common,
    )
    yt = _output(
        id="recYT",
        Platform="YouTube",
        Studio_Output_Type="Short",
        Output_ID="3",
        Render_Total_Frames=900,
        Render_Clip_List_JSON=short_clip,
        **common,
    )
    assert render_equivalence_key(ig) == render_equivalence_key(yt)
    plan = build_shared_render_plan([ig, yt])
    assert plan["recIG"]["role"] == "canonical"
    assert plan["recYT"]["role"] == "sibling"


def test_pending_timing_sibling_still_shares_one_render():
    """Content 484: IG Ready+timeline while YouTube still Pending/900 must share."""
    clip = '[{"url":"https://media.chicagoshining.com/a.jpg","durationFrames":17,"overlay":{"text":"Hi"}}]'
    common = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Music_URL": "https://drive.google.com/uc?export=download&id=music",
        "Music_Volume": 0.6,
        "Creative_Render_Manifest_JSON": '{"v":1}',
    }
    ig = _output(
        id="recIG",
        Platform="Instagram",
        Studio_Output_Type="Reel",
        Output_ID="2443",
        Timing_Status="Ready",
        Timing_Timeline_JSON='{"duration_frames":810,"duration_seconds":27}',
        Render_Total_Frames=810,
        Render_Clip_List_JSON=clip,
        **common,
    )
    yt = _output(
        id="recYT",
        Platform="YouTube",
        Studio_Output_Type="Short",
        Output_ID="2448",
        Timing_Status="Pending",
        Render_Total_Frames=900,
        Render_Clip_List_JSON=clip,
        **common,
    )
    assert render_equivalence_key(ig) == render_equivalence_key(yt)
    plan = build_shared_render_plan([ig, yt])
    assert plan["recIG"]["role"] == "canonical"
    assert plan["recYT"]["role"] == "sibling"


def test_encoder_padding_frames_share_one_voiceover_render():
    common = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Voiceover_URL": "https://drive.google.com/uc?id=same-voice&export=download",
        "Music_Volume": 0.6,
        "Timing_Status": "Skipped",
    }
    long_clip = '[{"url":"https://media.chicagoshining.com/ferry.jpg","durationFrames":1654,"timingMode":"authoritative","timingSource":"timed_script"}]'
    short_clip = '[{"url":"https://media.chicagoshining.com/ferry.jpg","durationFrames":1651,"timingMode":"authoritative","timingSource":"timed_script"}]'
    ig = _output(
        id="recIG",
        Platform="Instagram",
        Studio_Output_Type="Reel",
        Output_ID="1601",
        Render_Total_Frames=1654,
        Render_Clip_List_JSON=long_clip,
        **common,
    )
    yt = _output(
        id="recYT",
        Platform="YouTube",
        Studio_Output_Type="Short",
        Output_ID="1606",
        Render_Total_Frames=1651,
        Render_Clip_List_JSON=short_clip,
        **common,
    )
    tt = _output(
        id="recTT",
        Platform="TikTok",
        Studio_Output_Type="Video Draft",
        Output_ID="1605",
        Render_Total_Frames=1651,
        Render_Clip_List_JSON=short_clip,
        **common,
    )
    story = _output(
        id="recST",
        Platform="Instagram",
        Studio_Output_Type="Story",
        Output_ID="1602",
        Render_Total_Frames=300,
        Render_Clip_List_JSON=short_clip,
        **common,
    )
    assert render_equivalence_key(ig) != render_equivalence_key(yt)
    plan = build_shared_render_plan([yt, tt, ig, story])
    assert plan["recIG"]["role"] == "canonical"
    assert set(plan["recIG"]["sibling_ids"]) == {"recYT", "recTT"}
    assert plan["recST"]["role"] == "solo"


def test_different_voiceover_file_does_not_share_a_render():
    clip = '[{"url":"https://media.chicagoshining.com/ferry.jpg","durationFrames":1654,"timingMode":"authoritative"}]'
    base = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Render_Total_Frames": 1654,
        "Render_Clip_List_JSON": clip,
        "Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Timing_Status": "Skipped",
    }
    ig = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", Voiceover_URL="https://example.com/a.mp3", **base)
    yt = _output(id="recYT", Platform="YouTube", Studio_Output_Type="Short", Voiceover_URL="https://example.com/b.mp3", **base)
    assert render_equivalence_key(ig) != render_equivalence_key(yt)


def test_different_music_volume_splits_groups():
    clip = '[{"url":"https://media.chicagoshining.com/a.jpg","durationFrames":90}]'
    base = {
        "Aspect_Ratio": "9:16",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Render_Total_Frames": 900,
        "Render_Clip_List_JSON": clip,
        "Music_URL": "https://media.chicagoshining.com/music.mp3",
        "Voiceover_URL": "https://media.chicagoshining.com/vo.mp3",
        "Timing_Status": "Ready",
    }
    ig = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", Music_Volume=0.6, **base)
    fb = _output(id="recFB", Platform="Facebook", Studio_Output_Type="Reel", Music_Volume=0.4, **base)
    assert render_equivalence_key(ig) != render_equivalence_key(fb)
    plan = build_shared_render_plan([ig, fb])
    assert plan["recIG"]["role"] == "solo"
    assert plan["recFB"]["role"] == "solo"


def test_propagate_fields_from_source():
    source = _output(
        id="recIG",
        Final_File_URL="https://drive.google.com/file/d/abc/view",
        Final_File_ID="abc",
        Output_URL="https://drive.google.com/file/d/abc/view",
        Studio_Preview_URL="https://media.chicagoshining.com/studio/previews/recIG/current.mp4",
        Studio_Preview_R2_Key="studio/previews/recIG/current.mp4",
        Render_Status="Rendered",
        Output_Status="Ready for Review",
    )
    fields = propagate_fields_from_source(source)
    assert fields["Final_File_ID"] == "abc"
    assert fields["Render_Status"] == "Rendered"
    assert fields["Remotion_Job_ID"] == ""


def test_youtube_first_frame_canary_does_not_inherit_instagram_render(monkeypatch):
    """The YouTube MP4 must be independent when exact canary rendering is on."""
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "canary")
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_CANARY_OUTPUT_IDS", "recYT")
    common = dict(
        Aspect_Ratio="9:16",
        Composition_ID="ChicagoShiningPhotoSequence",
        Render_Clip_List_JSON='[{"url":"https://example.com/still.jpg","durationFrames":90}]',
    )
    ig = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", **common)
    yt = _output(id="recYT", Platform="YouTube", Studio_Output_Type="Short", **common)
    fb = _output(id="recFB", Platform="Facebook", Studio_Output_Type="Reel", **common)
    assert is_shared_render_eligible(yt) is False
    plan = build_shared_render_plan([ig, fb, yt])
    assert plan["recYT"]["role"] == "solo"
    assert plan["recYT"]["canonical_id"] == "recYT"
    assert plan["recIG"]["canonical_id"] == "recIG"
    assert plan["recFB"]["role"] == "sibling"
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_CANARY_OUTPUT_IDS", "not-this-output")
    assert is_shared_render_eligible(yt) is True


def test_global_youtube_first_frame_isolation_and_platform_unaffected(monkeypatch):
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "all")
    common = dict(Aspect_Ratio="9:16", Composition_ID="ChicagoShiningPhotoSequence",
                  Render_Clip_List_JSON='[{"url":"https://example.com/still.jpg","durationFrames":90}]')
    yt = _output(id="recYT", Platform="YouTube", Studio_Output_Type="Short", **common)
    ig = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", **common)
    fb = _output(id="recFB", Platform="Facebook", Studio_Output_Type="Reel", **common)
    assert is_shared_render_eligible(yt) is False
    assert is_shared_render_eligible(ig) is True
    assert is_shared_render_eligible(fb) is True
    plan = build_shared_render_plan([ig, fb, yt])
    assert plan["recYT"]["role"] == "solo"
    assert plan["recFB"]["role"] == "sibling"
    assert plan["recIG"]["role"] == "canonical"
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "off")
    assert build_shared_render_plan([ig, fb, yt])["recYT"]["role"] == "sibling"


def test_multicut_vibe_remount_shares_only_exact_identical_video_edits():
    import json

    notes = "origin=ez-wizard; ez-input=finished-video. Vibe Cut — remounting music montage."
    clips = [
        {"id": "source-1", "url": "https://drive.google.com/file/d/source/view",
         "mediaKind": "video", "inSeconds": 7.171, "outSeconds": 8.1043, "durationFrames": 28},
        {"id": "source-2", "url": "https://drive.google.com/file/d/source/view",
         "mediaKind": "video", "inSeconds": 3.152, "outSeconds": 4.0853, "durationFrames": 28},
    ]
    common = dict(
        Aspect_Ratio="9:16",
        Composition_ID="ChicagoShiningPhotoSequence",
        Render_Clip_List_JSON=json.dumps(clips),
        Output_Notes=notes,
        Music_Volume=0,
        Timing_Status="Skipped",
    )
    ig = _output(id="recIG", Platform="Instagram", Studio_Output_Type="Reel", Output_ID="1", **common)
    fb = _output(id="recFB", Platform="Facebook", Studio_Output_Type="Reel", Output_ID="2", **common)
    tt = _output(id="recTT", Platform="TikTok", Studio_Output_Type="Video Draft", Output_ID="3", **common)
    yt = _output(id="recYT", Platform="YouTube", Studio_Output_Type="Short", Output_ID="4", **common)
    assert all(is_shared_render_eligible(row) for row in [ig, fb, tt, yt])
    plan = build_shared_render_plan([ig, fb, tt, yt])
    assert plan["recIG"]["role"] == "canonical"
    assert set(plan["recIG"]["sibling_ids"]) == {"recFB", "recTT", "recYT"}

    # Same file and overlays but different source cut ranges must not share
    # even though the old generic normalizer would collapse both timelines.
    changed = json.loads(json.dumps(clips))
    changed[0]["inSeconds"] = 1.234
    other = _output(
        id="recAlternate", Platform="Facebook", Studio_Output_Type="Reel",
        **{**common, "Render_Clip_List_JSON": json.dumps(changed)}
    )
    assert render_equivalence_key(other) != render_equivalence_key(ig)
    assert build_shared_render_plan([ig, other])["recIG"]["role"] == "solo"


def test_vibe_shared_render_never_exempts_finished_passthrough_or_single_clip():
    import json
    clips = [
        {"url": "https://example.com/v.mp4", "mediaKind": "video", "inSeconds": 0, "durationFrames": 28},
        {"url": "https://example.com/v.mp4", "mediaKind": "video", "inSeconds": 2, "durationFrames": 28},
    ]
    base = dict(Platform="Instagram", Studio_Output_Type="Reel", Aspect_Ratio="9:16",
                Render_Clip_List_JSON=json.dumps(clips))
    normal = _output(id="recFinished", Output_Notes="ez-input=finished-video", **base)
    fake = _output(id="recOneCut",
                   Output_Notes="ez-input=finished-video. Vibe Cut — remounting music montage.",
                   **{**base, "Render_Clip_List_JSON": json.dumps(clips[:1])})
    passthrough = _output(
        id="recPass",
        Output_Notes="ez-input=finished-video. Vibe Cut — remounting music montage. finished passthrough.",
        **base,
    )
    assert is_shared_render_eligible(normal) is False
    assert is_shared_render_eligible(fake) is False
    assert is_shared_render_eligible(passthrough) is False


def test_propagation_preserves_approved_siblings_and_still_repairs_pending():
    from unittest.mock import Mock
    from studio_produce.shared_render import propagate_render_result

    source = _output(id="recSource", Final_File_URL="https://media.chicagoshining.com/render.mp4")
    rows = {
        "recApproved": _output(id="recApproved", Output_Status="Approved for Publishing", Review_Status="Approved"),
        "recReviewDrift": _output(id="recReviewDrift", Output_Status="Ready for Review", Review_Status="Approved"),
        "recScheduled": _output(id="recScheduled", Studio_Scheduled_At="2026-12-01T01:00:00Z"),
        "recAttempt": _output(id="recAttempt", Publish_Attempt_Count=1),
        "recCompleted": _output(id="recCompleted", Render_Status="Rendered", Final_File_URL="https://media.chicagoshining.com/own.mp4"),
        "recPending": _output(id="recPending", Render_Status="Waiting in Render Queue"),
    }
    client = Mock()
    client.get_record.side_effect = lambda _table, ident: rows[ident]
    assert propagate_render_result(client, source, list(rows)) == ["recPending"]
    assert client.update_record.call_count == 1
    assert client.update_record.call_args.args[1] == "recPending"


def test_propagation_fails_closed_when_live_sibling_identity_is_wrong():
    import pytest
    from unittest.mock import Mock
    from studio_produce.shared_render import propagate_render_result

    source = _output(id="recSource", Final_File_URL="https://media.chicagoshining.com/render.mp4")
    client = Mock()
    client.get_record.return_value = _output(id="recOther")
    with pytest.raises(RuntimeError, match="sibling identity"):
        propagate_render_result(client, source, ["recExpected"])
    client.update_record.assert_not_called()


def test_exact_storage_scope_excludes_all_four_approved_siblings(monkeypatch):
    import json
    import pytest
    from studio_produce import steps, story_voiceover

    rid = "recLprSXgeNbgKABG"
    job, parent_id, targets, siblings = steps._EXACT_3159_STORAGE_SCOPES[rid]
    monkeypatch.setattr(steps, "_output_missing_review_cover", lambda _: False)
    parent = _output(id=parent_id, Voiceover_URL="https://example.test/parent.mp3")
    rows = [_output(id=i, Output_Status="Approved for Publishing", Review_Status="Approved",
                    Render_Status="Rendered", Final_File_URL="https://example.test/approved.mp4")
            for i in siblings]
    stories = [_output(id=i, Content_Item=[parent_id], Studio_Output_Type="Story",
        Studio_Effective_Voiceover_Mode="Yes", Output_Filename="studio-story.mp4",
        Output_Status="In Production", Render_Status="Blocked",
        Remotion_Error_Message=story_voiceover.STORY_STORAGE_GUARD, Do_Not_Publish=True,
        Auto_Publish_Enabled=False, Publish_Status="Not Ready") for i in targets]
    ctx = {"request_id":rid, "job":{"job_id":job}, "parent":parent, "outputs":rows+stories}
    assert steps._verified_story_recovery_scope(ctx) == frozenset(targets)
    stories[0]["fields"]["Render_Status"] = "Ready for Render"
    assert steps._verified_story_recovery_scope(ctx) == frozenset(targets)
    ident = stories[0]["id"]
    digest = story_voiceover.HELD_STORAGE_RECOVERY[ident][1]
    stories[0]["fields"][story_voiceover.RECEIPT] = json.dumps({
        "state":"verified", "fingerprint":digest, "sha256":"a"*64,
        "url":f"https://media.chicagoshining.com/studio/previews/story-voiceover/{parent_id}/{digest}.mp3"})
    stories[0]["fields"]["Render_Status"] = "Rendering"
    assert steps._verified_story_recovery_scope(ctx) == frozenset(targets)
    rows[0]["fields"]["Output_Status"] = "Ready for Review"
    with pytest.raises(steps.StepBlocked, match="approved sibling"):
        steps._verified_story_recovery_scope(ctx)
