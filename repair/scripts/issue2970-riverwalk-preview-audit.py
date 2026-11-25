"""Read-only exact revision audit of all six Riverwalk delivered preview files."""
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("stem_proof", Path(__file__).with_name("issue2970-encoded-stem-proof.py"))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)

BASE = "https://media.chicagoshining.com/studio/previews/"
FULL_SHA = "761751c2be3bc3db59383903d09d6cd3b746ae8857b1ab3f4216c7978f2c3481"
STORY_SHA = "837ccb1e0319c76fd01f744092f43beeef5d205a990f73e62f39425e439d973f"
OUTPUTS = {
    11166: ("rec9uodYpY4L6BvyQ/jobs/job-20261125005008-e9ce74b8.mp4", FULL_SHA, 1260),
    11167: ("recCYflzPH65HdbpS/jobs/job-20261125005603-37f5fcb6.mp4", FULL_SHA, 1260),
    11168: ("recyEgGuGKIrJw8Ca/jobs/job-20261125005836-8b0dd828.mp4", FULL_SHA, 1260),
    11169: ("recwGZF0JxVyTS2eF/jobs/job-20261125010022-06f8d10e.mp4", FULL_SHA, 1260),
    11170: ("recckY9KlAJkWtXxO/jobs/job-20261125010030-0f3ce786.mp4", STORY_SHA, 300),
    11171: ("recl9v0xTGSwGgt8u/jobs/job-20261125010515-e09eb92c.mp4", STORY_SHA, 300),
}
STEMS = {
    "full": ("repairs/issue2970/2306/full-narration-7ded24a0c2fc51cb470c2810.mp3",
             "7ded24a0c2fc51cb470c28108a6aeb3ddffb9a07c17d054cefd52639791de550"),
    "story": ("repairs/issue2970/2306/story-narration-2e3dce32699b08d458de1cd2.mp3",
              "2e3dce32699b08d458de1cd2449cbbc0a72230fd9a2f03bb62b74429ae1c4f7b"),
    "music": ("repairs/issue2970/2306/owned-music-7e8a6b73c96d617a08ed57dd.mp3",
              "7e8a6b73c96d617a08ed57dd7c4b33fbc8661b3f0290f59c7e0ccb06510d8f14"),
}


def download(path, relative, expected, maximum):
    subprocess.run(["curl", "--fail", "--silent", "--show-error", "--proto", "=https",
                    "--connect-timeout", "10", "--max-time", "60", "--max-filesize", str(maximum),
                    BASE + relative, "--output", str(path)], check=True, timeout=65)
    if not 0 < path.stat().st_size <= maximum or proof.file_sha(path) != expected:
        raise ValueError("delivered artifact checksum/size mismatch: " + path.name)


def assess(mix, voice, music, story):
    old = proof.WINDOW
    try:
        proof.WINDOW = (2 if story else 4) * proof.RATE
        result = proof.attribution(mix, voice, music)
    finally:
        proof.WINDOW = old
    required = 2 if story else 3
    result["required_windows_per_stem"] = required
    result["both_sources_present"] = all(result[k]["matched_windows"] >= required for k in ("voiceover", "music"))
    return result


def synthetic():
    proof.synthetic()
    rng = np.random.default_rng(2971)
    r = proof.RATE
    voice = rng.normal(0, .12, int(5.248*r))
    padded = np.pad(voice, (0, 10*r-len(voice)))
    music = rng.normal(0, .07, 42*r)
    bg = music[:10*r]
    noise = rng.normal(0, .001, 10*r)
    assert assess(.8*padded+.2*bg+noise, voice, music, True)["both_sources_present"]
    assert not assess(.8*padded+noise, voice, music, True)["both_sources_present"]
    assert not assess(.2*bg+noise, voice, music, True)["both_sources_present"]
    assert not assess(noise, voice, music, True)["both_sources_present"]
    print("ISSUE2970_SHORT_STEM_NEGATIVE_CONTROLS=PASS")


def verify_video(path, frames):
    meta = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams",
                                               "-of", "json", str(path)], timeout=30))
    video = [s for s in meta["streams"] if s["codec_type"] == "video"]
    audio = [s for s in meta["streams"] if s["codec_type"] == "audio"]
    if (len(video) != 1 or len(audio) != 1 or video[0]["width"] != 1080
        or video[0]["height"] != 1920 or int(video[0]["nb_frames"]) != frames
        or abs(float(video[0]["duration"]) - frames/30) > .04):
        raise ValueError("encoded stream contract mismatch")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path),
                    "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
                   check=True, timeout=120)


def main():
    synthetic()
    if sys.argv[1:] == ["--synthetic"]:
        return
    if sys.argv[1:]:
        raise SystemExit("unexpected arguments")
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        audio = {}
        for name, (url, sha) in STEMS.items():
            path = folder / (name + ".mp3")
            download(path, url, sha, 3_000_000)
            audio[name] = proof.pcm(path)
        verified = {}
        failures = []
        for number, (url, sha, frames) in OUTPUTS.items():
            path = folder / (str(number) + ".mp4")
            try:
                # Exact canonical R5 receipt byte counts, not a duration-based guess.
                expected_size = 29_703_300 if frames == 300 else 18_478_500
                download(path, url, sha, expected_size)
                if path.stat().st_size != expected_size:
                    raise ValueError("delivered artifact size differs from receipt")
                if sha not in verified:
                    verify_video(path, frames)
                    result = assess(proof.pcm(path), audio["story" if frames == 300 else "full"], audio["music"], frames == 300)
                    if not result["both_sources_present"]:
                        raise ValueError("two-source signal attribution failed: " + json.dumps(result))
                    verified[sha] = result
                result = verified[sha]
                print("ISSUE2970_DELIVERED_PREVIEW=" + json.dumps({
                    "output": number, "sha256": sha, "frames": frames, "duration_seconds": frames/30,
                    "decoded_av": True, "both_sources_present": True,
                    "voice_windows": result["voiceover"]["matched_windows"],
                    "music_windows": result["music"]["matched_windows"],
                    "source_byte_identity": True, "subjective_quality_verified": False,
                    "authenticated_factory_ui_verified": False,
                    "no_production_writes": True}), flush=True)
            except (ValueError, subprocess.SubprocessError, OSError) as exc:
                failures.append(number)
                print("ISSUE2970_PREVIEW_FAILURE=" + str(number) + ": " + str(exc), flush=True)
            finally:
                path.unlink(missing_ok=True)
        if failures:
            raise SystemExit("Failed exact preview checks: " + str(failures))
        print("ISSUE2970_ALL_SIX_PREVIEWS=PASS unique_encoded_artifacts=2 no_production_writes=true")


if __name__ == "__main__":
    main()
