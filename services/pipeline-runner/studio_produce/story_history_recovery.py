"""Exact incident recovery evidence from protected provider history run 45622335027."""
from __future__ import annotations

import hashlib
import re

import requests

from config import load_settings

# Parent, original fingerprint, provider creation second, original raw checksum,
# and exact held sibling identities. No fuzzy or nearest-date selection.
HISTORY_RECOVERY = {
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
