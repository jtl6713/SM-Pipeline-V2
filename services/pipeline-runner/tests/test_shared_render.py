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
    assert is_shared_render_eligible(reel) is True
    assert is_shared_render_eligible(story) is False


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
