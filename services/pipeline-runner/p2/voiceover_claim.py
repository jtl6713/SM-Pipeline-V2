"""One ElevenLabs read per script. Later passes reuse the file they already paid for."""

from __future__ import annotations

import hashlib
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

LEASE_PREFIX = "tts-lease:"
LEASE_TTL = timedelta(minutes=20)
_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def content_tts_lock(content_item_id: str) -> threading.Lock:
    key = str(content_item_id or "").strip() or "unknown"
    with _LOCKS_GUARD:
        lock = _LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _LOCKS[key] = lock
        return lock


def script_fingerprint(voice_id: str, text: str) -> str:
    body = f"{str(voice_id or '').strip()}\n{' '.join(str(text or '').split())}"
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]


def lease_text(fingerprint: str, *, now: datetime | None = None, claim: str | None = None) -> str:
    """tts-lease:{epoch_ms}:{claim}:{fingerprint}. The claim makes two racers distinguishable."""
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    epoch_ms = int(moment.timestamp() * 1000)
    token = str(claim or uuid.uuid4().hex[:12]).strip() or uuid.uuid4().hex[:12]
    return f"{LEASE_PREFIX}{epoch_ms}:{token}:{fingerprint}"


def _lease_parts(details: str) -> tuple[int, str, str] | None:
    raw = str(details or "").strip()
    if not raw.startswith(LEASE_PREFIX):
        return None
    rest = raw[len(LEASE_PREFIX):]
    epoch_text, sep, tail = rest.partition(":")
    claim, sep2, token = tail.partition(":")
    if not sep or not sep2 or not claim or not token or not epoch_text.isdigit():
        return None
    return int(epoch_text), claim, token


def lease_is_fresh(details: str, fingerprint: str, *, now: datetime | None = None) -> bool:
    """True when this exact script is already being spoken and the lease has not expired."""
    parts = _lease_parts(details)
    if not parts:
        return False
    epoch_ms, _claim, token = parts
    if token != fingerprint:
        return False
    started = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment - started <= LEASE_TTL


def drive_voiceover_url(file_meta: dict[str, Any] | None, file_id: str) -> str:
    meta = file_meta or {}
    link = str(meta.get("webContentLink") or meta.get("webViewLink") or "").strip()
    if link:
        return link
    cleaned = str(file_id or "").strip()
    if not cleaned:
        return ""
    return f"https://drive.google.com/uc?id={cleaned}&export=download"
