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


# Voices that returned 401 this process. Later scenes skip straight to Kate.
_UNAUTHORIZED_VOICE_IDS: set[str] = set()


def unauthorized_voice_ids() -> set[str]:
    return set(_UNAUTHORIZED_VOICE_IDS)


def reset_unauthorized_voices() -> None:
    _UNAUTHORIZED_VOICE_IDS.clear()


def synthesize_voiceover_by_id(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
    settings = load_settings()
    api_key = str(settings.get("elevenlabs_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is required for voiceover generation")
    voice_id = str(voice_id or "").strip()
    if not voice_id:
        raise RuntimeError("ElevenLabs voice_id is required")
    # Briony (hv8WzBOrsvuSUeIQGOCM) 401'd on LA 650–654 while Kate still belongs
    # to the account. Do not spend another request on a voice we already rejected.
    if voice_id in _UNAUTHORIZED_VOICE_IDS and voice_id != VOICE_ID_DEFAULT:
        voice_id = VOICE_ID_DEFAULT
    try:
        speech_speed = float(speed or 1.0)
    except (TypeError, ValueError):
        speech_speed = 1.0
    speech_speed = min(1.2, max(0.7, speech_speed))
    requested = voice_id

    def _post(active_voice_id: str):
        return requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{active_voice_id}",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": text,
                "model_id": ELEVENLABS_MODEL_ID,
                "output_format": ELEVENLABS_OUTPUT_FORMAT,
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

    response = _post(requested)
    if response.status_code == 401 and requested != VOICE_ID_DEFAULT:
        _UNAUTHORIZED_VOICE_IDS.add(requested)
        response = _post(VOICE_ID_DEFAULT)
    response.raise_for_status()
    content = response.content
    if not content:
        raise RuntimeError("ElevenLabs returned empty audio")
    return content


def synthesize_voiceover(text: str, *, voice_name: str) -> bytes:
    return synthesize_voiceover_by_id(text, voice_id=voice_id_for_name(voice_name))
