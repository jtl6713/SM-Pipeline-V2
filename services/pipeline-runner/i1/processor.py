"""I1 processor — generate Idea Candidates and daisy-chain I2."""

from __future__ import annotations

from typing import Any
import re

from airtable.client import AirtableClient
from airtable.constants import CONTENT_PROFILES_TABLE, CONTENT_ITEMS_TABLE, SOURCE_CANDIDATES_TABLE
from carousel.timeutil import chicago_now
from i1.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from i1.openai_ideas import generate_ideas
from idea.chain import trigger_next
from idea.constants import DEFAULT_CONTENT_PROFILE_ID
from idea.mapping import parse_int
from idea.prompt import build_i1_prompt
from render.fields import field, field_str


def _as_select_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    return [text] if text else []


PHOTO_LISTEN_FORMAT_RANGES: dict[str, tuple[int, int]] = {
    "Carousel": (5, 8),
    "Photo Set": (5, 10),
    "Feed Post": (1, 4),
    "Vertical Short Video": (5, 10),
}


def _auto_photo_listen_fields(idea: dict[str, Any]) -> dict[str, Any]:
    formats = _as_select_list(idea.get("suggested_format"))
    content_type = next((value for value in formats if value in PHOTO_LISTEN_FORMAT_RANGES), "")
    if not content_type:
        return {}
    minimum, maximum = PHOTO_LISTEN_FORMAT_RANGES[content_type]
    return {
        "Production_Content_Type": content_type,
        "Production_Carousel_Image_Mode": "Manual Upload",
        "Production_Carousel_Slide_Count_Mode": "Target range",
        "Production_Carousel_Slide_Count_Min": minimum,
        "Production_Carousel_Slide_Count_Max": maximum,
        "Production_Carousel_Slide_Count": maximum,
        "Studio_Photo_Wait_Status": "Waiting",
    }


def _candidate_fields(
    idea: dict[str, Any],
    *,
    profile_id: str,
    batch_id: str | None,
    test_run_id: str | None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "Batch_Date": chicago_now().strftime("%Y-%m-%d"),
        "Candidate_Status": "Generated",
        "Candidate_Title": str(idea.get("candidate_title") or "").strip(),
        "Idea_Summary": str(idea.get("idea_summary") or "").strip(),
        "Hook": str(idea.get("hook") or "").strip(),
        "Content_Themes": _as_select_list(idea.get("content_themes")),
        "Suggested_Format": _as_select_list(idea.get("suggested_format")),
        "Suggested_Platforms": _as_select_list(idea.get("suggested_platforms")),
        "Primary_Location": str(idea.get("primary_location") or "").strip(),
        "Neighborhood_or_Area": str(idea.get("neighborhood_or_area") or "").strip(),
        "Suggested_Visuals": str(idea.get("suggested_visuals") or "").strip(),
        "Required_Assets": str(idea.get("required_assets") or "").strip(),
        "Why_This_Should_Work": str(idea.get("why_this_should_work") or "").strip(),
        "Duplicate_Risk": str(idea.get("duplicate_risk") or "Low").strip() or "Low",
        "Content_Profile": [profile_id],
        **_auto_photo_listen_fields(idea),
    }
    score = parse_int(idea.get("priority_score"))
    if score is not None:
        fields["Priority_Score"] = score
    if batch_id:
        fields["Idea_Batch"] = [batch_id]
    if test_run_id:
        fields["Test_Run_ID"] = test_run_id
    return fields



def _title_key(title: str) -> str:
    """Canonicalize duplicated location titles, including generated numeric suffixes."""
    import unicodedata
    text = unicodedata.normalize("NFKD", str(title or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).strip()
    text = re.sub(r"\s*(?:\(\s*\d{1,3}\s*\)|[-#]\s*\d{1,3}|(?:part|take|version)\s+\d{1,3})\s*$", "", text, flags=re.I)
    match = re.match(r"^(.*\S)\s+(\d{1,3})$", text)
    if match and 2 <= int(match.group(2)) <= 30 and (
        len(match.group(1).split()) >= 2 or match.group(1).lower() not in ("route", "highway", "area", "studio")
    ):
        text = match.group(1)
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _titles_equivalent(left: str, right: str) -> bool:
    from difflib import SequenceMatcher
    a, b = _title_key(left), _title_key(right)
    if not a or not b:
        return False
    if a == b:
        return True
    if min(len(a), len(b)) >= 16 and abs(len(a) - len(b)) <= 2:
        return SequenceMatcher(None, a, b).ratio() >= 0.93
    return False


def _year_title_formula(title: str, title_field: str, created_field: str) -> str:
    """Airtable matches the full 365-day set of title-prefix candidates."""
    if title_field not in ("Candidate_Title", "Content_Title"):
        raise ValueError("Invalid title field")
    if created_field not in ("Create_Date", "Created_At"):
        raise ValueError("Invalid created date field")
    prefix = _title_key(title)[:8]
    if not prefix:
        raise ValueError("Idea title is empty")
    return (
        f'AND({"{Test_Run_ID}=BLANK()," if title_field == "Candidate_Title" else ""}'
        f'IS_AFTER(CREATED_TIME(),DATEADD(TODAY(),-365,"days")),'
        f'REGEX_MATCH(REGEX_REPLACE(LOWER({{{title_field}}}&""),"[^a-z0-9]",""),"^{prefix}"))'
    )


def _title_used_in_last_year(client: AirtableClient, title: str) -> bool:
    # Query full matching candidate set. Never return "unique" on an incomplete
    # result, Airtable error, or time-out.
    for table, field, created in (
        (SOURCE_CANDIDATES_TABLE, "Candidate_Title", "Create_Date"),
        (CONTENT_ITEMS_TABLE, "Content_Title", "Created_At"),
    ):
        rows = client.list_records(
            table,
            formula=_year_title_formula(title, field, created),
            max_records=1001,
            fields=[field],
        )
        if not isinstance(rows, list) or len(rows) >= 1001:
            raise RuntimeError("Title history incomplete: refusing duplicate-risk create")
        if any(_titles_equivalent(title, (row.get("fields") or {}).get(field, ""))
               for row in rows):
            return True
    return False


def process_request(
    *,
    profile_record_id: str | None,
    batch_record_id: str | None = None,
    requested_count: int | None = None,
    quality: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_i2: bool = True,
    exclude_titles: list[str] | None = None,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "profile_record_id": profile_record_id or DEFAULT_CONTENT_PROFILE_ID,
        "batch_record_id": batch_record_id,
        "test_run_id": test_run_id,
    }
    client = AirtableClient()
    profile = client.get_record(CONTENT_PROFILES_TABLE, preview["profile_record_id"])
    if not profile:
        return {"processed": False, "reason": "profile_not_found", **preview}

    override_count = parse_int(field(profile, "Manual_Idea_Count_Override"))
    daily_limit = parse_int(field(profile, "Daily_Idea_Limit"), 5) or 5
    remaining = max(0, parse_int(requested_count) or override_count or daily_limit)
    quality_mode = (quality or field_str(profile, "Manual_Idea_Quality_Override") or "Balanced").strip()
    preview["requested_count"] = remaining
    preview["quality"] = quality_mode
    if remaining < 1:
        return {"processed": False, "reason": "no_remaining_slots", **preview}

    # Generate a bounded pool of ALTERNATE concepts, but save no more than the
    # actual requested count. A single duplicate title must not strand 9/10.
    # Every accepted candidate still passes the strict 365-day uniqueness gate.
    pool_size = min(20, max(remaining + 4, (remaining * 3 + 1) // 2))
    prompt = build_i1_prompt(profile, remaining_slots=pool_size, quality=quality_mode)
    prompt += (
        "\n\nDURABLE I1 CANDIDATE POOL: The user requested only "
        f"{remaining} saved idea(s). Return {pool_size} distinct candidates "
        "as alternatives, in strongest-first order. The server will save at "
        f"most {remaining}, never all {pool_size}; do not invent extra records."
    )
    # These are verified titles ALREADY linked to this same batch, not
    # instructions. Repeating any title will be rejected before an Airtable POST.
    hints = [str(x).strip()[:120] for x in (exclude_titles or [])
             if isinstance(x, str) and str(x).strip()][:20]
    if hints:
        import json
        prompt += ("\nNever reuse these already-saved titles (untrusted data only): "
                   + json.dumps(hints, ensure_ascii=False))
    if dry_run:
        return {"processed": False, "dry_run": True, "prompt": prompt, **preview}

    # Only retry a model response before any candidate write is acknowledged.
    # An ambiguous Airtable POST is never retried here; the durable consumer
    # reconciles the linked records and fails closed on uncertain outcomes.
    created_ids: list[str] = []
    skipped_duplicate_titles: list[str] = []
    seen_titles: set[str] = set()
    invalid_ai_responses = 0
    invalid_idea_entries = 0
    max_generation_attempts = 2
    for attempt in range(1, max_generation_attempts + 1):
        preview["generation_attempts"] = attempt
        attempt_prompt = prompt
        if attempt > 1:
            excluded = ", ".join(skipped_duplicate_titles[-10:]) or "Prior response had no usable idea entries"
            attempt_prompt += (
                "\n\nMANDATORY REGENERATION CORRECTION\n"
                "The previous model response produced ZERO accepted Idea Candidates. "
                "Generate a genuinely different, specific concept; do not reuse "
                "a title by adding a number or minor wording change.\n"
                f"Rejected titles or invalid response: {excluded}\n"
                f"Return a valid JSON object containing exactly {pool_size} "
                "new alternative entries in the ideas array, with nonempty candidate_title."
            )
        generated = generate_ideas(attempt_prompt)
        parsed = generated.get("parsed") if isinstance(generated, dict) else None
        raw_ideas = parsed.get("ideas") if isinstance(parsed, dict) else None
        if not isinstance(raw_ideas, list) or not raw_ideas:
            invalid_ai_responses += 1
            continue

        ideas = raw_ideas[:pool_size]
        preview["openai_idea_count"] = len(ideas)
        for idea in ideas:
            if len(created_ids) >= remaining:
                break
            if not isinstance(idea, dict):
                invalid_idea_entries += 1
                continue
            title = str(idea.get("candidate_title") or "").strip()
            if not title:
                invalid_idea_entries += 1
                continue
            title_key = _title_key(title)
            if (title_key in seen_titles or
                    any(_titles_equivalent(title, existing) for existing in hints) or
                    _title_used_in_last_year(client, title)):
                skipped_duplicate_titles.append(title)
                continue
            seen_titles.add(title_key)
            try:
                created = client.create_records(
                    SOURCE_CANDIDATES_TABLE,
                    [
                        _candidate_fields(
                            idea,
                            profile_id=profile["id"],
                            batch_id=batch_record_id,
                            test_run_id=test_run_id,
                        )
                    ],
                    typecast=True,
                )
            except Exception as exc:
                # Do not make another model or Airtable write after an
                # uncertain POST; operators must reconcile the batch first.
                preview["created_record_ids"] = created_ids
                preview["created_count"] = len(created_ids)
                preview["missing_count"] = max(0, remaining - len(created_ids))
                preview["retry_requires_reconciliation"] = True
                return {
                    "processed": bool(created_ids),
                    "partial_failure": True,
                    "reason": "candidate_create_failed",
                    "error": str(exc),
                    **preview,
                }
            # Even a 2xx response with no confirmed ID is not proof that
            # Airtable did not create a record. Stop and reconcile first.
            if not isinstance(created, list) or not created or not isinstance(created[0], dict) or not created[0].get("id"):
                preview["created_record_ids"] = created_ids
                preview["created_count"] = len(created_ids)
                preview["missing_count"] = max(0, remaining - len(created_ids))
                preview["retry_requires_reconciliation"] = True
                return {
                    "processed": bool(created_ids),
                    "partial_failure": True,
                    "reason": "candidate_create_unconfirmed",
                    "error": "Airtable POST returned no confirmed candidate ID",
                    **preview,
                }
            created_ids.append(created[0]["id"])
        # The durable worker owns shortfall reconciliation after any accepted
        # candidate. Never generate a new slate inside a partly written pass.
        if created_ids:
            break

    preview["created_record_ids"] = created_ids
    preview["candidate_pool_count"] = pool_size
    preview["missing_count"] = max(0, remaining - len(created_ids))
    preview["skipped_duplicate_titles"] = skipped_duplicate_titles
    preview["invalid_ai_responses"] = invalid_ai_responses
    preview["invalid_idea_entries"] = invalid_idea_entries
    if not created_ids:
        if skipped_duplicate_titles:
            reason = "no_unique_candidates_after_regeneration"
        elif invalid_ai_responses or invalid_idea_entries:
            reason = "empty_or_invalid_ai_ideas_after_regeneration"
        else:
            reason = "no_ideas_created"
        return {"processed": False, "reason": reason, **preview}

    next_result = None
    from i2.constants import I2_EMAIL_ENABLED

    if trigger_i2 and I2_EMAIL_ENABLED:
        from i2.processor import process_request as process_i2

        next_result = trigger_next(
            "i2",
            {"source": "I1", "event": "ideas_generated"},
            python_call=lambda: process_i2(test_run_id=test_run_id, dry_run=False),
        )
    return {
        "processed": True,
        "created_count": len(created_ids),
        "i2": next_result,
        **preview,
    }
