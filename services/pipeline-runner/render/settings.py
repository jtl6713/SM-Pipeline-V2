from __future__ import annotations

from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from config import load_settings
from item4.settings import PipelineSettings


def get_render_server_url(client: AirtableClient) -> str:
    rows = client.list_records(
        PIPELINE_SETTINGS_TABLE,
        view="CFG - Active Render Server URL",
        max_records=1,
    )
    if rows:
        value = str(rows[0].get("fields", {}).get("Setting_Value") or "").strip()
        if value:
            return value.rstrip("/")
    settings = PipelineSettings(client)
    named = settings.get("RENDER_SERVER_BASE_URL")
    if named:
        return named.rstrip("/")
    return str(load_settings().get("remotion_renderer_url") or "http://127.0.0.1:3333").rstrip("/")


def get_render_volumes(client: AirtableClient) -> tuple[float, float]:
    settings = PipelineSettings(client)
    music_raw = settings.get("render_music_volume") or "0.21"
    voice_raw = settings.get("render_voiceover_volume") or "1"
    try:
        music = float(str(music_raw).strip())
    except ValueError:
        music = 0.21
    try:
        voice = float(str(voice_raw).strip())
    except ValueError:
        voice = 1.0
    return music, voice


def get_timing_defaults(client: AirtableClient) -> tuple[str, dict]:
    import json

    from t1.constants import DEFAULT_RULES

    settings = PipelineSettings(client)
    url = (
        settings.get("TIMING_ENGINE_URL")
        or str(load_settings().get("timing_engine_url") or "http://127.0.0.1:3336")
    ).rstrip("/")
    raw = settings.get("DEFAULT_TIMING_RULES_JSON")
    rules = DEFAULT_RULES
    if raw:
        try:
            parsed = json.loads(raw)
            legacy_default = {"rules": [{"remaining": True, "every_n_beats": 2}]}
            if isinstance(parsed, dict) and parsed.get("rules") and parsed != legacy_default:
                strategy = str(parsed.get("strategy") or "").strip().lower()
                if strategy not in {"", "vo_phased", "equal_beats", "spread", "beat_fill"}:
                    rules = parsed
        except json.JSONDecodeError:
            pass
    return url, rules


def get_google_drive_folder_id(client: AirtableClient) -> str:
    settings = PipelineSettings(client)
    for name in (
        "GOOGLE_DRIVE_FINAL_OUTPUT_FOLDER_ID",
        "FINAL_OUTPUT_DRIVE_FOLDER_ID",
        "RENDERED_PLATFORM_OUTPUTS_FOLDER_ID",
    ):
        value = settings.get(name)
        if value:
            return value
    rows = client.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula='AND({Active}=1,{Setting_Name}="GOOGLE_DRIVE_FINAL_OUTPUT_FOLDER_ID")',
        max_records=1,
    )
    if rows:
        return str(rows[0].get("fields", {}).get("Setting_Value") or "").strip()
    raise RuntimeError("GOOGLE_DRIVE_FINAL_OUTPUT_FOLDER_ID is not configured in Pipeline Settings")
