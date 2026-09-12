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


def synthesize_voiceover_by_id(text: str, *, voice_id: str) -> bytes:
    settings = load_settings()
    api_key = str(settings.get("elevenlabs_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is required for voiceover generation")
    voice_id = str(voice_id or "").strip()
    if not voice_id:
        raise RuntimeError("ElevenLabs voice_id is required")
    response = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
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
                "speed": 1.0,
                "use_speaker_boost": False,
            },
            "apply_text_normalization": "auto",
        },
        timeout=300,
    )
    response.raise_for_status()
    content = response.content
    if not content:
        raise RuntimeError("ElevenLabs returned empty audio")
    return content


def synthesize_voiceover(text: str, *, voice_name: str) -> bytes:
    return synthesize_voiceover_by_id(text, voice_id=voice_id_for_name(voice_name))
