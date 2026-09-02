from studio_library.processor import classify_library_file


def test_classify_library_photo_and_clip():
    photo = classify_library_file(filename="riverwalk.jpg", mime_type="image/jpeg")
    assert photo["kind"] == "image"
    assert photo["media_class"] == "Image"
    clip = classify_library_file(filename="take.mov", mime_type="video/quicktime")
    assert clip["kind"] == "video"
    assert clip["asset_role"] == "Raw Footage"


def test_classify_library_rejects_audio():
    try:
        classify_library_file(filename="bed.mp3", mime_type="audio/mpeg")
    except ValueError as exc:
        assert "supported" in str(exc)
        return
    raise AssertionError("audio should not classify as a library still or clip")
