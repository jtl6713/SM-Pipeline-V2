"""ElevenLabs text-to-speech — Make module 2 port."""

from __future__ import annotations

from typing import Any

import requests

from config import load_settings
from p2.constants import (
    ELEVENLABS_MODEL_ID,
    ELEVENLABS_OUTPUT_FORMAT,
    VOICE_ID_DEFAULT,
    VOICE_ID_GEORGE,
)
from render.fields import field_str


def voice_id_for_name(voice_name: str) -> str:
    if voice_name.strip().lower() == "george":
        return VOICE_ID_GEORGE
    return VOICE_ID_DEFAULT


def resolve_content_voice_id(item: dict[str, Any] | None) -> str:
    """Prefer Content Item Voice_ID; fall back to legacy Voice / Voice_Name → Kate/George map."""
    voice_id = field_str(item or {}, "Voice_ID").strip()
    if voice_id:
        return voice_id
    legacy_name = field_str(item or {}, "Voice_Name") or field_str(item or {}, "Voice")
    return voice_id_for_name(legacy_name)


def _clean_api_key(raw: str) -> str:
    return str(raw or "").strip().strip('"').strip("'")


def _response_detail(response: requests.Response) -> str:
    text = (response.text or "").strip().replace("\n", " ")
    if len(text) > 400:
        text = text[:400] + "…"
    return text


def _quota_exhausted_message(api_key: str, *, status_code: int, detail: str) -> str | None:
    """Return a clear quota message when ElevenLabs rejects TTS for character limits."""
    try:
        user = requests.get(
            "https://api.elevenlabs.io/v1/user",
            headers={"xi-api-key": api_key, "Accept": "application/json"},
            timeout=30,
        )
    except requests.RequestException:
        return None
    if not user.ok:
        return None
    try:
        body = user.json()
    except ValueError:
        return None
    sub = body.get("subscription") if isinstance(body, dict) else None
    if not isinstance(sub, dict):
        return None
    try:
        used = int(sub.get("character_count") or 0)
        limit = int(sub.get("character_limit") or 0)
    except (TypeError, ValueError):
        return None
    lowered = detail.lower()
    detail_hints_quota = any(token in lowered for token in ("quota", "character", "limit", "credit"))
    if not (limit > 0 and used >= limit) and not detail_hints_quota:
        return None
    reset = sub.get("next_character_count_reset_unix")
    reset_bit = f" next_reset_unix={reset}" if reset not in (None, "") else ""
    return (
        f"ElevenLabs character quota exhausted ({used}/{limit}); "
        f"TTS HTTP {status_code}.{reset_bit} "
        "Upgrade the plan or wait for the monthly reset — the voice ID is not the problem."
    )


def synthesize_voiceover_by_id(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
    settings = load_settings()
    api_key = _clean_api_key(str(settings.get("elevenlabs_api_key") or ""))
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is required for voiceover generation")
    voice_id = str(voice_id or "").strip()
    if not voice_id:
        raise RuntimeError("ElevenLabs voice_id is required")
    try:
        speech_speed = float(speed or 1.0)
    except (TypeError, ValueError):
        speech_speed = 1.0
    speech_speed = min(1.2, max(0.7, speech_speed))
    # output_format is a query parameter on the ElevenLabs TTS API (not a JSON body field).
    response = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        params={"output_format": ELEVENLABS_OUTPUT_FORMAT},
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": text,
            "model_id": ELEVENLABS_MODEL_ID,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "speed": speech_speed,
                "use_speaker_boost": False,
            },
            "apply_text_normalization": "auto",
        },
        timeout=300,
    )
    if not response.ok:
        detail = _response_detail(response)
        if response.status_code in (401, 402, 429):
            quota_msg = _quota_exhausted_message(
                api_key, status_code=response.status_code, detail=detail
            )
            if quota_msg:
                raise RuntimeError(quota_msg)
        suffix = f" body={detail}" if detail else ""
        raise RuntimeError(
            f"ElevenLabs TTS failed HTTP {response.status_code} for voice_id={voice_id}.{suffix}"
        )
    content = response.content
    if not content:
        raise RuntimeError("ElevenLabs returned empty audio")
    return content


def synthesize_voiceover(text: str, *, voice_name: str) -> bytes:
    return synthesize_voiceover_by_id(text, voice_id=voice_id_for_name(voice_name))
