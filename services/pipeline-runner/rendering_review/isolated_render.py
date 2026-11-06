"""Isolated, attempt-specific Rendering Review Remotion payload compiler.

No Airtable, Google Drive, Remotion, Instagram, scheduler or filesystem calls.
The existing R4 processor MUST NOT be invoked: it clears fields on the
original Platform Output and propagates shared renders to siblings.

This pure boundary compiles only already validated immutable creative plans,
server-resolved Drive media, voiceover, watermark and a separately leased job.
The eventual outbox consumer must validate durable job ownership again both
before and after launch and never change the original output on failure.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any

CHICAGO_PROFILE = "recT2rbKX3MF7cVFU"
REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
IDENTITY = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
FPS = 30
MAX_FRAMES = 180 * FPS


class IsolatedRenderDenied(ValueError):
    pass


def _deny(message: str):
    raise IsolatedRenderDenied(message)


def _str(value: Any) -> str:
    return str(value or "").strip()


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _finite_seconds(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _deny("scene_timing_invalid")
    value = float(value)
    if not math.isfinite(value) or value < 0 or value > 180:
        _deny("scene_timing_invalid")
    return value


def _verified_drive_asset(asset: dict, asset_id: str, profile_id: str) -> dict:
    if not isinstance(asset, dict) or asset.get("asset_id") != asset_id:
        _deny("asset_identity_mismatch")
    if (asset.get("verified") is not True or
        asset.get("authority") != "server" or
        asset.get("canonical_media_authority") != "google_drive" or
        not _str(asset.get("drive_file_id")) or
        not _str(asset.get("rights_receipt_id")) or
        not (asset.get("profile_id") == profile_id or
             asset.get("cross_profile_authorized") is True)):
        _deny("asset_authority_or_rights_unverified")
    playable_url = _str(asset.get("render_url"))
    if not playable_url.startswith("https://"):
        _deny("asset_render_url_unverified")
    if asset.get("media_kind") not in {"image", "video"}:
        _deny("asset_media_kind_invalid")
    return asset


def compile_isolated_render_payload(
    *, job: dict, plan: dict, source: dict, resolved_assets: list,
    voiceover: dict, watermark: dict, observed_source_segments: list | None = None,
    source_mix: dict | None = None,
) -> dict:
    """Build a bounded, deterministic P020-compatible payload; no side effects."""
    if not all(isinstance(obj, dict) for obj in (job, plan, source, voiceover, watermark)):
        _deny("render_context_missing")
    output_id = _str(plan.get("output_id"))
    attempt_id = _str(job.get("attempt_id"))
    job_id = _str(job.get("job_id"))
    plan_hash = _str(job.get("plan_hash"))
    if (not REC.fullmatch(output_id) or
        not IDENTITY.fullmatch(attempt_id) or
        not IDENTITY.fullmatch(job_id) or
        not SHA.fullmatch(plan_hash) or
        job.get("state") != "claimed" or
        job.get("lease_verified") is not True or
        type(job.get("lease_fence")) is not int or job["lease_fence"] < 1 or
        job.get("output_id") != output_id or
        job.get("session_id") != plan.get("session_id") or
        plan.get("plan_hash") != plan_hash or
        plan.get("profile_id") != CHICAGO_PROFILE or
        plan.get("output_type") != "Instagram Reel" or
        plan.get("media_authority") != "google_drive" or
        plan.get("allow_public_publish") is not False or
        plan.get("allow_platform_upload") is not False or
        plan.get("auto_approve") is not False or
        plan.get("mutate_original_production_request") is not False or
        plan.get("mutate_sibling_outputs") is not False):
        _deny("render_job_or_plan_not_authoritative")
    if (source.get("verified") is not True or
        source.get("authority") != "server" or
        source.get("output_id") != output_id or
        source.get("attempt_id") != plan.get("source_attempt_id") or
        source.get("artifact_id") != plan.get("source_artifact_id") or
        source.get("drive_file_id") != plan.get("source_drive_file_id") or
        source.get("canonical_media_authority") != "google_drive" or
        source.get("composition_id") != "ChicagoShiningPhotoSequence"):
        _deny("original_artifact_changed")
    creative = plan.get("creative")
    if not isinstance(creative, dict):
        _deny("creative_plan_missing")
    narration = _str(creative.get("narration"))
    timeline = creative.get("timeline")
    checks = creative.get("acceptance_checks")
    if not narration or not isinstance(timeline, list) or not (1 <= len(timeline) <= 80) or not checks:
        _deny("creative_plan_incomplete")
    if plan.get("blockers"):
        _deny("unresolved_plan_dependencies")
    if not isinstance(resolved_assets, list) or len(resolved_assets) > 80:
        _deny("asset_manifest_invalid")
    indexed = {}
    for item in resolved_assets:
        if not isinstance(item, dict) or not IDENTITY.fullmatch(_str(item.get("asset_id"))):
            _deny("asset_manifest_invalid")
        if item["asset_id"] in indexed:
            _deny("duplicate_asset_identity")
        indexed[item["asset_id"]] = item
    manifest = plan.get("asset_manifest")
    if not isinstance(manifest, list) or not all(isinstance(v, dict) for v in manifest):
        _deny("frozen_asset_manifest_invalid")
    expected = {_str(v.get("asset_id")): _str(v.get("drive_file_id")) for v in manifest}
    if len(expected) != len(manifest) or set(expected) != set(indexed):
        _deny("asset_manifest_changed")
    if any(indexed[k].get("drive_file_id") != fid for k, fid in expected.items()):
        _deny("source_drive_asset_changed")
    if (voiceover.get("verified") is not True or
        voiceover.get("authority") != "server" or
        voiceover.get("output_id") != output_id or
        voiceover.get("attempt_id") != attempt_id or
        voiceover.get("plan_hash") != plan_hash or
        voiceover.get("narration_sha256") != _sha(narration) or
        voiceover.get("canonical_media_authority") != "google_drive" or
        not _str(voiceover.get("drive_file_id")) or
        not _str(voiceover.get("audio_url")).startswith("https://")):
        _deny("voiceover_audio_not_verified_for_plan")
    # This module renders a REVIEW REVISION (V2+), never initial V1.
    # Try to retain the existing watermark when available, but watermark
    # presence/verification is no longer a precondition to creative rerenders.
    # The original V1 production path retains its own strict QA checks.
    watermark_url = _str(watermark.get("url"))
    if not watermark_url.startswith("https://"):
        watermark_url = ""
    # A revision is not permission to silently drop V1's music or enable
    # captions. Only independently verified original rendering properties
    # may set this mix; a model cannot supply or override them.
    mix={"enabled":False,"url":"","volume":0}
    captions=True
    words_per_page=4
    if source_mix is not None:
        if (not isinstance(source_mix,dict) or
            source_mix.get("verified") is not True or
            source_mix.get("authority")!="server" or
            source_mix.get("output_id")!=output_id or
            not IDENTITY.fullmatch(_str(source_mix.get("music_drive_file_id"))) or
            type(source_mix.get("spoken_captions_enabled")) is not bool or
            type(source_mix.get("spoken_caption_words_per_page")) is not int or
            not 1<=source_mix["spoken_caption_words_per_page"]<=12):
            _deny("original_audio_or_caption_mix_unverified")
        original_music=source_mix.get("music")
        if (not isinstance(original_music,dict) or
            set(original_music)-{"url","volume","duckingEnabled",
                "duckingMultiplier","duckFadeFrames","fadeInFrames",
                "fadeOutFrames","startFromSeconds"} or
            not _str(original_music.get("url")).startswith(
                "https://drive.google.com/uc?export=download&id=") or
            not _str(original_music.get("url")).endswith(
                source_mix["music_drive_file_id"]) or
            type(original_music.get("volume")) not in (int,float) or
            not 0<=original_music["volume"]<=1):
            _deny("original_music_mix_untrusted")
        mix=dict(original_music)
        captions=source_mix["spoken_captions_enabled"]
        words_per_page=source_mix["spoken_caption_words_per_page"]
    clips = []
    end_frame = 0
    preserved_instructions = creative.get("preserve") or []
    if not isinstance(preserved_instructions, list) or any(
        not isinstance(p, str) or not p.strip() for p in preserved_instructions
    ):
        _deny("preservation_instructions_invalid")
    used_preservation = set()
    for idx, scene in enumerate(timeline):
        if not isinstance(scene, dict):
            _deny("scene_invalid")
        start = _finite_seconds(scene.get("start_seconds"))
        end = _finite_seconds(scene.get("end_seconds"))
        start_frame, finish_frame = round(start * FPS), round(end * FPS)
        if start_frame != end_frame or finish_frame <= start_frame:
            _deny("scene_timing_gap_or_overlap")
        asset_ids = scene.get("asset_ids")
        preserved = scene.get("preserve_source") is True
        if preserved:
            if not isinstance(asset_ids, list) or asset_ids:
                _deny("preserved_scene_must_use_original_source")
            instruction = _str(scene.get("preserve_instruction"))
            matching = [
                x for x in (observed_source_segments or [])
                if isinstance(x, dict) and
                   x.get("timeline_scene_index") == idx and
                   x.get("preserve_instruction") == instruction
            ]
            if (instruction not in preserved_instructions or
                instruction in used_preservation or len(matching) != 1):
                _deny("preservation_composition_not_verified")
            receipt = matching[0]
            if (receipt.get("verified") is not True or
                receipt.get("authority") != "server" or
                receipt.get("source_drive_file_id") != source["drive_file_id"] or
                receipt.get("source_attempt_id") != source["attempt_id"] or
                not _str(receipt.get("render_url")).startswith("https://")):
                _deny("preserved_clip_not_verified")
            start_source = _finite_seconds(receipt.get("source_start_seconds"))
            end_source = _finite_seconds(receipt.get("source_end_seconds"))
            if (end_source <= start_source or
                abs((end_source-start_source) -
                    (finish_frame-start_frame) / FPS) > 1.0 / FPS):
                _deny("preserved_clip_timing_drift")
            asset_url = receipt["render_url"]
            asset_file = source["drive_file_id"]
            asset_kind = "video"
            asset_id = "source-attempt-" + source["attempt_id"]
            used_preservation.add(instruction)
        else:
            if not isinstance(asset_ids, list) or len(asset_ids) != 1:
                _deny("scene_requires_exactly_one_verified_asset")
            asset_id = _str(asset_ids[0])
            if not IDENTITY.fullmatch(asset_id) or asset_id not in indexed:
                _deny("scene_asset_unavailable")
            asset = _verified_drive_asset(indexed[asset_id], asset_id, CHICAGO_PROFILE)
            asset_url = asset["render_url"]
            asset_file = asset["drive_file_id"]
            asset_kind = asset["media_kind"]
        clip = {
            "id": "review-scene-%02d" % (idx + 1),
            "src": asset_url,
            "url": asset_url,
            "startFrame": start_frame,
            "durationFrames": finish_frame - start_frame,
            "mediaKind": asset_kind,
            "motionStyle": "none",
            "keepSourceAudio": False,
            "muted": True,
            "google_drive_file_id": asset_file,
            "source_asset_id": asset_id,
            "timingMode": "authoritative",
            "timingSource": "timed_script",
        }
        if preserved:
            clip["inSeconds"] = start_source
            clip["outSeconds"] = end_source
            clip["sourceInSeconds"] = start_source
            clip["sourceOutSeconds"] = end_source
        clips.append(clip)
        end_frame = finish_frame
    if end_frame > MAX_FRAMES or end_frame < FPS:
        _deny("pilot_duration_incompatible")
    if abs(_finite_seconds(voiceover.get("duration_seconds")) - end_frame / FPS) > 2.5:
        _deny("voiceover_timeline_mismatch")
    # A visual observation alone cannot prove that the preserved clip actually
    # appears in the new edit. Every protected instruction must map to one
    # exact source segment used by an actual Remotion scene.
    if len(used_preservation) != len(preserved_instructions):
        _deny("preservation_composition_not_verified")
    filename = f"review-{output_id}-{attempt_id}-{plan_hash[:12]}.mp4"
    return {
        "filename": filename,
        "compositionId": "ChicagoShiningPhotoSequence",
        "fps": FPS,
        "width": 1080,
        "height": 1920,
        "durationInFrames": end_frame,
        "durationSeconds": end_frame / FPS,
        "durationIsExplicit": True,
        "timingMode": "authoritative",
        "timingSource": "timed_script",
        "voiceoverText": narration,
        "voiceover": {"url": voiceover["audio_url"], "volume": 1},
        "voiceoverUrl": voiceover["audio_url"],
        "voiceoverTailSeconds": 0,
        "spokenCaptionsEnabled": captions,
        "spokenCaptionWordsPerPage": words_per_page,
        "watermarkUrl": watermark_url,
        "watermarkRequired": False,
        "clips": clips,
        "expectedClipCount": len(clips),
        "music": mix,
        "studioRevision": {
            "source": "rendering_review",
            "output_id": output_id,
            "attempt_id": attempt_id,
            "job_id": job_id,
            "plan_hash": plan_hash,
            "lease_fence": job["lease_fence"],
        },
    }
