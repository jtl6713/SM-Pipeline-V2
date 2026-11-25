"""Read-only attribution of known audio sources in one finished encoded MP4.

This is a signal-presence test, not a subjective listening or visual review.
It never alters media, queue, provider or approval state.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

RATE = 8000
WINDOW = 4 * RATE
MAX_LAG = RATE // 4


def pcm(path):
    result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path),
                             "-map", "0:a:0", "-ac", "1", "-ar", str(RATE),
                             "-f", "f32le", "-"], capture_output=True, check=True, timeout=90)
    return np.frombuffer(result.stdout, dtype="<f4").astype(np.float64)


def align(mix, stem):
    if len(stem) < RATE or len(mix) < RATE:
        raise ValueError("source too short")
    y = mix - np.mean(mix)
    x = stem - np.mean(stem)
    n = 1 << (len(x) + len(y) - 1).bit_length()
    corr = np.fft.irfft(np.fft.rfft(y, n) * np.conj(np.fft.rfft(x, n)), n)
    candidates = np.arange(-MAX_LAG, MAX_LAG + 1)
    lag = int(candidates[np.argmax(corr[candidates % n])])
    aligned = np.zeros(len(mix))
    dst = max(lag, 0)
    src = max(-lag, 0)
    count = min(len(mix) - dst, len(stem) - src)
    if count > 0:
        aligned[dst:dst + count] = stem[src:src + count]
    return aligned, lag


def partial_corr(y, x, other):
    y, x, other = [a - np.mean(a) for a in (y, x, other)]
    energy = np.dot(other, other)
    if energy > 1e-12:
        y = y - other * (np.dot(y, other) / energy)
        x = x - other * (np.dot(x, other) / energy)
    norm = np.linalg.norm(y) * np.linalg.norm(x)
    if norm < 1e-12:
        return 0.0, 0.0, 0.0
    coeff = float(np.dot(y, x) / np.dot(x, x))
    corr = float(np.dot(y, x) / norm)
    contribution = abs(coeff) * float(np.sqrt(np.mean(x * x)))
    return corr, coeff, contribution


def attribution(mix, voice, music):
    v, vlag = align(mix, voice)
    m, mlag = align(mix, music)
    evidence = {"voiceover": [], "music": []}
    for start in range(0, len(mix) - WINDOW + 1, WINDOW):
        y, a, b = [x[start:start + WINDOW] for x in (mix, v, m)]
        for name, stem, other in (("voiceover", a, b), ("music", b, a)):
            if np.std(stem) < 0.001:
                continue
            corr, coeff, rms = partial_corr(y, stem, other)
            if corr >= 0.25 and coeff >= 0.025 and rms >= 0.002:
                evidence[name].append({"start_seconds": start / RATE, "partial_correlation": round(corr, 4),
                                       "positive_gain": round(coeff, 4), "contribution_rms": round(rms, 5)})
    result = {name: {"matched_windows": len(windows), "windows": windows} for name, windows in evidence.items()}
    result["voiceover"]["lag_seconds"] = vlag / RATE
    result["music"]["lag_seconds"] = mlag / RATE
    result["both_sources_present"] = all(len(windows) >= 3 for windows in evidence.values())
    return result


def synthetic():
    rng = np.random.default_rng(2970)
    voice = rng.normal(0, 0.12, RATE * 16)
    music = rng.normal(0, 0.07, RATE * 16)
    # Small relative codec-like alignment offset and different mix gains.
    delayed = np.pad(music, (123, 0))[:len(voice)]
    noise = rng.normal(0, 0.003, len(voice))
    assert attribution(voice * 0.8 + delayed * 0.15 + noise, voice, music)["both_sources_present"]
    assert not attribution(voice * 0.8 + noise, voice, music)["both_sources_present"]
    assert not attribution(delayed * 0.15 + noise, voice, music)["both_sources_present"]
    assert not attribution(noise, voice, music)["both_sources_present"]
    print("ISSUE2970_SYNTHETIC_STEM_ATTRIBUTION=PASS")


def file_sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    if sys.argv[1:] == ["--synthetic"]:
        synthetic()
        return
    if len(sys.argv) != 4:
        raise SystemExit("expected exact final MP4, voice MP3, music MP3")
    final, voice, music = map(Path, sys.argv[1:])
    expected = ("761751c2be3bc3db59383903d09d6cd3b746ae8857b1ab3f4216c7978f2c3481",
                "7ded24a0c2fc51cb470c28108a6aeb3ddffb9a07c17d054cefd52639791de550",
                "7e8a6b73c96d617a08ed57dd7c4b33fbc8661b3f0290f59c7e0ccb06510d8f14")
    if tuple(map(file_sha, (final, voice, music))) != expected:
        raise SystemExit("exact input or encoded media checksum mismatch")
    meta = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams",
                                               "-of", "json", str(final)], timeout=30))
    video = [s for s in meta["streams"] if s.get("codec_type") == "video"]
    audio = [s for s in meta["streams"] if s.get("codec_type") == "audio"]
    if (len(video) != 1 or len(audio) != 1 or video[0]["width"] != 1080 or video[0]["height"] != 1920
            or int(video[0]["nb_frames"]) != 1260 or abs(float(video[0]["duration"]) - 42) > 0.04):
        raise SystemExit("encoded canary geometry or duration changed")
    result = attribution(pcm(final), pcm(voice), pcm(music))
    result.update({"output_number": 11166, "job_id": "job-20261125005008-e9ce74b8",
                   "final_sha256": expected[0], "source_bytes_verified": True,
                   "frames": 1260, "duration_seconds": 42, "read_only": True,
                   "subjective_listening_verified": False})
    print("ISSUE2970_ENCODED_STEM_ATTRIBUTION=" + json.dumps(result, separators=(",", ":")))
    if not result["both_sources_present"]:
        raise SystemExit("individual source signal presence not proven")


if __name__ == "__main__":
    main()
