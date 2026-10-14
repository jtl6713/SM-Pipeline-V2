from unittest.mock import MagicMock, patch

import pytest

from p2 import elevenlabs_client as client


def test_clean_api_key_strips_quotes():
    assert client._clean_api_key('  "sk_abc"  ') == "sk_abc"
    assert client._clean_api_key("'sk_abc'") == "sk_abc"


def test_synthesize_moves_output_format_to_query_and_surfaces_quota(monkeypatch):
    settings = {"elevenlabs_api_key": "sk_test_key"}
    monkeypatch.setattr(client, "load_settings", lambda: settings)

    tts_response = MagicMock()
    tts_response.ok = False
    tts_response.status_code = 401
    tts_response.text = ""
    tts_response.content = b""

    user_response = MagicMock()
    user_response.ok = True
    user_response.json.return_value = {
        "subscription": {
            "character_count": 285596,
            "character_limit": 285596,
            "next_character_count_reset_unix": 1794170997,
        }
    }

    with patch.object(client.requests, "post", return_value=tts_response) as post:
        with patch.object(client.requests, "get", return_value=user_response) as get:
            with pytest.raises(RuntimeError, match="character quota exhausted"):
                client.synthesize_voiceover_by_id("hello", voice_id="hv8WzBOrsvuSUeIQGOCM")
            assert post.call_args.kwargs["params"]["output_format"] == "mp3_44100_128"
            assert "output_format" not in post.call_args.kwargs["json"]
            assert get.called


def test_synthesize_non_quota_401_includes_voice_id(monkeypatch):
    settings = {"elevenlabs_api_key": "sk_test_key"}
    monkeypatch.setattr(client, "load_settings", lambda: settings)

    tts_response = MagicMock()
    tts_response.ok = False
    tts_response.status_code = 401
    tts_response.text = '{"detail":{"status":"invalid_api_key"}}'
    tts_response.content = b""

    user_response = MagicMock()
    user_response.ok = True
    user_response.json.return_value = {
        "subscription": {"character_count": 10, "character_limit": 100000}
    }

    with patch.object(client.requests, "post", return_value=tts_response):
        with patch.object(client.requests, "get", return_value=user_response):
            with pytest.raises(RuntimeError, match="voice_id=hv8WzBOrsvuSUeIQGOCM"):
                client.synthesize_voiceover_by_id("hello", voice_id="hv8WzBOrsvuSUeIQGOCM")
