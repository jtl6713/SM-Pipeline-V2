"""ElevenLabs 401 on a profile voice falls back to Kate for that process."""

from p2.constants import VOICE_ID_DEFAULT
from p2.elevenlabs_client import (
    reset_unauthorized_voices,
    synthesize_voiceover_by_id,
    unauthorized_voice_ids,
)

BRIONY = "hv8WzBOrsvuSUeIQGOCM"


class _Response:
    def __init__(self, status_code, content=b""):
        self.status_code = status_code
        self.content = content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"{self.status_code} Client Error")


def test_unauthorized_profile_voice_retries_kate(monkeypatch):
    reset_unauthorized_voices()
    calls = []

    def _post(url, **_kwargs):
        calls.append(url)
        if url.endswith(f"/{BRIONY}"):
            return _Response(401, b"")
        return _Response(200, b"kate-audio")

    monkeypatch.setattr("p2.elevenlabs_client.requests.post", _post)
    monkeypatch.setattr(
        "p2.elevenlabs_client.load_settings",
        lambda: {"elevenlabs_api_key": "test-key"},
    )
    audio = synthesize_voiceover_by_id("hello", voice_id=BRIONY)
    assert audio == b"kate-audio"
    assert calls[0].endswith(f"/{BRIONY}")
    assert calls[1].endswith(f"/{VOICE_ID_DEFAULT}")
    assert BRIONY in unauthorized_voice_ids()

    calls.clear()
    again = synthesize_voiceover_by_id("again", voice_id=BRIONY)
    assert again == b"kate-audio"
    assert len(calls) == 1
    assert calls[0].endswith(f"/{VOICE_ID_DEFAULT}")
    reset_unauthorized_voices()
