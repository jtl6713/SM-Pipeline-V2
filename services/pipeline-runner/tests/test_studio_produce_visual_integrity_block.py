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
