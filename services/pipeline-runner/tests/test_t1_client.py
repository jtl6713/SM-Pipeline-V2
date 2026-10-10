from unittest.mock import Mock, patch

import pytest

from t1.client import TimingEngineClient


def test_create_timeline_rejects_empty_body():
    client = TimingEngineClient("http://timing.example")
    response = Mock()
    response.status_code = 200
    response.content = b""
    response.text = ""
    with patch("t1.client.requests.post", return_value=response):
        with pytest.raises(RuntimeError, match="empty body"):
            client.create_timeline({"clip_count": 1})


def test_create_timeline_rejects_non_json_body():
    client = TimingEngineClient("http://timing.example")
    response = Mock()
    response.status_code = 200
    response.content = b"<html>nope</html>"
    response.text = "<html>nope</html>"
    response.json.side_effect = ValueError("Expecting value: line 1 column 1 (char 0)")
    with patch("t1.client.requests.post", return_value=response):
        with pytest.raises(RuntimeError, match="non-JSON"):
            client.create_timeline({"clip_count": 1})


def test_create_timeline_returns_dict():
    client = TimingEngineClient("http://timing.example")
    response = Mock()
    response.status_code = 200
    response.content = b'{"bpm":120}'
    response.text = '{"bpm":120}'
    response.json.return_value = {"bpm": 120}
    with patch("t1.client.requests.post", return_value=response):
        assert client.create_timeline({"clip_count": 1}) == {"bpm": 120}
