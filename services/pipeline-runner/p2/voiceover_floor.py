"""Spoken voiceover must last at least 4 seconds. A short file is never saved."""

from __future__ import annotations

from typing import Any, Callable

from audio.voiceover_duration import (
    DURATION_EPSILON_SECONDS,
    MIN_VOICEOVER_SECONDS,
    VoiceoverTooShort,
)

NormalizeFn = Callable[[bytes], tuple[Any, bytes]]
ProbeFn = Callable[[bytes], float]
LengthenFn = Callable[..., str]
SynthesizeFn = Callable[[str], bytes]


def _output_text(payload: dict[str, Any]) -> str:
    direct = str(payload.get("output_text") or "").strip()
    if direct:
        return direct
    chunks: list[str] = []
    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        for part in item.get("content") or []:
            if not isinstance(part, dict):
                continue
            text = part.get("text") or part.get("output_text")
            if text:
                chunks.append(str(text))
    return "\n".join(chunks).strip()


def lengthen_voiceover_script(text: str, *, measured_seconds: float) -> str:
    """Rewrite a too-short line so the next read can last at least 4 seconds."""
    original = " ".join(str(text or "").split())
    spoken = float(measured_seconds or 0)
    if not original:
        raise VoiceoverTooShort(
            "Voiceover script is empty. Spoken audio must be at least "
            f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    from ai_api_router import post_responses
    from config import load_settings
    from p1.constants import OPENAI_MODEL

    settings = load_settings()
    model = str(settings.get("openai_p1_model") or OPENAI_MODEL)
    response = post_responses(
        settings,
        {
            "model": model,
            "instructions": (
                "You rewrite spoken voiceover lines for a city video. "
                "Return only the spoken words. No labels, quotes, hashtags, or stage directions."
            ),
            "input": (
                f"This line was spoken in {spoken:.2f} seconds. That is too short. "
                "Rewrite it so a natural narrator needs at least 4 seconds. "
                "Keep the same place and facts. Add one concrete spoken sentence if needed.\n\n"
                f"{original}"
            ),
            "store": False,
            "max_output_tokens": 200,
            "reasoning": {"effort": "low"},
        },
        timeout=60,
        stage="P2",
    )
    if not getattr(response, "ok", False):
        status = getattr(response, "status_code", "error")
        raise VoiceoverTooShort(
            f"Voiceover is {spoken:.3f}s and the rewrite failed ({status}). "
            f"Spoken audio must be at least {MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    rewritten = _output_text(response.json()).strip().strip('"')
    if not rewritten or rewritten == original:
        raise VoiceoverTooShort(
            f"Voiceover is {spoken:.3f}s and the rewrite did not lengthen the line. "
            f"Spoken audio must be at least {MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    return rewritten


def speak_until_minimum(
    text: str,
    *,
    synthesize: SynthesizeFn,
    normalize: NormalizeFn,
    probe: ProbeFn,
    lengthen: LengthenFn,
    attempts: int = 3,
) -> tuple[bytes, float, str, Any]:
    """Synthesize until spoken audio is at least 4 seconds. Never return a short file."""
    script = " ".join(str(text or "").split())
    if not script:
        raise VoiceoverTooShort(
            "Voiceover script is empty. Spoken audio must be at least "
            f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    measured = 0.0
    audio = b""
    details: Any = None
    tries = max(1, int(attempts))
    for _attempt in range(tries):
        raw = synthesize(script)
        details, audio = normalize(raw)
        measured = float(probe(audio))
        if measured + DURATION_EPSILON_SECONDS >= MIN_VOICEOVER_SECONDS:
            return audio, measured, script, details
        script = " ".join(str(lengthen(script, measured_seconds=measured) or "").split())
        if not script:
            break
    raise VoiceoverTooShort(
        f"Voiceover is {measured:.3f}s. Spoken audio must be at least "
        f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
    )
