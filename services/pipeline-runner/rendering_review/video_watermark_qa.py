"""Independent frame-level verification of the exact profile-owned logo.

Remotion's watermarkRequired flag only proves that a URL was supplied, NOT
that the video visibly contains the correct mark. Never certify a video from
render props, a model response, or an uninspected Drive URL.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
import subprocess
import tempfile

from PIL import Image, UnidentifiedImageError

RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")


class VideoWatermarkUnverified(ValueError):
    pass


def _deny(message):
    raise VideoWatermarkUnverified(message)


def inspect_logo_frames(frames, logo_png, profile_id, *,
                        target_width=1080, left=30, top=30,
                        logo_fraction=0.12):
    """Compare opaque source-logo pixels with actual decoded video frames.

    Browser <Img> uses width 12%, top/left 30px in PhotoSequence. A small
    compression/resampling tolerance is allowed, but every independently
    sampled frame must contain the same high-confidence visible logo.
    This deliberately fails for translucent logos without enough stable
    opaque pixels; manual visual QA or a stronger verifier is required.
    """
    if not RECORD.fullmatch(str(profile_id or "")):
        _deny("video_watermark_profile_identity_invalid")
    if not isinstance(frames,(tuple,list)) or len(frames)<3:
        _deny("video_watermark_frame_samples_missing")
    if not isinstance(logo_png,bytes) or not logo_png.startswith(b"\x89PNG\r\n\x1a\n"):
        _deny("video_watermark_source_not_png")
    try:
        with Image.open(BytesIO(logo_png)) as img:
            if img.format!="PNG":
                _deny("video_watermark_source_not_png")
            logo=img.convert("RGBA")
    except (OSError,UnidentifiedImageError) as exc:
        raise VideoWatermarkUnverified("video_watermark_source_unreadable") from exc
    if not (8<=logo.width<=10000 and 8<=logo.height<=10000):
        _deny("video_watermark_source_dimensions_invalid")
    width=round(target_width*logo_fraction)
    height=round(width*logo.height/logo.width)
    if width<16 or height<8 or height>target_width:
        _deny("video_watermark_display_dimensions_invalid")
    logo=logo.resize((width,height),resample=Image.Resampling.LANCZOS)
    pix=logo.load()
    # Use an unaltered set of >=90%-opaque pixels to eliminate unknown
    # underlying video as an input to the comparison.
    probes=[(x,y,(r,g,b)) for y in range(height) for x in range(width)
            for r,g,b,a in [pix[x,y]] if a>=230]
    if len(probes)<80:
        _deny("video_watermark_opaque_coverage_insufficient")
    fractions=[]
    for frame in frames:
        if not isinstance(frame,Image.Image) or frame.size[0]!=target_width:
            _deny("video_watermark_decoded_frame_invalid")
        if frame.height<top+height or frame.width<left+width:
            _deny("video_watermark_frame_logo_out_of_bounds")
        rgb=frame.convert("RGB").load()
        matched=0
        for x,y,(r,g,b) in probes:
            vr,vg,vb=rgb[left+x,top+y]
            # Chromium resize + H.264 chroma subsampling can shift a pixel,
            # but near-opaque mark colors must remain recoverable.
            if max(abs(vr-r),abs(vg-g),abs(vb-b))<=58:
                matched+=1
        fraction=matched/len(probes)
        fractions.append(fraction)
        if fraction<0.82:
            _deny("video_watermark_logo_not_visible_in_every_frame")
    return {
        "verified":True,"authority":"server",
        "profile_id":profile_id,"profile_watermark_matched":True,
        "frame_sample_count":len(frames),"minimum_pixel_match":round(min(fractions),4),
        "verification_method":"decoded_frame_profile_logo_pixels_v1",
    }


def verify_video_profile_watermark(video_bytes, logo_png, profile_id, *,
                                   duration_seconds, width=1080):
    if not isinstance(video_bytes,bytes) or len(video_bytes)<100000:
        _deny("video_watermark_video_bytes_invalid")
    if type(duration_seconds) not in (float,int) or not 1<=duration_seconds<=180:
        _deny("video_watermark_duration_invalid")
    samples=(min(0.5,duration_seconds/6),duration_seconds/2,
             max(0.1,duration_seconds-0.5))
    frames=[]
    with tempfile.TemporaryDirectory(prefix="review-watermark-qa-") as temp:
        video=Path(temp)/"attempt.mp4"
        video.write_bytes(video_bytes)
        for offset in samples:
            try:
                result=subprocess.run([
                    "ffmpeg","-nostdin","-hide_banner","-loglevel","error",
                    "-ss",f"{offset:.3f}","-i",str(video),
                    "-frames:v","1","-f","image2pipe",
                    "-vcodec","png","pipe:1",
                ],capture_output=True,timeout=35,check=True)
                if not result.stdout or len(result.stdout)>25000000:
                    _deny("video_watermark_frame_read_unavailable")
                with Image.open(BytesIO(result.stdout)) as image:
                    image.load()
                    frames.append(image.copy())
            except (subprocess.SubprocessError,OSError,UnidentifiedImageError) as exc:
                raise VideoWatermarkUnverified("video_watermark_frame_decode_failed") from exc
    return inspect_logo_frames(frames,logo_png,profile_id,target_width=width)
