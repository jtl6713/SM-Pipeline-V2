from unittest.mock import MagicMock

from item4.settings import PipelineSettings
from yt.client import expected_youtube_channel_id, verify_upload_channel, video_channel_id


class FakeSettings(PipelineSettings):
    def __init__(self, values: dict[str, str]) -> None:
        self._values = values

    def get(self, name: str) -> str:
        return self._values.get(name, "")


def test_video_channel_id_from_list_response():
    payload = {"items": [{"snippet": {"channelId": "UCabc123"}}]}
    assert video_channel_id(payload) == "UCabc123"


def test_verify_upload_channel_accepts_matching_channel():
    settings = FakeSettings({"LA_YOUTUBE_CHANNEL_ID": "UCabc123"})
    output = {"id": "recOut", "fields": {"Market_Name": ["Los Angeles"]}}
    uploader = MagicMock()
    uploader.video_status.return_value = (
        200,
        {"items": [{"snippet": {"channelId": "UCabc123"}}]},
    )
    error, theme, expected = verify_upload_channel(
        settings=settings,
        output=output,
        client=None,
        uploader=uploader,
        video_id="vid123",
    )
    assert error is None
    assert theme == "la"
    assert expected == "UCabc123"


def test_verify_upload_channel_rejects_mismatch():
    settings = FakeSettings({"LA_YOUTUBE_CHANNEL_ID": "UCabc123"})
    output = {"id": "recOut", "fields": {"Market_Name": ["Los Angeles"]}}
    uploader = MagicMock()
    uploader.video_status.return_value = (
        200,
        {"items": [{"snippet": {"channelId": "UCwrong999"}}]},
    )
    error, theme, expected = verify_upload_channel(
        settings=settings,
        output=output,
        client=None,
        uploader=uploader,
        video_id="vid123",
    )
    assert error
    assert "UCwrong999" in error
    assert theme == "la"
    assert expected == "UCabc123"


def test_expected_youtube_channel_id_for_miami():
    settings = FakeSettings({"MIAMI_YOUTUBE_CHANNEL_ID": "UCmiami"})
    output = {"id": "recOut", "fields": {"Market_Name": ["Miami"]}}
    theme, channel = expected_youtube_channel_id(settings, output, client=None)
    assert theme == "miami"
    assert channel == "UCmiami"
