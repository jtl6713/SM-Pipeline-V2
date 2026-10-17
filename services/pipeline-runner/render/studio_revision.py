from __future__ import annotations

from typing import Any

from render.fields import field, parse_json_field


def _dict_field(output: dict[str, Any], name: str) -> dict[str, Any]:
    raw = field(output, name)
    if isinstance(raw, dict):
        return raw
    parsed = parse_json_field(raw)
    return parsed if isinstance(parsed, dict) else {}


def _revision(value: Any) -> int:
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _contract(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return {
        "visualRevision": _revision(value.get("visualRevision")),
        "visualSequenceHash": str(value.get("visualSequenceHash") or "").strip(),
        "scriptRevision": _revision(value.get("scriptRevision")),
        "scriptHash": str(value.get("scriptHash") or "").strip(),
    }


def current_studio_revision(output: dict[str, Any]) -> dict[str, Any]:
    settings = _dict_field(output, "Studio_Creative_Settings_JSON")
    visual = settings.get("visual_timeline") if isinstance(settings.get("visual_timeline"), dict) else {}
    script = settings.get("visual_script") if isinstance(settings.get("visual_script"), dict) else {}
    return {
        "visualRevision": _revision(visual.get("revision")),
        "visualSequenceHash": str(visual.get("sequence_hash") or visual.get("sequenceHash") or "").strip(),
        "scriptRevision": _revision(script.get("revision")),
        "scriptHash": str(script.get("script_hash") or script.get("scriptHash") or "").strip(),
    }


def manifest_studio_revision(output: dict[str, Any]) -> dict[str, Any] | None:
    manifest = _dict_field(output, "Creative_Render_Manifest_JSON")
    return _contract(manifest.get("studioRevision"))


def props_studio_revision(output: dict[str, Any]) -> dict[str, Any] | None:
    props = _dict_field(output, "Remotion_Props_JSON")
    return _contract(props.get("studioRevision"))


def studio_revision_error(expected: dict[str, Any] | None, output: dict[str, Any]) -> str | None:
    if expected is None:
        # Legacy render packages have no Studio revision contract and remain valid.
        return None
    current = current_studio_revision(output)
    if expected == current:
        return None
    return (
        "Studio render package is stale: "
        f"expected visual r{expected['visualRevision']} {expected['visualSequenceHash'] or '(none)'} / "
        f"script r{expected['scriptRevision']} {expected['scriptHash'] or '(none)'}, "
        f"current visual r{current['visualRevision']} {current['visualSequenceHash'] or '(none)'} / "
        f"script r{current['scriptRevision']} {current['scriptHash'] or '(none)'}. "
        "Prepare a fresh render from the current Studio editor state."
    )


def render_package_revision_error(output: dict[str, Any]) -> str | None:
    return studio_revision_error(manifest_studio_revision(output), output)


def render_job_revision_error(output: dict[str, Any]) -> str | None:
    return studio_revision_error(props_studio_revision(output), output)
