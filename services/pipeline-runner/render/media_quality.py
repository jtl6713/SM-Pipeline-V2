"""Byte-level review admission for generated Studio video, not legacy passthrough."""
from __future__ import annotations

import hashlib
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from audio.leading_silence import ffmpeg_bin, ffprobe_bin
from render.fields import field, field_str, parse_json_field

YES = {"yes", "true", "1"}
NO = {"no", "false", "0"}
RECEIPT_FIELD = "Studio_Media_Contract_Receipt_JSON"

class MediaContractError(RuntimeError):
    pass

def require(ok: bool, reason: str) -> None:
    if not ok:
        raise MediaContractError("Studio encoded media integrity guard: " + reason)

def _number(value: Any) -> float:
    try:
        n = float(value)
        return n if math.isfinite(n) else 0
    except (TypeError, ValueError):
        return 0

def _dict(value: Any) -> dict:
    result = parse_json_field(value)
    return result if isinstance(result, dict) else {}

def _audio_config(props: dict, name: str) -> dict:
    item = props.get(name)
    return item if isinstance(item, dict) else {}

def render_contract(output: dict) -> dict | None:
    # Restrict new enforcement to generated Studio outputs with saved directives.
    # A native gallery or imported finished video does not have this render contract.
    if not field_str(output, "Output_Filename").startswith("studio-"):
        return None
    directives = _dict(field(output, "Studio_Output_Directives_JSON"))
    if not directives:
        return None
    props = _dict(field(output, "Remotion_Props_JSON"))
    modes = {}
    for name,key in (("voiceover","Studio_Effective_Voiceover_Mode"),("music","Studio_Effective_Background_Music_Mode")):
        mode=field_str(output,key).lower()
        if mode not in YES|NO:
            mode=str(directives.get("voiceover_mode" if name=="voiceover" else "background_music_mode") or "").lower()
        require(mode in YES|NO, "missing explicit audio intent: "+name)
        modes[name]=mode in YES
    require(bool(props), "missing saved render inputs")
    frames=int(_number(props.get("durationInFrames")))
    fps=_number(props.get("fps"))
    require(frames>0 and fps>0, "missing planned frames/fps")
    require(frames==int(_number(field(output,"Render_Total_Frames"))), "saved render frame count mismatch")
    story=any(field_str(output,k).lower()=="story" for k in ("Studio_Output_Type","Output_Type","Format"))
    if story:
        selected=_dict(field(output,"Selected_Assets_JSON"))
        expected=_number(selected.get("target_total_frames"))
        if not expected:
            expected=round((_number(directives.get("video_duration_seconds")) or 10)*fps)
        require(frames==expected and frames/fps<=15,"Story is not the independently planned duration")
    sources={}
    for name,needed in modes.items():
        if not needed:
            continue
        if name=="voiceover" and props.get("sceneVoiceoverAuthority") is True:
            # Scene-authoritative media uses its own existing manifest checks.
            # This receipt makes no assertion that a top-level VO was mixed.
            sources[name]="scene_voiceover_authority"
            continue
        audio=_audio_config(props,name)
        url=str(audio.get("url") or (props.get("voiceoverUrl") if name=="voiceover" else "") or "").strip()
        require(bool(url) and audio.get("enabled") is not False and _number(audio.get("volume"))>0,
                "requested "+name+" is missing or muted in actual render inputs")
        sources[name]=hashlib.sha256(url.encode()).hexdigest()
    return {"frames":frames,"fps":fps,"seconds":frames/fps,"story":story,
            "width":int(_number(props.get("width"))),"height":int(_number(props.get("height"))),
            "required_audio":modes,"input_source_hashes":sources}

def validate_probe(contract: dict, meta: dict, *, peak_db: float | None, mean_db: float | None) -> dict:
    streams=meta.get("streams") or []
    video=[x for x in streams if x.get("codec_type")=="video"]
    audio=[x for x in streams if x.get("codec_type")=="audio"]
    require(len(video)==1,"expected one encoded video stream")
    v=video[0]
    duration=_number(v.get("duration")) or _number((meta.get("format") or {}).get("duration"))
    tolerance=max(1/contract["fps"],0.035)+0.005
    require(duration>0 and abs(duration-contract["seconds"])<=tolerance,
            f"encoded duration {duration:g}s differs from planned {contract['seconds']:g}s")
    if contract["width"] and contract["height"]:
        require((v.get("width"),v.get("height"))==(contract["width"],contract["height"]),
                "encoded geometry differs from render inputs")
    actual_frames=_number(v.get("nb_frames"))
    if actual_frames:
        require(actual_frames==contract["frames"],"encoded frame count differs from plan")
    if any(contract["required_audio"].values()):
        require(len(audio)==1,"requested audio missing from encoded file")
        require(peak_db is not None and mean_db is not None and peak_db>-35 and mean_db>-50,
                "encoded audio absent, silent or too quiet")
    return {"duration_seconds":duration,"encoded_frames":int(actual_frames) if actual_frames else None,
            "width":v.get("width"),"height":v.get("height"),"audio_streams":len(audio),
            "peak_db":peak_db,"mean_db":mean_db}

def _probe_file(path: Path, audio_required: bool) -> tuple[dict,float|None,float|None]:
    try:
        probe=subprocess.run([ffprobe_bin(),"-v","error","-show_streams","-show_format","-of","json",str(path)],
            capture_output=True,text=True,timeout=30,check=False)
        require(probe.returncode==0,"ffprobe could not read final MP4")
        meta=json.loads(probe.stdout)
        if not audio_required:
            return meta,None,None
        stats=subprocess.run([ffmpeg_bin(),"-nostdin","-hide_banner","-nostats","-i",str(path),"-map","0:a:0",
             "-af","volumedetect","-f","null","-"],capture_output=True,text=True,timeout=120,check=False)
        require(stats.returncode==0,"encoded audio could not be decoded")
        def db(key: str) -> float|None:
            matches=re.findall(key+r":\s*(-?[0-9.]+)\s*dB",stats.stderr or "")
            return float(matches[-1]) if matches else None
        return meta,db("max_volume"),db("mean_volume")
    except (OSError,subprocess.TimeoutExpired,ValueError) as exc:
        raise MediaContractError("Studio encoded media integrity guard: media probe unavailable") from exc

def verify_rendered_media(output: dict, data: bytes, *, job_id: str) -> dict:
    contract=render_contract(output)
    if contract is None:
        return {}
    require(bool(data) and bool(job_id),"missing rendered bytes or job identity")
    with tempfile.TemporaryDirectory(prefix="studio-media-qa-") as td:
        path=Path(td)/"render.mp4"
        path.write_bytes(data)
        meta,peak,mean=_probe_file(path,any(contract["required_audio"].values()))
        encoded=validate_probe(contract,meta,peak_db=peak,mean_db=mean)
    # The encoded mix probe alone cannot distinguish both stems. This receipt
    # records separately the planned source identities and actual decoded mix.
    receipt={"version":1,"job_id":job_id,"sha256":hashlib.sha256(data).hexdigest(),
             "size_bytes":len(data),"contract":contract,"encoded":encoded,
             "proof":"render_input_source_identity_plus_encoded_mix_probe",
             "individual_stems_verified":False}
    return {RECEIPT_FIELD:json.dumps(receipt,separators=(",",":"))}
