"""ElevenLabs text-to-speech — Make module 2 port."""

from __future__ import annotations

import requests

from config import load_settings
from p2.constants import (
    ELEVENLABS_MODEL_ID,
    ELEVENLABS_OUTPUT_FORMAT,
    VOICE_ID_DEFAULT,
    VOICE_ID_GEORGE,
)


def voice_id_for_name(voice_name: str) -> str:
    if voice_name.strip().lower() == "george":
        return VOICE_ID_GEORGE
    return VOICE_ID_DEFAULT


def synthesize_voiceover(text: str, *, voice_name: str) -> bytes:
    settings = load_settings()
    api_key = str(settings.get("elevenlabs_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is required for P2 voiceover generation")
    voice_id = voice_id_for_name(voice_name)
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
