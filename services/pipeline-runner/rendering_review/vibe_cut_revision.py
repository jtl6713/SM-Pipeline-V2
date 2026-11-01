"""Pure, music-only Vibe Cut review compiler for one *verified* source video.

Vibe Cut is not the narrated PhotoSequence workflow. A proposed revision
must preserve the source video's immutable Drive identity and music-license
receipt; its cut edits must stay within the independently observed source.
No Airtable/Drive/Remotion writes, no automatic dispatch, no approval.
"""
from __future__ import annotations
import math
import re

REC=re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN=re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
DIGEST=re.compile(r"[0-9a-f]{64}\Z")
FPS=30
ASPECT={"9:16":(1080,1920),"16:9":(1920,1080)}

class VibeRevisionDenied(ValueError):
    pass

def deny(message):
    raise VibeRevisionDenied(message)

def finite(value):
    return type(value) in (int,float) and math.isfinite(value)

def compile_vibe_review_payload(*,job,plan,source,music,watermark,authorized_profiles):
    if not all(isinstance(x,dict) for x in (job,plan,source,music,watermark)):
        deny("vibe_context_missing")
    output=job.get("output_id")
    profile=job.get("profile_id")
    attempt=job.get("attempt_id")
    job_id=job.get("job_id")
    plan_hash=job.get("plan_hash")
    ratio=plan.get("aspect_ratio")
    if (not REC.fullmatch(str(output or "")) or
        not REC.fullmatch(str(profile or "")) or
        not isinstance(authorized_profiles,list) or profile not in authorized_profiles or
        not TOKEN.fullmatch(str(attempt or "")) or
        not TOKEN.fullmatch(str(job_id or "")) or
        not TOKEN.fullmatch(str(job.get("session_id") or "")) or
        not DIGEST.fullmatch(str(plan_hash or "")) or
        job.get("state")!="claimed" or job.get("lease_verified") is not True or
        type(job.get("lease_fence")) is not int or job["lease_fence"]<1 or
        plan.get("schema")!="studio.render-review.vibe.1" or
        plan.get("mode")!="vibe_cut" or plan.get("source_kind")!="video" or
        plan.get("output_id")!=output or plan.get("profile_id")!=profile or
        plan.get("session_id")!=job["session_id"] or
        plan.get("plan_hash")!=plan_hash or
        plan.get("human_intent")!="explicit_button" or
        plan.get("allow_public_publish") is not False or
        plan.get("allow_platform_upload") is not False or
        plan.get("auto_approve") is not False or
        plan.get("mutate_original_production_request") is not False or
        plan.get("mutate_sibling_outputs") is not False or
        plan.get("voiceover")!="off" or plan.get("narration") not in ("",None) or
        ratio not in ASPECT):
        deny("vibe_job_not_authoritative")
    if (source.get("verified") is not True or source.get("authority")!="server" or
        source.get("profile_id")!=profile or source.get("output_id")!=output or
        source.get("source_kind")!="original_video" or
        source.get("canonical_media_authority")!="google_drive" or
        source.get("mime_type")!="video/mp4" or
        source.get("rights_verified") is not True or
        source.get("google_drive_verified") is not True or
        source.get("published_or_dispatching") is not False or
        source.get("review_hold_active") is not True or
        not TOKEN.fullmatch(str(source.get("drive_file_id") or "")) or
        source.get("drive_file_id")!=plan.get("source_drive_file_id") or
        not DIGEST.fullmatch(str(source.get("sha256") or "")) or
        source.get("sha256")!=plan.get("source_sha256") or
        not finite(source.get("duration_seconds")) or
        not 1<=source["duration_seconds"]<=600):
        deny("vibe_source_not_verified")
    if (music.get("verified") is not True or music.get("authority")!="server" or
        music.get("license_verified") is not True or
        music.get("google_drive_verified") is not True or
        music.get("profile_id")!=profile or music.get("output_id")!=output or
        not TOKEN.fullmatch(str(music.get("drive_file_id") or "")) or
        music.get("drive_file_id")!=plan.get("music_drive_file_id") or
        not isinstance(music.get("render_url"),str) or
        music["render_url"]!="https://drive.google.com/uc?export=download&id="+music["drive_file_id"] or
        not finite(music.get("volume")) or not 0<=music["volume"]<=1):
        deny("vibe_music_license_or_identity_invalid")
    catalog=watermark.get("catalog_receipt")
    # This proof must come from the exact profile-owned Airtable Media Asset
    # plus Google Drive byte verification, not arbitrary existing render props.
    if (not isinstance(catalog,dict) or
        catalog.get("verified") is not True or
        catalog.get("authority")!="server" or
        catalog.get("media_authority")!="google_drive" or
        catalog.get("profile_id")!=profile or
        not REC.fullmatch(str(catalog.get("media_asset_record_id") or "")) or
        not TOKEN.fullmatch(str(catalog.get("drive_file_id") or "")) or
        not DIGEST.fullmatch(str(catalog.get("sha256") or "")) or
        watermark.get("drive_file_id")!=catalog["drive_file_id"] or
        watermark.get("render_url")!="https://drive.google.com/uc?export=download&id="+catalog["drive_file_id"]):
        deny("vibe_profile_catalog_watermark_mismatch")
    if (watermark.get("verified") is not True or
        watermark.get("authority")!="server" or
        watermark.get("profile_id")!=profile or
        watermark.get("policy")!="retain_current_approved" or
        not isinstance(watermark.get("render_url"),str) or
        not watermark["render_url"].startswith("https://") or
        not TOKEN.fullmatch(str(watermark.get("drive_file_id") or ""))):
        deny("vibe_profile_watermark_unverified")
    cuts=plan.get("cuts")
    if not isinstance(cuts,list) or not 1<=len(cuts)<=80:
        deny("vibe_cuts_missing")
    clips=[]
    total=0
    for i,cut in enumerate(cuts):
        if (not isinstance(cut,dict) or set(cut)!={"start_seconds","end_seconds"} or
            not finite(cut["start_seconds"]) or
            not finite(cut["end_seconds"]) or
            cut["start_seconds"]<0 or cut["end_seconds"]>source["duration_seconds"]+1e-6 or
            cut["end_seconds"]-cut["start_seconds"]<.2 or
            cut["end_seconds"]-cut["start_seconds"]>30):
            deny("vibe_cut_outside_owned_source")
        frames=round((cut["end_seconds"]-cut["start_seconds"])*FPS)
        if frames<6:deny("vibe_clip_too_short")
        if total+frames>90*FPS:deny("vibe_revision_longer_than_90_seconds")
        clips.append({
            "id":f"review-vibe-{i+1:02d}",
            "src":"https://drive.google.com/uc?export=download&id="+source["drive_file_id"],
            "url":"https://drive.google.com/uc?export=download&id="+source["drive_file_id"],
            "mediaKind":"video",
            "google_drive_file_id":source["drive_file_id"],
            "startFrame":total,
            "durationFrames":frames,
            "inSeconds":cut["start_seconds"],
            "outSeconds":cut["end_seconds"],
            "keepSourceAudio":False,"muted":True,
            # For beat/fast-cut revisions, the source windows must remain
            # exact. A default Remotion crossfade would obscure most of a
            # 0.2-second cut. Future authored transitions require a separately
            # reviewed transition contract and duration proof.
            "transition":{"type":"none","durationFrames":0},
            "motionStyle":"none",
            "timingMode":"authoritative",
            "timingSource":"owned_vibe_cut_plan",
        })
        total+=frames
    if total<8*FPS:deny("vibe_revision_shorter_than_8_seconds")
    width,height=ASPECT[ratio]
    return {
        "filename":f"review-vibe-{output}-{attempt}-{plan_hash[:12]}.mp4",
        "compositionId":"ChicagoShiningPhotoSequence",
        "width":width,"height":height,"targetAspectRatio":ratio,"fps":FPS,
        "durationInFrames":total,"durationSeconds":total/FPS,
        "durationIsExplicit":True,"timingMode":"authoritative",
        "timingSource":"owned_vibe_cut_plan",
        "clips":clips,"expectedClipCount":len(clips),
        "voiceoverText":"","voiceover":{"enabled":False},
        "spokenCaptionsEnabled":False,"captionTrackMode":"none",
        "music":{"enabled":True,"url":music["render_url"],
                 "volume":music["volume"],"duckingEnabled":False},
        "watermarkUrl":watermark["render_url"],"watermarkRequired":True,
        "studioRevision":{"source":"rendering_review_vibe_cut",
             "output_id":output,"profile_id":profile,
             "attempt_id":attempt,"job_id":job_id,
             "plan_hash":plan_hash,"lease_fence":job["lease_fence"],
             "allow_platform_upload":False,"allow_public_publish":False}
    }
