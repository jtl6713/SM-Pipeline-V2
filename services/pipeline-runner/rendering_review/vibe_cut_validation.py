"""Vibe Cut replacement media validator: music-only MP4 is not a VO Reel.

This is an independent final-byte check, not an asset publisher. It inspects
the exact artifact bytes the isolated worker intends to put in Google Drive.
Its caller still must authenticate the output/job/plan, launch once, verify the
Drive upload and visually verify the profile watermark before marking ready.
"""
from __future__ import annotations
import hashlib
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

class VibeMediaDenied(ValueError):
    pass

def deny(msg): raise VibeMediaDenied(msg)

def validate_vibe_mp4(data:bytes, *, aspect_ratio:str, expected_duration:float,
                      expected_profile_id:str=None, probe=None, watermark_qa=None)->dict:
    dimensions={"9:16":(1080,1920),"16:9":(1920,1080)}
    if (not isinstance(expected_profile_id,str) or
        re.fullmatch(r"rec[A-Za-z0-9]{14}",expected_profile_id) is None):
        deny("vibe_expected_profile_identity_missing")
    if (aspect_ratio not in dimensions or
        type(expected_duration) not in (float,int) or
        not math.isfinite(expected_duration) or
        not 8<=expected_duration<=90 or
        not isinstance(data,bytes) or len(data)<100000 or
        data[4:8]!=b"ftyp"):
        deny("vibe_media_identity_or_mp4_invalid")
    # An exact independent logo QA is mandatory. Remotion's 'required' flag
    # cannot prove the finished file actually contains the correct logo.
    if not callable(watermark_qa):
        deny("vibe_verified_visual_branding_required")
    if probe is None:
        with tempfile.TemporaryDirectory(prefix="review-vibe-") as folder:
            path=Path(folder)/"attempt.mp4"
            path.write_bytes(data)
            try:
                result=subprocess.run(["ffprobe","-v","error","-show_entries",
                    "stream=codec_type,width,height,codec_name:"
                    "format=duration,format_name","-of","json",str(path)],
                    capture_output=True,text=True,timeout=45,check=True)
                metadata=json.loads(result.stdout)
            except (subprocess.CalledProcessError,subprocess.TimeoutExpired,
                    ValueError,KeyError) as exc:
                raise VibeMediaDenied("vibe_ffprobe_failed") from exc
    else:
        if not callable(probe):deny("vibe_media_probe_invalid")
        metadata=probe(data)
    if not isinstance(metadata,dict):
        deny("vibe_probe_evidence_invalid")
    streams=metadata.get("streams")
    info=metadata.get("format") or {}
    if not isinstance(streams,list) or not isinstance(info,dict):
        deny("vibe_probe_evidence_invalid")
    videos=[x for x in streams if isinstance(x,dict) and x.get("codec_type")=="video"]
    audios=[x for x in streams if isinstance(x,dict) and x.get("codec_type")=="audio"]
    if len(videos)!=1 or len(audios)<1 or len(audios)>2:
        deny("vibe_video_or_music_audio_track_missing")
    vid=videos[0]
    if (vid.get("width"),vid.get("height"))!=dimensions[aspect_ratio]:
        deny("vibe_aspect_ratio_changed")
    if vid.get("codec_name") not in {"h264","hevc"}:
        deny("vibe_video_codec_unsupported")
    if any(x.get("codec_name") not in {"aac","mp3"} for x in audios):
        deny("vibe_music_track_codec_unsupported")
    try:seconds=float(info.get("duration"))
    except (TypeError,ValueError):deny("vibe_duration_missing")
    if not math.isfinite(seconds) or abs(seconds-expected_duration)>0.6:
        deny("vibe_music_video_duration_drift")
    branding=watermark_qa(data,aspect_ratio)
    if not isinstance(branding,dict) or branding.get("verified") is not True or (
        branding.get("authority")!="server" or
        branding.get("profile_watermark_matched") is not True or
        branding.get("frame_sample_count",0)<3 or
        branding.get("profile_id")!=expected_profile_id
    ):
        deny("vibe_media_branding_not_verified")
    return {
      "mime_type":"video/mp4","byte_count":len(data),
      "sha256":hashlib.sha256(data).hexdigest(),
      "width":vid["width"],"height":vid["height"],
      "duration_seconds":seconds,"audio_verified":True,
      "music_only":True,"voiceover_expected":False,
      "watermark_verified":True,"watermark_profile_id":branding["profile_id"],
      "watermark_frame_sample_count":branding["frame_sample_count"],
      "ready_for_publication":False,
    }
