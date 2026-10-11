from __future__ import annotations

from pathlib import Path

import pytest

from studio_compress.ame_encoder import (
    AmeNotReady,
    bridge_is_ready,
    encode_downloaded_master,
    live_encoder,
    preset_for_asset,
)


def _asset(**extra) -> dict:
    asset = {
        "id": "vid1",
        "name": "clip.mov",
        "r2_key": "studio/master-assets/recPR/vid1-clip.mov",
        "width": 1080,
        "height": 1920,
    }
    asset.update(extra)
    return asset


def _root(tmp_path: Path) -> Path:
    root = tmp_path / "AME_Bridge"
    (root / "inbox" / "social-standard-9x16").mkdir(parents=True)
    (root / "out" / "social-standard-9x16").mkdir(parents=True)
    (root / "inbox" / "landscape-standard-16x9").mkdir(parents=True)
    (root / "out" / "landscape-standard-16x9").mkdir(parents=True)
    (root / "bridge-root.json").write_text('{"role": "ame-bridge-root"}\n', encoding="utf-8")
    return root


def test_preset_uses_landscape_when_the_frame_is_wide():
    assert preset_for_asset(_asset()) == "social-standard-9x16"
    assert preset_for_asset(_asset(width=1920, height=1080)) == "landscape-standard-16x9"
    assert preset_for_asset(_asset(width=0, height=0)) == "social-standard-9x16"


def test_missing_marker_does_not_write_a_source(tmp_path: Path):
    called = False

    def fetch(_key, _dest):
        nonlocal called
        called = True

    with pytest.raises(AmeNotReady):
        encode_downloaded_master(root=tmp_path, asset=_asset(), fetch=fetch, monotonic=lambda: 0)
    assert called is False


def test_encode_returns_output_after_the_inbox_copy_is_removed(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "social-standard-9x16"
    out = root / "out" / "social-standard-9x16"
    clock = {"t": 0.0}

    def fetch(_key, dest: Path):
        dest.write_bytes(b"source-master")

    def sleep(_seconds: float):
        source = next(inbox.glob("*.mov"))
        (out / f"{source.stem}.mp4").write_bytes(b"x" * 40000)
        source.unlink()

    content = encode_downloaded_master(
        root=root,
        asset=_asset(),
        fetch=fetch,
        sleep=sleep,
        monotonic=lambda: clock["t"],
        now=lambda: 100,
        pickup_seconds=90,
        timeout_seconds=1200,
    )
    assert content == b"x" * 40000
    assert list(inbox.iterdir()) == []
    assert list(out.iterdir()) == []


def test_encode_removes_the_copy_media_encoder_parks_under_source(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "social-standard-9x16"
    out = root / "out" / "social-standard-9x16"
    parked = inbox / "Source" / "2026-10-10_23-07-28"

    def fetch(_key, dest: Path):
        dest.write_bytes(b"source-master")

    def sleep(_seconds: float):
        source = next(inbox.glob("*.mov"))
        parked.mkdir(parents=True)
        source.replace(parked / source.name)
        (out / f"{source.stem}.mp4").write_bytes(b"x" * 40000)

    content = encode_downloaded_master(
        root=root,
        asset=_asset(),
        fetch=fetch,
        sleep=sleep,
        monotonic=lambda: 0,
        now=lambda: 100,
    )
    assert content == b"x" * 40000
    assert not parked.exists()
    assert list(out.iterdir()) == []


def test_pickup_timeout_removes_the_inbox_copy(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "social-standard-9x16"
    clock = {"t": 0.0}

    def fetch(_key, dest: Path):
        dest.write_bytes(b"source-master")

    def sleep(_seconds: float):
        clock["t"] = 90

    with pytest.raises(AmeNotReady, match="did not pick up"):
        encode_downloaded_master(
            root=root,
            asset=_asset(),
            fetch=fetch,
            sleep=sleep,
            monotonic=lambda: clock["t"],
            now=lambda: 100,
            pickup_seconds=90,
            timeout_seconds=1200,
        )
    assert list(inbox.iterdir()) == []


def test_growing_output_does_not_fall_back_or_delete_the_source(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "social-standard-9x16"
    out = root / "out" / "social-standard-9x16"
    clock = {"t": 0.0}

    def fetch(_key, dest: Path):
        dest.write_bytes(b"source-master")

    def sleep(seconds: float):
        clock["t"] += seconds
        source = next(inbox.glob("*.mov"))
        (out / f"{source.stem}.mp4").write_bytes(b"y" * 1000)

    with pytest.raises(RuntimeError, match="did not finish"):
        encode_downloaded_master(
            root=root,
            asset=_asset(),
            fetch=fetch,
            sleep=sleep,
            monotonic=lambda: clock["t"],
            now=lambda: 100,
            pickup_seconds=90,
            timeout_seconds=10,
            poll_seconds=5,
            min_output_bytes=32768,
        )
    assert len(list(inbox.glob("*.mov"))) == 1
    assert len(list(out.glob("*.mp4"))) == 1


def test_landscape_upload_uses_the_landscape_inbox(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "landscape-standard-16x9"
    out = root / "out" / "landscape-standard-16x9"

    def fetch(_key, dest: Path):
        dest.write_bytes(b"wide-master")

    def sleep(_seconds: float):
        source = next(inbox.glob("*.mp4"))
        (out / f"{source.stem}.mp4").write_bytes(b"z" * 40000)
        source.unlink()

    content = encode_downloaded_master(
        root=root,
        asset=_asset(name="wide.mp4", width=1920, height=1080),
        fetch=fetch,
        sleep=sleep,
        monotonic=lambda: 0,
        now=lambda: 100,
    )
    assert content.startswith(b"z")
    assert list((root / "inbox" / "social-standard-9x16").iterdir()) == []


def test_bridge_is_ready_requires_this_service():
    class Response:
        status_code = 200

        def json(self):
            return {"ok": True, "service": "other", "delete_watch_source": True}

    assert bridge_is_ready(get=lambda *_args, **_kwargs: Response()) is False

    class Ready(Response):
        def json(self):
            return {
                "ok": True,
                "service": "chicagoshining-ame-bridge",
                "delete_watch_source": True,
            }

    assert bridge_is_ready(get=lambda *_args, **_kwargs: Ready()) is True


def test_live_encoder_skips_when_the_bridge_is_down(monkeypatch):
    monkeypatch.setattr("studio_compress.ame_encoder.bridge_is_ready", lambda: False)
    assert live_encoder() is None


def test_ame_default_output_folder_is_accepted(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "social-standard-9x16"
    output = inbox / "Output"
    output.mkdir()

    def fetch(_key, dest: Path):
        dest.write_bytes(b"source-master")

    def sleep(_seconds: float):
        source = next(path for path in inbox.iterdir() if path.suffix == ".mov")
        (output / f"{source.stem}_1.mp4").write_bytes(b"w" * 40000)
        source.unlink()

    content = encode_downloaded_master(
        root=root,
        asset=_asset(),
        fetch=fetch,
        sleep=sleep,
        monotonic=lambda: 0,
        now=lambda: 50,
    )
    assert len(content) == 40000
    assert list(output.iterdir()) == []


def test_download_is_staged_outside_the_watch_folder(tmp_path: Path):
    root = _root(tmp_path)
    inbox = root / "inbox" / "social-standard-9x16"
    seen: dict[str, Path] = {}

    def fetch(_key, dest: Path):
        seen["dest"] = dest
        dest.write_bytes(b"source-master")

    def sleep(_seconds: float):
        source = next(inbox.glob("*.mov"))
        (root / "out" / "social-standard-9x16" / f"{source.stem}.mp4").write_bytes(b"x" * 40000)
        source.unlink()

    encode_downloaded_master(
        root=root,
        asset=_asset(),
        fetch=fetch,
        sleep=sleep,
        monotonic=lambda: 0,
        now=lambda: 100,
    )
    assert "inbox" not in seen["dest"].parts
    assert seen["dest"].parent.name == "staging"
    assert not seen["dest"].exists()


def test_reuses_an_encode_media_encoder_already_finished(tmp_path: Path):
    root = _root(tmp_path)
    out = root / "out" / "social-standard-9x16"
    parked = root / "inbox" / "social-standard-9x16" / "Source" / "2026-10-11_00-42-47"
    parked.mkdir(parents=True)
    (out / "vid1-55.mp4").write_bytes(b"x" * 40000)
    (parked / "vid1-55.mp4").write_bytes(b"source-master")

    def fetch(_key, _dest):
        raise AssertionError("the finished encode should be reused")

    content = encode_downloaded_master(
        root=root,
        asset=_asset(name="clip.mp4"),
        fetch=fetch,
        sleep=lambda _seconds: None,
        monotonic=lambda: 0,
        now=lambda: 100,
    )
    assert content == b"x" * 40000
    assert not (out / "vid1-55.mp4").exists()
    assert not parked.exists()
