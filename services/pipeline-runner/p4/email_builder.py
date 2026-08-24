"""P4 new-request email (Make 5533802 module 12/21)."""

from __future__ import annotations

from typing import Any

from p4.constants import ASSET_NEEDS_DASHBOARD_URL


def _text(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def shot_block(shot: dict[str, Any], *, carousel: bool, aspect_ratios: list[str]) -> str:
    length_label = "Not applicable — carousel slide" if carousel else f"{shot.get('desired_final_length_seconds') or 0} sec"
    raw_label = "Not applicable — carousel slide" if carousel else f"{shot.get('recommended_raw_capture_seconds') or 0} sec"
    min_label = "Not applicable — carousel slide" if carousel else f"{shot.get('minimum_usable_length_seconds') or 0} sec"
    if len(aspect_ratios) == 1:
        ratio = aspect_ratios[0]
        orientation = "Horizontal" if ratio == "16:9" else ("Square" if ratio == "1:1" else "Vertical")
        aspect = ratio
    else:
        orientation = _text(shot.get("orientation"), "Vertical")
        aspect = _text(shot.get("aspect_ratio"), "9:16")
    return (
        f"<strong>Asset {shot.get('shot_number')} — {_text(shot.get('asset_type'), 'Video')}</strong><br>\n"
        f"<strong>Location:</strong> {_text(shot.get('location'))}<br>\n"
        f"<strong>Desired final length:</strong> {length_label}<br>\n"
        f"<strong>Recommended raw capture:</strong> {raw_label}<br>\n"
        f"<strong>Minimum usable length:</strong> {min_label}<br>\n"
        f"<strong>Orientation:</strong> {orientation} / {aspect}<br>\n"
        f"<strong>Shot size:</strong> {_text(shot.get('shot_size'))}<br>\n"
        f"<strong>Camera movement:</strong> {_text(shot.get('camera_movement'))}<br>\n"
        f"<strong>Time of day:</strong> {_text(shot.get('time_of_day'))}<br>\n"
        f"<strong>Safe text space:</strong> {_text(shot.get('safe_text_space'))}<br><br>\n"
        f"<strong>Description:</strong><br>\n{_text(shot.get('exact_shot_description'))}<br><br>\n"
        f"<strong>Why needed:</strong><br>\n{_text(shot.get('why_needed'))}<br><br>\n"
        f"<strong>Capture instructions:</strong><br>\n{_text(shot.get('capture_instructions'))}<br><br>\n"
        f"<strong>Avoid:</strong><br>\n{_text(shot.get('avoid'))}<br><br>\n"
        f"<strong>Example overlay text:</strong><br>\n{_text(shot.get('example_overlay_text'))}"
    )


def request_email_subject(brand: str, title: str, missing_count: int) -> str:
    return f"{brand} Asset Request — {title} — {missing_count} missing asset(s)"


def request_email_html(context: dict[str, Any]) -> str:
    shots_html = "<br><br>".join(context.get("shot_blocks") or [])
    return f"""<p>Here is a new <strong>{context['brand']}</strong> asset request created by the deterministic P4 workflow.</p>

<p>
<strong>Open full asset needs dashboard:</strong><br>
<a href="{ASSET_NEEDS_DASHBOARD_URL}">View all open asset needs</a>
</p>

<p>
<strong>Organization:</strong> {context['organization']}<br>
<strong>Brand:</strong> {context['brand']}<br>
<strong>Content:</strong> {context['title']}<br>
<strong>Content type:</strong> {context['content_type']}<br>
<strong>Actual platforms:</strong> {context['platforms']}<br>
<strong>Actual formats:</strong> {context['formats']}<br>
<strong>Actual aspect ratios:</strong> {context['aspect_ratios']}<br>
<strong>Location:</strong> {context['location']}<br>
<strong>Priority:</strong> {context['priority']}<br>
<strong>Approved visual target:</strong> {context['visual_target']}<br>
<strong>Target final length:</strong> {context['target_length']}<br>
<strong>Linked existing assets:</strong> {context['linked_existing']}<br>
<strong>New assets requested:</strong> {context['missing_count']}<br>
<strong>Recommended raw capture:</strong> {context['raw_capture']}<br>
<strong>Coverage validation:</strong> {context['validation']}
</p>

<p><strong>Existing asset coverage</strong><br>{context['existing_summary']}</p>
<p><strong>Missing asset summary</strong><br>{context['missing_summary']}</p>
<p><strong>Production request</strong><br>{context['digest']}</p>
<p><strong>Coverage validation notes</strong><br>{context['validation_notes']}</p>
<p><strong>Production notes</strong><br>{context['production_notes']}</p>
<p><strong>Requested shots or slides</strong></p>
{shots_html}

<p>Open Airtable: Asset Requests / Asset Request Shots.</p>"""
