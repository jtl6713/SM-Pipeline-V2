"""Exact-city Vibe Cut final-video verification from authoritative Drive logo.

No original Output edits, Factory approval, or publisher actions occur here.
The companion Worker must verify the render receipt and staged Google Drive
upload before completing an Attempt.
"""
from __future__ import annotations
import hashlib
import re

from rendering_review.video_watermark_qa import verify_video_profile_watermark
from rendering_review.vibe_cut_validation import validate_vibe_mp4,VibeMediaDenied

RECORD=re.compile(r"rec[A-Za-z0-9]{14}\Z")
DRIVE=re.compile(r"[A-Za-z0-9_-]{20,}\Z")
SHA=re.compile(r"[a-f0-9]{64}\Z")

def validate_owned_vibe_mp4(video, *, profile_id, owned_logo, aspect_ratio,
                            expected_duration, probe=None):
    """Use a server-owned receipt plus independent decoded-frame QA."""
    if not isinstance(owned_logo,dict):
        raise VibeMediaDenied("vibe_exact_profile_logo_missing")
    receipt=owned_logo.get("receipt")
    logo=owned_logo.get("bytes")
    if (not RECORD.fullmatch(str(profile_id or "")) or
        not isinstance(receipt,dict) or
        receipt.get("verified") is not True or
        receipt.get("authority")!="server" or
        receipt.get("media_authority")!="google_drive" or
        receipt.get("profile_id")!=profile_id or
        not RECORD.fullmatch(str(receipt.get("media_asset_record_id") or "")) or
        not DRIVE.fullmatch(str(receipt.get("drive_file_id") or "")) or
        not SHA.fullmatch(str(receipt.get("sha256") or "")) or
        not isinstance(logo,bytes) or
        hashlib.sha256(logo).hexdigest()!=receipt["sha256"]):
        raise VibeMediaDenied("vibe_exact_profile_logo_not_authoritative")
    width={"9:16":1080,"16:9":1920}.get(aspect_ratio)
    if width is None:
        raise VibeMediaDenied("vibe_unsupported_aspect")
    def qa(media,ratio):
        if ratio!=aspect_ratio:
            raise VibeMediaDenied("vibe_logo_aspect_mismatch")
        return verify_video_profile_watermark(media,logo,profile_id,
            duration_seconds=expected_duration,width=width)
    return validate_vibe_mp4(video,aspect_ratio=aspect_ratio,
        expected_duration=expected_duration,expected_profile_id=profile_id,
        probe=probe,watermark_qa=qa)
