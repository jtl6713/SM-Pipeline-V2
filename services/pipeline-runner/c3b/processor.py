"""C3B processor — review-button handler (Make 5592384)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from c3b.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from c3b.html import confirmation, health_page, notes_form, unsupported
from carousel.chain import trigger_next
from carousel.formulas import matches_test_run
from carousel.mapping import c3b_action_fields, c3b_triggers_c4
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc, stamp_minutes
from render.fields import field_str


_FORM_ACTIONS = {"ai_form", "manual_form", "global_ai_form", "global_manual_form"}
_GLOBAL_WRITES = {"global_ai_submit": "ai_submit", "global_manual_submit": "manual_submit"}


def _html_result(html: str, *, processed: bool, reason: str | None = None, **extra: Any) -> dict[str, Any]:
    payload = {
        "processed": processed,
        "html": html,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        **extra,
    }
    if reason:
        payload["reason"] = reason
    return payload


def _trigger_c4(slide: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "slide_record_id": slide["id"],
        "source": "Carousel daisy chain",
        "target": "C4",
        "requested_at": iso_utc(),
        "test_run_id": field_str(slide, "Test_Run_ID"),
    }

    def _python_c4() -> dict[str, Any]:
        from c4.processor import process_request as process_c4

        return process_c4(
            slide_record_id=slide["id"],
            test_run_id=field_str(slide, "Test_Run_ID") or None,
        )

    return trigger_next("c4", payload, python_call=_python_c4)


def _apply_slide(
    client: AirtableClient,
    slide: dict[str, Any],
    *,
    action: str,
    notes: str,
    test_run_id: str | None,
    dry_run: bool,
) -> dict[str, Any] | None:
    if not matches_test_run(field_str(slide, "Test_Run_ID"), test_run_id or ""):
        return None
    fields = c3b_action_fields(action, notes=notes, timestamp=stamp_minutes())
    if not fields:
        return None
    if dry_run:
        return {"id": slide["id"], "fields": fields, "dry_run": True}
    updated = client.update_record(CAROUSEL_SLIDES_TABLE, slide["id"], fields)
    return updated


def process_request(
    *,
    action: str | None,
    slide_id: str | None = None,
    content_item_id: str | None = None,
    notes: str = "",
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    key = str(action or "").strip().lower()
    if key == "health" or not key:
        if key == "health":
            return _html_result(health_page(), processed=True, action="health")
        return _html_result(unsupported(key), processed=False, reason="missing_action", action=key)

    if key in _FORM_ACTIONS:
        if key in {"ai_form", "manual_form"} and not slide_id:
            return _html_result(unsupported(key), processed=False, reason="missing_slide_id", action=key)
        if key.startswith("global_") and not content_item_id:
            return _html_result(unsupported(key), processed=False, reason="missing_content_item_id", action=key)
        submit = "ai_submit" if "ai" in key else "manual_submit"
        if key.startswith("global_"):
            submit = "global_ai_submit" if "ai" in key else "global_manual_submit"
        heading = "Regenerate with AI + notes" if "ai" in key else "Manual replacement + notes"
        return _html_result(
            notes_form(
                action=submit,
                slide_id=slide_id or "",
                content_item_id=content_item_id or "",
                heading=heading,
                detail="Add reviewer notes, then submit. C3B will write the slide decision.",
            ),
            processed=False,
            reason="form",
            action=key,
        )

    write_action = _GLOBAL_WRITES.get(key, key)
    fields = c3b_action_fields(write_action, notes=notes, timestamp=stamp_minutes())
    if not fields:
        return _html_result(unsupported(key), processed=False, reason="unsupported_action", action=key)

    client = AirtableClient()
    updated: list[str] = []
    chains: list[dict[str, Any]] = []

    if key in _GLOBAL_WRITES:
        if not content_item_id:
            return _html_result(unsupported(key), processed=False, reason="missing_content_item_id", action=key)
        parent = load_parent(client, content_item_id, test_run_id=test_run_id)
        if not parent:
            return _html_result(
                confirmation("C3B skipped", "Content Item test identity did not match."),
                processed=False,
                reason="parent_test_mismatch",
                action=key,
            )
        for slide in load_linked_slides(client, parent):
            row = _apply_slide(
                client, slide, action=write_action, notes=notes, test_run_id=test_run_id, dry_run=dry_run
            )
            if not row:
                continue
            updated.append(slide["id"])
            if not dry_run and c3b_triggers_c4(key):
                chains.append(_trigger_c4(slide))
    else:
        if not slide_id:
            return _html_result(unsupported(key), processed=False, reason="missing_slide_id", action=key)
        slide = client.get_record(CAROUSEL_SLIDES_TABLE, slide_id)
        if not matches_test_run(field_str(slide, "Test_Run_ID"), test_run_id or ""):
            return _html_result(
                confirmation("C3B skipped", "Slide test identity did not match."),
                processed=False,
                reason="slide_test_mismatch",
                action=key,
            )
        row = _apply_slide(client, slide, action=write_action, notes=notes, test_run_id=test_run_id, dry_run=dry_run)
        if row:
            updated.append(slide_id)
            if not dry_run and c3b_triggers_c4(key):
                chains.append(_trigger_c4(slide))

    titles = {
        "approve": ("Slide approved", "Approved. Run C4 after all decisions, or wait for the automatic handoff."),
        "regenerate": ("AI regeneration requested", "C4 will queue C5."),
        "try_ai": ("AI version requested", "C4 will queue C5."),
        "delete": ("Delete requested", "C4 will mark the slide deleted and re-check C7."),
        "ai_submit": ("AI regeneration notes saved", "Notes written. C4 will queue C5."),
        "manual_replace": ("Manual replacement requested", "Upload the replacement and run C2M."),
        "manual_submit": ("Manual notes saved", "Upload the replacement and run C2M."),
        "global_ai_submit": ("AI notes saved for all slides", "Each updated slide was handed to C4."),
        "global_manual_submit": ("Manual notes saved for all slides", "Upload replacements and run C2M."),
    }
    title, message = titles.get(key, ("C3B updated", "Decision saved."))
    if dry_run:
        return _html_result(
            confirmation("C3B dry-run", message),
            processed=False,
            dry_run=True,
            action=key,
            updated_slide_ids=updated,
            fields=fields,
        )
    return _html_result(
        confirmation(title, message),
        processed=bool(updated),
        action=key,
        updated_slide_ids=updated,
        c4=chains,
    )
