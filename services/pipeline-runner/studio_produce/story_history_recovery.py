"""Exact incident recovery evidence from protected provider history run 45622335027."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
import re
import subprocess
import tempfile

import requests

from config import load_settings

# Parent, original fingerprint, provider creation second, original raw checksum,
# and exact held sibling identities. No fuzzy or nearest-date selection.
HISTORY_RECOVERY = {
    # Exact unique provider entry within the independently observed no-receipt
    # to failed-receipt window (18:43–19:58 UTC), proof run 45690917326.
    "recnsuB2LUYKwygWI": {
        "fingerprint": "74db136af97d9f28c27cc8f95fc8248d316546b35bd54b0649c295eb5446c293",
        "created_at": 1795633269,
        "sha256": "58f4f2d485d0131a77f8beadcaebe1749a0c0dd3a7bbd844fdfe3229d22f76f7",
        "outputs": {"recuqi61cNXruBSlf", "recfaTw6FikZZzNg5"},
        "held": False,
    },
    "reccVyNLdmJJeI8hG": {
        "fingerprint": "b55b795ffb32c1bf079705ddf7ad1248762847b0c5600b76c88df8e7401f6260",
        "created_at": 1795576594,
        "sha256": "9977a3100b5ede15666c69ea061aafb25054221e9ceb6a345d319a5c0d23bd05",
        "outputs": {"recjqFCCxBroLyoQJ", "recjhiYhg1ECvZUHo"},
    },
    "recG0b34XYwYWggTp": {
        "fingerprint": "69e65eb8a0e00385ba952c8bfee7926fa8b6c6bc3562c2a3909e07718df71147",
        "created_at": 1795590254,
        "sha256": "7776de868a7f8d7f0ee6cbb844275e7e5d7f54409ddd2048d6ea7f9f461a42aa",
        "outputs": {"rec72bKqmIjLMs1gI", "recRI9JfNjjhLLo2m"},
    },
    # Unique original identity and decoded duration from protected run
    # 46174627928/job141070490983; exact companion identities from inventory
    # 46161305343/job141037273982. No admission or stale-schedule override.
    "recAdiURMeoS8VJnJ": {
        "fingerprint": "9362a08d77676c85b03fb4d40e2c0f5ae68b8e465216dc57d7384f5a0551e9f3",
        "created_at": 1795662013,
        "sha256": "9da1b64b3f60f958dd7d286a7551ba7be72601d4bcf9483b95712df980a832ef",
        "outputs": {"recDH1TiBHlR3kJ85", "recqs15ffqAvC0bU7"},
        "held": True,
        "cached_only_required": True,
    },
    "rec2XJdAZlS3N8hbE": {
        "fingerprint": "c611f5ecef231d8bc4825ddb194e121fbf968bb189b18e692763da4ef17ad388",
        "created_at": 1795651287,
        "sha256": "82024d3371b0e0714721ee9c11720a9c308622f8d81a7dbf28484d2f6339b569",
        "outputs": {"recSxK5fHXrgZrRJd", "rec8OqXuGHJaodnMz"},
        "held": False,
        "cached_only_required": True,
    },
    "rec8vqR7UnviPMoH7": {
        "fingerprint": "aab9bf8503392847c34bc90bdc5c61b1d39e764fd6bf55e364026b8aa331089a",
        "created_at": 1795672407,
        "sha256": "0151636fb93bcd6e04f1914df25a5615d83c8ecf587201bce36992b40fa7f988",
        "outputs": {"recGWbCjBIVt7B7nG", "recLsIWmTB2oKGlNA"},
        "held": False,
        "cached_only_required": True,
    },
}
MAX_BYTES = 8 * 1024 * 1024


def download_audited_history(evidence, text, voice_id):
    """Only GET, exact timestamp/text/voice/model and independent byte checksum."""
    api_key = str(load_settings().get("elevenlabs_api_key") or "").strip().strip('"').strip("'")
    if not api_key:
        raise RuntimeError("Story history credential unavailable")
    headers = {"xi-api-key": api_key, "Accept": "application/json"}
    ts = evidence["created_at"]
    response = requests.get("https://api.elevenlabs.io/v1/history", headers=headers,
        params={"voice_id": voice_id, "model_id": "eleven_multilingual_v2", "source": "TTS",
                "search": text, "date_after_unix": ts, "date_before_unix": ts+1, "page_size": 20},
        timeout=(5,20), allow_redirects=False)
    if response.status_code != 200:
        raise RuntimeError("Story history lookup unavailable")
    page = response.json()
    if page.get("has_more") is not False:
        raise RuntimeError("Story history lookup incomplete")
    matches = [row for row in page.get("history",[]) if
               row.get("text")==text and row.get("voice_id")==voice_id
               and row.get("model_id")=="eleven_multilingual_v2" and row.get("source")=="TTS"
               and row.get("date_unix")==ts]
    if len(matches)!=1:
        raise RuntimeError("Story history match no longer unique")
    item = matches[0].get("history_item_id","")
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,128}", item):
        raise RuntimeError("Story history identity invalid")
    with requests.get("https://api.elevenlabs.io/v1/history/"+item+"/audio",
                      headers={**headers,"Accept":"audio/mpeg"},
                      stream=True,timeout=(5,30),allow_redirects=False) as response:
        if response.status_code!=200:
            raise RuntimeError("Story history audio unavailable")
        raw=bytearray()
        for chunk in response.iter_content(chunk_size=65536):
            raw.extend(chunk)
            if len(raw)>MAX_BYTES:
                raise RuntimeError("Story history audio exceeds bound")
    if len(raw)<32 or hashlib.sha256(raw).hexdigest()!=evidence["sha256"]:
        raise RuntimeError("Story history original checksum changed")
    return bytes(raw)


# Protected original-media proof 46166270330: both original recordings are
# checksum verified but below the existing 2-second Story duration contract.
# Only independently audited byte identities in this exact set may be corrected.
# Three additional originals were decoded in run 46174627928. The 1.207s
# original for 11268 and both ambiguous pairs are deliberately excluded.
_SHORT_AUDITED_ORIGINALS = {
    "9977a3100b5ede15666c69ea061aafb25054221e9ceb6a345d319a5c0d23bd05",
    "7776de868a7f8d7f0ee6cbb844275e7e5d7f54409ddd2048d6ea7f9f461a42aa",
    "9da1b64b3f60f958dd7d286a7551ba7be72601d4bcf9483b95712df980a832ef",
    "82024d3371b0e0714721ee9c11720a9c308622f8d81a7dbf28484d2f6339b569",
    "0151636fb93bcd6e04f1914df25a5615d83c8ecf587201bce36992b40fa7f988",
}


def fit_short_audited_history(raw, evidence):
    """Preserve the original spoken words and pitch, never pad with silence.

    Run before standard loudness normalization; the unchanged final duration
    and audibility guard must still pass. Reject a corrupt or excessively
    short original rather than relaxing the Story media contract.
    """
    if evidence.get("sha256") not in _SHORT_AUDITED_ORIGINALS:
        return raw
    if hashlib.sha256(raw).hexdigest() != evidence["sha256"] or not 32 <= len(raw) <= MAX_BYTES:
        raise RuntimeError("Audited short Story original checksum mismatch")
    from audio.leading_silence import ffmpeg_bin
    from audio.voiceover_duration import probe_audio_duration_bytes
    from audio.speech_activity import probe_max_volume_db

    duration = probe_audio_duration_bytes(raw)
    peak = probe_max_volume_db(raw)
    if not math.isfinite(duration) or duration < 1.35 or peak is None or not math.isfinite(peak) or peak < -24:
        raise RuntimeError("Audited short Story original is not safely pace-correctable")
    if duration >= 2.2:
        return raw
    tempo = duration / 2.25
    if not 0.60 <= tempo < 1.0:
        raise RuntimeError("Audited short Story tempo exceeds correction bound")
    with tempfile.TemporaryDirectory(prefix="audited-story-pace-") as tmp:
        src = Path(tmp) / "original.mp3"
        dst = Path(tmp) / "paced.mp3"
        src.write_bytes(raw)
        proc = subprocess.run(
            [ffmpeg_bin(), "-hide_banner", "-nostats", "-xerror", "-y",
             "-i", str(src), "-map", "0:a:0", "-af", f"atempo={tempo:.8f}",
             "-c:a", "libmp3lame", "-b:a", "128k", str(dst)],
            capture_output=True, timeout=30, check=False)
        if proc.returncode or not dst.is_file() or not 32 <= dst.stat().st_size <= MAX_BYTES:
            raise RuntimeError("Audited short Story pitch-preserving correction failed")
        paced = dst.read_bytes()
    measured = probe_audio_duration_bytes(paced)
    if not 2.05 <= measured <= 2.65:
        raise RuntimeError("Audited short Story paced duration outside target")
    return paced
