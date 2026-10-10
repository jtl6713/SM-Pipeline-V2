"""Watch Adobe Media Encoder output folders and remove the inbox source copy.

The file in ``inbox/<preset>/`` is a working copy. The library original stays
wherever it already lives (Drive, the camera card, or another folder). This
module deletes only a direct file inside a preset inbox, and only after the
matching output has stopped changing and passed validation.

An output that was already sitting in the folder before this copy arrived does
not count. A normal copy stamps a fresh modified time, so an older output is
ignored. A copy that keeps an ancient modified time is deleted only when the
output appears, or changes, after the bridge first sees that source.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from ame_bridge.presets import OUTPUT_EXTENSIONS, PRESETS, SKIP_SUFFIXES, SOURCE_EXTENSIONS, Preset

MARKER_NAME = "bridge-root.json"
MARKER_ROLE = "ame-bridge-root"
FRESH_MTIME_WINDOW_SECONDS = 120
MTIME_SKEW_SECONDS = 2
_DUPLICATE_SUFFIX = re.compile(r"^(?P<base>.+)_(?P<index>\d+)$")


@dataclass(frozen=True)
class BridgeConfig:
    root: Path
    stability_seconds: float = 15
    poll_seconds: float = 5
    min_output_bytes: int = 32 * 1024
    delete_watch_source: bool = True
    use_ffprobe: bool = True
    port: int = 3342
    host: str = "127.0.0.1"

    @classmethod
    def from_dict(cls, payload: dict) -> "BridgeConfig":
        root = Path(str(payload.get("root") or "")).expanduser()
        if not str(root):
            raise ValueError("root is required")
        return cls(
            root=root,
            stability_seconds=_positive_float(payload.get("stability_seconds"), 15),
            poll_seconds=_positive_float(payload.get("poll_seconds"), 5),
            min_output_bytes=_positive_int(payload.get("min_output_bytes"), 32 * 1024),
            delete_watch_source=bool(payload.get("delete_watch_source", True)),
            use_ffprobe=bool(payload.get("use_ffprobe", True)),
            port=_positive_int(payload.get("port"), 3342),
            host=str(payload.get("host") or "127.0.0.1"),
        )


def load_config(path: Path) -> BridgeConfig:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("config must be a JSON object")
    return BridgeConfig.from_dict(payload)


def ensure_layout(root: Path) -> Path:
    """Create the dedicated inbox, output, and state folders."""
    if not root_is_dedicated(root):
        raise ValueError(f"refusing to create a bridge root at {root}")
    root.mkdir(parents=True, exist_ok=True)
    marker = root / MARKER_NAME
    if not marker.exists():
        marker.write_text(
            json.dumps({"role": MARKER_ROLE, "version": 1}, indent=2) + "\n",
            encoding="utf-8",
        )
    for preset in PRESETS:
        (root / "inbox" / preset.id).mkdir(parents=True, exist_ok=True)
        (root / "out" / preset.id).mkdir(parents=True, exist_ok=True)
    (root / "state").mkdir(parents=True, exist_ok=True)
    targets = root / "preset-targets.json"
    targets.write_text(
        json.dumps([preset.as_dict() for preset in PRESETS], indent=2) + "\n",
        encoding="utf-8",
    )
    return root


def root_is_dedicated(root: Path) -> bool:
    """Reject drive roots and folders that already hold originals."""
    try:
        resolved = root.expanduser().resolve()
    except OSError:
        return False
    if resolved.parent == resolved:
        return False
    home = Path.home().resolve()
    protected = {
        home,
        home / "Documents",
        home / "Downloads",
        home / "Desktop",
        home / "Pictures",
        home / "Videos",
    }
    return resolved not in protected


def marker_ok(root: Path) -> bool:
    path = root / MARKER_NAME
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return isinstance(payload, dict) and payload.get("role") == MARKER_ROLE


def output_directories(root: Path, preset_id: str) -> list[Path]:
    """Prefer the dedicated out folder, and also accept AME's default Output subfolder."""
    return [
        root / "out" / preset_id,
        root / "inbox" / preset_id / "Output",
    ]


def reconcile_once(
    config: BridgeConfig,
    observations: dict,
    now: float,
    probe=None,
) -> tuple[dict, dict]:
    observations = {key: dict(value) for key, value in (observations or {}).items() if isinstance(value, dict)}
    report = {
        "ok": True,
        "checked_at": now,
        "delete_watch_source": config.delete_watch_source,
        "pending": [],
        "completed": [],
        "skipped": [],
        "errors": [],
    }
    if not root_is_dedicated(config.root):
        report["ok"] = False
        report["errors"].append({"error": "root_not_dedicated"})
        return report, observations
    if not marker_ok(config.root):
        report["ok"] = False
        report["errors"].append({"error": "marker_missing"})
        return report, observations

    seen: set[str] = set()
    for preset in PRESETS:
        _reconcile_preset(config, preset, observations, seen, report, now, probe)

    for key in list(observations):
        if key not in seen:
            observations.pop(key, None)
    report["ok"] = not report["errors"]
    return report, observations


def _reconcile_preset(config, preset: Preset, observations, seen, report, now, probe) -> None:
    inbox = config.root / "inbox" / preset.id
    sources = _list_media(inbox, SOURCE_EXTENSIONS)
    outputs: list[Path] = []
    for directory in output_directories(config.root, preset.id):
        outputs.extend(_list_media(directory, OUTPUT_EXTENSIONS))

    for path in sources + outputs:
        seen.add(_key(config.root, path))
        _observe(config.root, path, observations, now)

    claims: dict[Path, list[Path]] = {}
    ambiguous_sources: set[Path] = set()
    for output in outputs:
        matched = _match_source(sources, output)
        if matched is None:
            continue
        if matched == "ambiguous":
            report["skipped"].append(
                {
                    "preset_id": preset.id,
                    "output_name": output.name,
                    "reason": "ambiguous_source",
                }
            )
            continue
        claims.setdefault(matched, []).append(output)

    claimed: set[Path] = set()
    for source, claimed_outputs in claims.items():
        if len(claimed_outputs) != 1:
            ambiguous_sources.add(source)
            report["skipped"].append(
                {
                    "preset_id": preset.id,
                    "source_name": source.name,
                    "reason": "ambiguous_output",
                    "output_names": [path.name for path in claimed_outputs],
                }
            )
            continue
        claimed.add(source)
        _consider_pair(config, preset, source, claimed_outputs[0], observations, report, now, probe)

    for source in sources:
        if source in claimed or source in ambiguous_sources:
            continue
        _capture_baseline(config, source, None, observations)
        report["pending"].append(
            {
                "preset_id": preset.id,
                "source_name": source.name,
                "reason": "waiting_for_output",
            }
        )


def _consider_pair(config, preset, source: Path, output: Path, observations, report, now, probe) -> None:
    source_key = _key(config.root, source)
    output_key = _key(config.root, output)
    source_obs = observations[source_key]
    output_obs = observations[output_key]
    source_stat = source.stat()
    output_stat = output.stat()
    identity = _identity(output)
    _capture_baseline(config, source, identity, observations)

    source_stable = _is_stable(source_obs, now, config.stability_seconds)
    output_stable = _is_stable(output_obs, now, config.stability_seconds)
    if not source_stable or not output_stable:
        report["pending"].append(
            {
                "preset_id": preset.id,
                "source_name": source.name,
                "output_name": output.name,
                "reason": "waiting_for_stable_file",
            }
        )
        return

    if output_stat.st_size < config.min_output_bytes:
        report["pending"].append(
            {
                "preset_id": preset.id,
                "source_name": source.name,
                "output_name": output.name,
                "reason": "output_too_small",
            }
        )
        return

    if not _output_belongs_to_source(source_obs, source_stat.st_mtime, output_stat.st_mtime, identity):
        report["pending"].append(
            {
                "preset_id": preset.id,
                "source_name": source.name,
                "output_name": output.name,
                "reason": "output_predates_source",
            }
        )
        return

    if (source.with_name(source.name + ".keep")).is_file():
        report["pending"].append(
            {
                "preset_id": preset.id,
                "source_name": source.name,
                "output_name": output.name,
                "reason": "keep_marker",
            }
        )
        return

    validation = "size"
    if config.use_ffprobe:
        if probe is None:
            from ame_bridge.probe import ffprobe_video

            probe = ffprobe_video
        try:
            probed = probe(output)
        except Exception:
            probed = {"ok": False, "error": "probe_failed"}
        if not isinstance(probed, dict) or not probed.get("ok"):
            report["pending"].append(
                {
                    "preset_id": preset.id,
                    "source_name": source.name,
                    "output_name": output.name,
                    "reason": str((probed or {}).get("error") or "probe_failed"),
                }
            )
            return
        validation = "ffprobe"

    completed = {
        "preset_id": preset.id,
        "source_name": source.name,
        "source_bytes": source_stat.st_size,
        "output_name": output.name,
        "output_bytes": output_stat.st_size,
        "output_rel": output_key,
        "validation": validation,
        "source_deleted": False,
    }
    if not config.delete_watch_source:
        completed["reason"] = "dry_run"
        report["completed"].append(completed)
        return

    try:
        _unlink_watch_source(source, config.root / "inbox" / preset.id)
    except OSError as exc:
        report["errors"].append(
            {
                "preset_id": preset.id,
                "source_name": source.name,
                "error": "delete_failed",
                "detail": exc.__class__.__name__,
            }
        )
        return
    completed["source_deleted"] = True
    report["completed"].append(completed)


def _capture_baseline(config, source: Path, identity, observations) -> None:
    record = observations.get(_key(config.root, source))
    if not record or record.get("baseline_set"):
        return
    record["output_baseline"] = identity
    record["baseline_set"] = True


def _output_belongs_to_source(source_obs: dict, source_mtime: float, output_mtime: float, identity: dict) -> bool:
    seen_at = float(source_obs.get("seen_at") or 0)
    fresh_copy = seen_at - float(source_mtime) <= FRESH_MTIME_WINDOW_SECONDS
    if fresh_copy:
        return output_mtime + MTIME_SKEW_SECONDS >= float(source_mtime)
    baseline = source_obs.get("output_baseline")
    if baseline is None:
        return True
    return identity != baseline


def _observe(root: Path, path: Path, observations: dict, now: float) -> dict:
    key = _key(root, path)
    stat = path.stat()
    size = int(stat.st_size)
    mtime_ns = int(stat.st_mtime_ns)
    previous = observations.get(key)
    if not previous or previous.get("size") != size or previous.get("mtime_ns") != mtime_ns:
        observations[key] = {
            "size": size,
            "mtime_ns": mtime_ns,
            "seen_at": now,
            "baseline_set": False,
        }
        return observations[key]
    return previous


def _is_stable(record: dict, now: float, stability_seconds: float) -> bool:
    return now - float(record.get("seen_at") or now) >= stability_seconds


def _match_source(sources: list[Path], output: Path):
    exact = [source for source in sources if source.stem == output.stem or source.name == output.stem]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return "ambiguous"
    duplicate = _DUPLICATE_SUFFIX.fullmatch(output.stem)
    if not duplicate:
        return None
    base = duplicate.group("base")
    suffixed = [source for source in sources if source.stem == base or source.name == base]
    if len(suffixed) == 1:
        return suffixed[0]
    if len(suffixed) > 1:
        return "ambiguous"
    return None


def _list_media(directory: Path, extensions: set[str]) -> list[Path]:
    if not directory.is_dir():
        return []
    found = []
    try:
        entries = list(directory.iterdir())
    except OSError:
        return []
    root = directory.resolve()
    for entry in entries:
        try:
            if entry.is_symlink() or not entry.is_file():
                continue
            name = entry.name
            if name.startswith(".") or name.startswith("~$"):
                continue
            lowered = name.lower()
            if lowered.endswith(SKIP_SUFFIXES):
                continue
            if entry.suffix.lower() not in extensions:
                continue
            resolved = entry.resolve()
            if resolved.parent != root:
                continue
        except OSError:
            continue
        found.append(entry)
    return sorted(found, key=lambda path: path.name.lower())


def _unlink_watch_source(source: Path, inbox: Path) -> None:
    resolved = source.resolve()
    if resolved.parent != inbox.resolve():
        raise OSError("refusing_delete_outside_inbox")
    if resolved.is_symlink() or not resolved.is_file():
        raise OSError("refusing_delete_non_file")
    resolved.unlink()


def _identity(path: Path) -> dict:
    stat = path.stat()
    return {"name": path.name, "size": int(stat.st_size), "mtime_ns": int(stat.st_mtime_ns)}


def _key(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def append_ledger(path: Path, completed: list[dict], now: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for item in completed:
        if not item.get("source_deleted"):
            continue
        row = dict(item)
        row["completed_at"] = now
        lines.append(json.dumps(row, sort_keys=True))
    if not lines:
        return
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def read_ledger(path: Path, limit: int = 20) -> list[dict]:
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    return rows[-limit:]


def _positive_float(value, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(default)
    if number < 0:
        return float(default)
    return number


def _positive_int(value, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return int(default)
    if number <= 0:
        return int(default)
    return number
