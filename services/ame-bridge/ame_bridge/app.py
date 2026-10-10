"""Local status server for the Adobe Media Encoder watch-folder bridge."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, request

from ame_bridge import __version__
from ame_bridge.presets import PRESETS
from ame_bridge.watch import (
    BridgeConfig,
    append_ledger,
    ensure_layout,
    read_ledger,
    reconcile_once,
)

log = logging.getLogger("ame-bridge")

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
EXAMPLE_CONFIG = PACKAGE_ROOT / "ame-bridge.example.json"
LOCAL_CONFIG = PACKAGE_ROOT / "ame-bridge.local.json"


class Bridge:
    def __init__(self, config: BridgeConfig):
        self.config = config
        self._lock = threading.Lock()
        self.observations_path = config.root / "state" / "observations.json"
        self.ledger_path = config.root / "state" / "completions.jsonl"
        self.last_report: dict | None = None

    def reconcile(self, now: float | None = None, probe=None, *, delete_watch_source: bool | None = None) -> dict:
        with self._lock:
            checked_at = time.time() if now is None else now
            config = self.config
            if delete_watch_source is not None and delete_watch_source != config.delete_watch_source:
                config = _dry_config(config) if not delete_watch_source else config
            observations = _read_json(self.observations_path)
            report, observations = reconcile_once(
                config,
                observations,
                checked_at,
                probe=probe,
            )
            _write_json(self.observations_path, observations)
            append_ledger(self.ledger_path, report.get("completed") or [], checked_at)
            self.last_report = report
            return report

    def status(self) -> dict:
        with self._lock:
            return {
                "ok": True,
                "last_report": self.last_report,
                "recent_completions": read_ledger(self.ledger_path),
            }


def create_app(bridge: Bridge) -> Flask:
    app = Flask(__name__)

    @app.get("/health")
    def health():
        return jsonify(
            {
                "ok": True,
                "service": "chicagoshining-ame-bridge",
                "version": __version__,
                "root": str(bridge.config.root),
                "delete_watch_source": bridge.config.delete_watch_source,
                "stability_seconds": bridge.config.stability_seconds,
                "poll_seconds": bridge.config.poll_seconds,
                "use_ffprobe": bridge.config.use_ffprobe,
                "ffprobe": _ffprobe_present(),
                "presets": [preset.id for preset in PRESETS],
                "port": bridge.config.port,
            }
        )

    @app.get("/status")
    def status():
        return jsonify(bridge.status())

    @app.post("/reconcile")
    def reconcile():
        payload = request.get_json(silent=True) or {}
        dry_run = bool(payload.get("dry_run"))
        report = bridge.reconcile(delete_watch_source=False if dry_run else None)
        return jsonify(report)

    return app


def resolve_config_path() -> Path:
    override = os.environ.get("AME_BRIDGE_CONFIG", "").strip()
    if override:
        return Path(override).expanduser()
    if LOCAL_CONFIG.is_file():
        return LOCAL_CONFIG
    return EXAMPLE_CONFIG


def start_poller(bridge: Bridge, stop: threading.Event | None = None) -> threading.Thread:
    def loop():
        while stop is None or not stop.is_set():
            try:
                report = bridge.reconcile()
                deleted = [row["source_name"] for row in report.get("completed") or [] if row.get("source_deleted")]
                if deleted:
                    log.info("removed watch-folder source copies: %s", ", ".join(deleted))
                for error in report.get("errors") or []:
                    log.warning("reconcile error: %s", error.get("error"))
            except Exception:
                log.exception("reconcile failed")
            if stop is None:
                time.sleep(bridge.config.poll_seconds)
                continue
            if stop.wait(bridge.config.poll_seconds):
                return

    thread = threading.Thread(target=loop, name="ame-bridge-poll", daemon=True)
    thread.start()
    return thread


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    payload = json.loads(resolve_config_path().read_text(encoding="utf-8-sig"))
    port = os.environ.get("PORT", "").strip()
    if port:
        payload["port"] = int(port)
    config = BridgeConfig.from_dict(payload)
    ensure_layout(config.root)
    lock = InstanceLock(config.root / "state" / "bridge.lock")
    if not lock.acquire():
        raise SystemExit("AME bridge is already running")
    bridge = Bridge(config)
    start_poller(bridge)
    log.info("watching %s (delete watch source=%s)", config.root, config.delete_watch_source)
    try:
        create_app(bridge).run(host=config.host, port=config.port, threaded=True, use_reloader=False)
    finally:
        lock.release()


class InstanceLock:
    def __init__(self, path: Path):
        self.path = path

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            pid = _read_pid(self.path)
            if pid and _pid_alive(pid):
                return False
            try:
                self.path.unlink()
            except OSError:
                return False
        try:
            fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            return False
        os.write(fd, str(os.getpid()).encode("ascii"))
        os.close(fd)
        return True

    def release(self) -> None:
        if _read_pid(self.path) != os.getpid():
            return
        try:
            self.path.unlink()
        except OSError:
            return


def _dry_config(config: BridgeConfig) -> BridgeConfig:
    return BridgeConfig(
        root=config.root,
        stability_seconds=config.stability_seconds,
        poll_seconds=config.poll_seconds,
        min_output_bytes=config.min_output_bytes,
        delete_watch_source=False,
        use_ffprobe=config.use_ffprobe,
        port=config.port,
        host=config.host,
    )


def _ffprobe_present() -> bool:
    from shutil import which

    return which("ffprobe") is not None


def _read_json(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def _read_pid(path: Path) -> int:
    try:
        return int(path.read_text(encoding="ascii").strip() or "0")
    except (OSError, ValueError):
        return 0


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name != "nt":
        try:
            os.kill(pid, 0)
        except OSError:
            return False
        return True
    import ctypes

    handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    ctypes.windll.kernel32.CloseHandle(handle)
    return True
