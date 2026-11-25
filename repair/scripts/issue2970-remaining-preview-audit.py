"""Read-only, bounded evidence capture for the four exact old preview revisions.

No approval, source repair, canonical DB writes, or conclusion that failed
reference attribution proves absence. All output memberships are snapshot evidence.
"""
import importlib.util
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("stem_proof", Path(__file__).with_name("issue2970-encoded-stem-proof.py"))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)
BASE = "https://media.chicagoshining.com/studio/previews/"
GROUPS = [
    (2307, [11172,11174,11175], "recztl5GuZhhS8dGE/jobs/job-20261124232013-0f9c2dce.mp4", []),
    (2307, [11173], "rec1EEHHhPAQmbm9X/jobs/job-20261124232226-331f0e19.mp4", []),
    (2308, [11178,11179,11180,11181], "recnPrM827psgnJbd/jobs/job-20261124232909-94fc4b89.mp4", [11181]),
    (2309, [11182,11183,11184,11185,11186,11187], "recaDRS4GJfkKjNQ3/jobs/job-20261124233420-2a4f3e3e.mp4", [11186,11187]),
]
SOURCES = {
    2307: ("16KtpcLd4Azh3uMqsJOdjH86bjUt-C85X", "1lPIWq8UD4x_3fBA0NkupYNLeEAxytK3p"),
    2308: ("1oVVAXvJHnkgQc4uNx-UpKNRcl_bTHqBu", "1C1TXynRXZHvVro0YiA6pazh9ceMMUBZI"),
    2309: ("1GIL5guzkuC3_IoFK6eJRsfKXqsQVdQHg", "1OMtlvif3QtXTPQAzdcX07rNHDAccWrBV"),
}


def fetch(url, path, limit, redirect=False):
    args = ["curl", "--fail", "--silent", "--show-error", "--proto", "=https",
            "--proto-redir", "=https", "--connect-timeout", "10", "--max-time", "40",
            "--max-filesize", str(limit)]
    if redirect:
        args += ["--location", "--max-redirs", "4"]
    subprocess.run(args + ["--output", str(path), url], check=True, timeout=45, capture_output=True)
    if not 0 < path.stat().st_size <= limit:
        raise ValueError("download size outside bound")


def probe(path):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams",
                                               "-show_format", "-of", "json", str(path)], timeout=30))


def source_audio(path):
    meta = probe(path)
    if not any(s["codec_type"] == "audio" for s in meta["streams"]):
        raise ValueError("source has no audio")
    duration = float(meta["format"]["duration"])
    if not 1 <= duration <= 360:
        raise ValueError("source duration out of scope")
    return proof.pcm(path)


def level_db(data):
    return round(20*np.log10(max(float(np.sqrt(np.mean(data*data))), 1e-9)), 2)


def main():
    proof.synthetic()
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        refs = {}
        for content, ids in SOURCES.items():
            refs[content] = {}
            for kind, file_id in zip(("voiceover", "music"), ids):
                path = root / (str(content) + "-" + kind + ".mp3")
                try:
                    fetch("https://drive.google.com/uc?export=download&id=" + file_id, path, 30_000_000, redirect=True)
                    data = source_audio(path)
                    refs[content][kind] = data
                    print("ISSUE2970_REFERENCE=" + json.dumps({"content":content,"source":kind,
                          "sha256":proof.file_sha(path),"seconds":round(len(data)/proof.RATE,3),
                          "rms_dbfs":level_db(data),"status":"decoded"}), flush=True)
                except (subprocess.SubprocessError, OSError, ValueError, KeyError):
                    print("ISSUE2970_REFERENCE=" + json.dumps({"content":content,"source":kind,
                          "status":"not_accessible_or_not_decodable_via_saved_public_link"}), flush=True)
                finally:
                    path.unlink(missing_ok=True)
        failures = []
        for content, outputs, url, stories in GROUPS:
            path = root / (str(outputs[0]) + ".mp4")
            try:
                fetch(BASE+url, path, 100_000_000)
                meta = probe(path)
                video = [s for s in meta["streams"] if s["codec_type"]=="video"]
                audio = [s for s in meta["streams"] if s["codec_type"]=="audio"]
                if len(video) != 1:
                    raise ValueError("expected a single video stream")
                subprocess.run(["ffmpeg","-nostdin","-v","error","-xerror","-i",str(path),
                                "-map","0:v:0","-map","0:a:0?","-f","null","-"],check=True,timeout=120)
                result = {"content":content,"outputs":outputs,"sha256":proof.file_sha(path),
                          "size_bytes":path.stat().st_size,"decoded":True,
                          "frames":int(video[0]["nb_frames"]),
                          "duration_seconds":float(video[0]["duration"]),
                          "width":video[0]["width"],"height":video[0]["height"],
                          "audio_streams":len(audio),"story_outputs_planned_10s":stories,
                          "reference_attribution":"not_run","no_production_writes":True}
                if audio:
                    mix = proof.pcm(path)
                    result["rms_dbfs"] = level_db(mix)
                    if all(k in refs[content] for k in ("voiceover","music")):
                        measured = proof.attribution(mix,refs[content]["voiceover"],refs[content]["music"])
                        result["reference_attribution"] = {k:measured[k]["matched_windows"] for k in ("voiceover","music")}
                        result["both_sources_proven"] = measured["both_sources_present"]
                        result["absence_inferred_from_failed_attribution"] = False
                print("ISSUE2970_OLD_PREVIEW=" + json.dumps(result),flush=True)
            except (subprocess.SubprocessError, OSError, ValueError, KeyError) as exc:
                failures.extend(outputs)
                print("ISSUE2970_OLD_PREVIEW_ERROR=" + json.dumps({"outputs":outputs,"error_type":type(exc).__name__}),flush=True)
            finally:
                path.unlink(missing_ok=True)
        if failures:
            raise SystemExit("Some exact previews could not be decoded: " + str(failures))
        print("ISSUE2970_OLD_PREVIEW_AUDIT=PASS decoded_four_distinct_previews=true no_production_writes=true")


if __name__ == "__main__":
    main()
