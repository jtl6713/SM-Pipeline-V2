from unittest.mock import MagicMock, patch

from fbs3.graph import FacebookReelClient, FacebookReelError


def test_attach_thumbnail_uploads_source_file_not_url():
    client = FacebookReelClient(page_id="1", token="tok", version="v25.0")
    download = MagicMock()
    download.ok = True
    download.content = b"\xff\xd8\xffjpeg-bytes"
    download.headers = {"Content-Type": "image/jpeg"}
    upload = MagicMock()
    upload.ok = True
    upload.content = b'{"id":"thumb1"}'
    upload.json.return_value = {"id": "thumb1"}

    with patch("fbs3.graph.requests.get", return_value=download) as get_cover:
        with patch("fbs3.graph.requests.post", return_value=upload) as post_thumb:
            data = client.attach_thumbnail("2225347258392693", "https://media.chicagoshining.com/publish/cover.jpg")

    assert data == {"id": "thumb1"}
    get_cover.assert_called_once()
    kwargs = post_thumb.call_args.kwargs
    assert kwargs["params"] == {"is_preferred": "true"}
    name, body, mime = kwargs["files"]["source"]
    assert name == "cover.jpg"
    assert body == b"\xff\xd8\xffjpeg-bytes"
    assert mime == "image/jpeg"
    assert "url" not in kwargs["params"]


def test_attach_thumbnail_converts_png_to_jpeg():
    client = FacebookReelClient(page_id="1", token="tok", version="v25.0")
    download = MagicMock()
    download.ok = True
    download.content = b"png-bytes"
    download.headers = {"Content-Type": "image/png"}
    upload = MagicMock()
    upload.ok = True
    upload.content = b'{"success":true}'
    upload.json.return_value = {"success": True}

    with patch("fbs3.graph.requests.get", return_value=download):
        with patch("fbs3.graph.requests.post", return_value=upload) as post_thumb:
            with patch("ap0.public_cover.cover_as_jpeg", return_value=(b"jpeg-out", "image/jpeg")):
                client.attach_thumbnail("1", "https://media.chicagoshining.com/studio/previews/thumbnails/x/cover-9x16.png")

    name, body, mime = post_thumb.call_args.kwargs["files"]["source"]
    assert name == "cover.jpg"
    assert body == b"jpeg-out"
    assert mime == "image/jpeg"


def test_attach_thumbnail_raises_graph_error():
    client = FacebookReelClient(page_id="1", token="tok", version="v25.0")
    download = MagicMock()
    download.ok = True
    download.content = b"jpeg"
    download.headers = {"Content-Type": "image/jpeg"}
    upload = MagicMock()
    upload.ok = False
    upload.status_code = 400
    upload.content = b'{"error":{"message":"Invalid parameter"}}'
    upload.json.return_value = {"error": {"message": "Invalid parameter"}}

    with patch("fbs3.graph.requests.get", return_value=download):
        with patch("fbs3.graph.requests.post", return_value=upload):
            try:
                client.attach_thumbnail("1", "https://media.chicagoshining.com/publish/cover.jpg")
            except FacebookReelError as exc:
                assert "Invalid parameter" in str(exc)
            else:
                raise AssertionError("expected FacebookReelError")
