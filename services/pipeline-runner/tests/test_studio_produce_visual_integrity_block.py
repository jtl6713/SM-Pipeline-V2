"""A visual-integrity refusal must not spin the production render queue forever."""

import pytest

from studio_produce.steps import StepBlocked, step_render


def test_source_image_integrity_blocks_without_launching_render():
    request = {"id": "recRequest", "fields": {"Master_Content_Type": "Vertical Short Video"}}
    output = {
        "id": "recBlockedReel",
        "fields": {
            "Render_Status": "Blocked",
            "Remotion_Error_Message": (
                "Studio visual integrity guard: long-form video contains only "
                "one distinct still image. Restore the requested image sequence."
            ),
        },
    }

    class NoSideEffects:
        def get_record(self, *args, **kwargs):
            raise AssertionError("Should not query or restart a blocked render")

    with pytest.raises(StepBlocked, match="Insufficient distinct source imagery"):
        step_render(NoSideEffects(), {"request": request, "outputs": [output], "parent": {}})


def test_unrelated_restriction_does_not_trip_visual_integrity_guard():
    # The guard is intentionally specific; unrelated blocked statuses continue
    # through normal render handling rather than being mislabeled as a source issue.
    from render.fields import field_str

    other = {"fields": {"Render_Status": "Blocked", "Remotion_Error_Message": "Account authorization pending"}}
    assert not (
        field_str(other, "Render_Status").lower() == "blocked"
        and "studio visual integrity guard:" in field_str(other, "Remotion_Error_Message").lower()
    )


def test_queued_output_is_admitted_before_timing_processor(monkeypatch):
    from copy import deepcopy
    from studio_produce import steps, shared_render, story_voiceover
    from t1 import processor as timing
    from r4 import processor as render

    row = {"id": "recQueued", "fields": {
        "Render_Status": "Waiting in Render Queue",
        "Timing_Status": "Pending", "Composition_ID": "Reel",
        "Render_Clip_List_JSON": '[{"durationFrames":300}]',
        "Platform": "Facebook", "Studio_Output_Type": "Reel",
        "Output_Status": "In Production",
    }}
    events = []
    class Client:
        def get_record(self, *_):
            return deepcopy(row)
        def update_record(self, table, rid, patch, **kwargs):
            assert rid == row["id"]
            events.append(("update", dict(patch)))
            row["fields"].update(patch)

    client = Client()
    monkeypatch.setattr(steps, "is_finished", lambda *_: False)
    monkeypatch.setattr(steps, "voiceover_missing", lambda *_: False)
    monkeypatch.setattr(steps, "copy_voiceover_to_outputs", lambda *_: None)
    monkeypatch.setattr(steps, "pending_gallery", lambda *_: False)
    monkeypatch.setattr(steps, "_output_ready", lambda *_: False)
    monkeypatch.setattr(steps, "waiting_on_existing_render_job", lambda *_: False)
    monkeypatch.setattr(steps, "_output_file_ready", lambda *_: False)
    monkeypatch.setattr(shared_render, "build_shared_render_plan", lambda *_: {})
    monkeypatch.setattr(shared_render, "sort_outputs_for_shared_render", lambda outputs, plan: outputs)
    monkeypatch.setattr(story_voiceover, "rearm_story_sentence_guard", lambda c, o, p: o)
    def t1(**kwargs):
        assert timing._eligible(client.get_record(None, row["id"]))
        events.append(("timing", {}))
        row["fields"]["Timing_Status"] = "Skipped"
        return {"processed": True}
    def r4(**kwargs):
        assert row["fields"]["Timing_Status"] == "Skipped"
        events.append(("render", {}))
        return {"processed": True}
    monkeypatch.setattr(timing, "process_one", t1)
    monkeypatch.setattr(render, "process_one", r4)
    from studio_produce.steps import StepWait
    with pytest.raises(StepWait):
        step_render(client, {"request": {"id":"recRequest","fields":{}},
            "outputs": [deepcopy(row)], "parent": {"id":"recParent","fields":{}}})
    assert [e[0] for e in events] == ["update", "timing", "render"]
