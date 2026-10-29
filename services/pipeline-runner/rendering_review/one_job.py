"""One exact, real Chicago Reel replacement. No original Platform Output writes.

Protected entrypoint is the only trigger. Worker owns the publication hold,
job lease, write-once Remotion intent and every review-session transition.
This code uses existing ElevenLabs, Remotion and Google Drive production clients.
Ambiguous remote calls must be reconciled; no automatic second render POST.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qs

import requests

from airtable.client import AirtableClient
from audio.voiceover_duration import probe_audio_duration_bytes
from branding.watermark import brand_watermark_url
from integrations.google_drive import GoogleDriveClient
from p2.constants import VOICEOVER_DRIVE_FOLDER_ID
from p2.elevenlabs_client import resolve_content_voice_id, synthesize_voiceover_by_id
from p2.normalizer_client import normalize_voiceover
from render.remotion_client import RemotionClient
from render.settings import get_google_drive_folder_id
from rendering_review.isolated_launch import launch_review_render_once
from rendering_review.remote_ledger import RemoteLaunchLedger, _NoRedirect, _validate_base, _access_headers

CHICAGO="recT2rbKX3MF7cVFU"
OUTPUTS="tblrlPeboBthkplH0"
SESSIONS="tblHX3UdoNszkoquG"
JOBS="tblUkZB6SMtf9Ib6I"
ATTEMPTS="tbl7wPOAE26o2coMU"
PLANS="tblalFXUJyYg5PBrz"
ITEMS="tblwzN9AXWvmKVKPs"
REQUESTS="tbl75nxNi6PMUjBQE"
MEDIA="tblSITCujCsJTNcDe"
IDENTITY=re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
RECORD=re.compile(r"rec[A-Za-z0-9]{14}\Z")
SHA=re.compile(r"[a-f0-9]{64}\Z")
FINAL_STATUSES={"complete","completed","done","success","succeeded"}

class ExactReviewRenderDenied(RuntimeError):
    pass

def fail(message):
    raise ExactReviewRenderDenied(message)

def _review_renderer_base():
    """Use the already configured Pipeline Runner Remotion origin for this pilot.

    An exact-review override is still supported; otherwise match the same
    REMOTION_RENDERER_URL used by normal production renders.
    """
    return (os.environ.get("RENDERING_REVIEW_REMOTION_BASE_URL", "").strip()
            or os.environ.get("REMOTION_RENDERER_URL", "").strip()
            or "http://127.0.0.1:3333").rstrip("/")


def one_link(value):
    return value[0] if isinstance(value,list) and len(value)==1 and RECORD.fullmatch(str(value[0])) else ""

def select_one(client,table,key,value,fields=None):
    if not IDENTITY.fullmatch(str(value)):
        fail("review_record_identity_invalid")
    safe=str(value).replace("\\","").replace('"',"")
    rows=client.list_records(table,formula='{'+key+'}="'+safe+'"',
        max_records=2,fields=fields)
    if len(rows)!=1:
        fail("review_record_duplicate_or_missing:"+table)
    return rows[0]

def _post_once(worker,secret,route,body,timeout=20):
    """One protected HTTP POST. No redirects, retries or implicit replays.

    The production Cloudflare route is known to authorize the service token
    through HttpClient. Use the same direct single-request semantics rather
    than Python-urllib's default request fingerprint/redirect stack.
    """
    url=_validate_base(worker)+route
    headers={"Content-Type":"application/json",
             "X-Rendering-Review-Job-Secret":secret,
             "User-Agent":"",
             **_access_headers()}
    data=json.dumps(body,separators=(",",":")).encode("utf-8")
    try:
        with requests.post(url,headers=headers,data=data,timeout=timeout,
                           allow_redirects=False,stream=True) as result:
            status=result.status_code
            raw=result.raw.read(8193, decode_content=True)
    except requests.RequestException as exc:
        raise ExactReviewRenderDenied("review_worker_reply_ambiguous_reconcile") from exc
    except Exception as exc:
        raise ExactReviewRenderDenied("review_worker_reply_ambiguous_reconcile") from exc
    if status!=200:
        # A readable Worker application error is a narrow safe denial code,
        # NOT a permit to retry a render. Never surface arbitrary body text.
        reason=""
        if status in (401,403,404,405,409,415,422):
            try:
                response=json.loads(raw)
                code=response.get("code") if isinstance(response,dict) else None
                if isinstance(code,str) and re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}",code):
                    reason="_"+code.lower()
            except (ValueError,TypeError,UnicodeError):
                pass
            fail("review_worker_http_denied_"+str(status)+reason)
        fail("review_worker_reply_ambiguous_reconcile")
    if len(raw)>8192:
        fail("review_worker_receipt_invalid")
    try:
        reply=json.loads(raw)
    except (ValueError,UnicodeError):
        fail("review_worker_receipt_invalid")
    if not isinstance(reply,dict) or reply.get("ok") is not True:
        fail("review_worker_receipt_unverified")
    return reply

def _evidence(client,drive,output_id,job_id):
    out=client.get_record(OUTPUTS,output_id)
    of=out["fields"]
    if (out.get("id")!=output_id or
        of.get("Studio_Render_Review_Hold_Active") is not True or
        of.get("Do_Not_Publish") is not True or
        of.get("Published_At") or of.get("Platform_Media_ID") or
        of.get("Platform_Post_ID") or of.get("Publish_Started_At") or
        of.get("Publish_Locked_By") or of.get("Publish_Locked_At")):
        fail("original_output_not_held_or_meta_dispatch_started")
    item_id=one_link(of.get("Content_Item"))
    if not item_id: fail("review_content_item_missing")
    item=client.get_record(ITEMS,item_id)
    if one_link(item["fields"].get("Content_Profile"))!=CHICAGO:
        fail("review_not_chicago")
    req_id=one_link(item["fields"].get("Production_Request"))
    if not req_id: fail("review_original_request_missing")
    req=client.get_record(REQUESTS,req_id)
    originals=json.loads(req["fields"].get("Studio_Master_Assets_JSON") or "null")
    if not isinstance(originals,list) or not 1<=len(originals)<=80:
        fail("review_original_media_manifest_invalid")
    session_row=select_one(client,SESSIONS,"Output_Record_ID",output_id)
    session=json.loads(session_row["fields"].get("Session_JSON") or "null")
    job_row=select_one(client,JOBS,"Job_ID",job_id)
    jf=job_row["fields"]
    if (session.get("output_id")!=output_id or
        session.get("profile_id")!=CHICAGO or
        session.get("review_hold",{}).get("active") is not True or
        jf.get("Output_Record_ID")!=output_id or
        jf.get("Session_ID")!=session.get("id") or
        session.get("active_job",{}).get("id")!=job_id or
        jf.get("Plan_Hash")!=session.get("active_job",{}).get("plan_hash") or
        jf.get("Job_State") not in ("queued","claimed")):
        fail("review_job_session_not_authoritative")
    plan_state=session.get("plan") or {}
    plan=plan_state.get("immutable_manifest")
    if not isinstance(plan,dict) or plan_state.get("hash")!=jf.get("Plan_Hash") or (
        plan_state.get("version") != plan.get("plan_version")):
        fail("frozen_review_plan_unavailable")
    plan_row=select_one(client,PLANS,"Plan_Hash",jf["Plan_Hash"])
    if plan_row["fields"].get("Session_ID")!=session["id"]:
        fail("review_plan_durable_row_mismatch")
    original_file=str(of.get("Final_File_ID") or "")
    if (not original_file or
        not IDENTITY.fullmatch(str(plan.get("source_attempt_id") or ""))):
        fail("original_drive_media_not_verified")
    source_file=str(plan.get("source_drive_file_id") or "")
    source_attempt=next((a for a in session.get("attempts",[])
        if a.get("id")==plan.get("source_attempt_id")),None)
    if (not source_attempt or source_attempt.get("id")!=
        session.get("current_attempt_id") and
        # Once a job is queued, current_attempt_id is the NEW attempt; the
        # immutable plan source is its verified parent.
        source_attempt.get("id")!=next((a.get("parent_id")
          for a in session.get("attempts",[])
          if a.get("id")==session.get("current_attempt_id")),"")):
        fail("review_source_attempt_not_current_parent")
    if (source_attempt.get("artifact_id")!=source_file or
        not isinstance(source_attempt.get("number"),int)):
        fail("review_source_artifact_changed")
    if source_attempt["number"]==1:
        if source_file!=original_file:
            fail("original_drive_media_not_verified")
    else:
        if source_file==original_file:
            fail("review_revised_source_must_be_separate")
        source_row=select_one(client,ATTEMPTS,"Attempt_ID",
                              source_attempt["id"])
        sf=source_row["fields"]
        try:
            validated=json.loads(sf.get("Validation_Evidence_JSON") or "null")
        except (TypeError,ValueError):
            fail("review_source_validation_missing")
        if (sf.get("Session_ID")!=session["id"] or
            sf.get("Output_Record_ID")!=output_id or
            sf.get("Attempt_Number")!=source_attempt["number"] or
            sf.get("Artifact_File_ID")!=source_file or
            sf.get("Attempt_Status")!="ready_for_review" or
            not isinstance(validated,dict) or
            not SHA.fullmatch(str(validated.get("sha256") or "")) or
            validated.get("byte_count",0)<100000 or
            validated.get("mime_type")!="video/mp4" or
            validated.get("width")!=1080 or validated.get("height")!=1920 or
            validated.get("audio_verified") is not True or
            validated.get("watermark_verified") is not True or
            validated.get("google_drive_verified") is not True):
            fail("review_source_attempt_validation_unverified")
    meta=drive.get_file(source_file)
    if (meta.get("id")!=source_file or
        meta.get("mimeType")!="video/mp4" or
        (source_attempt["number"]>1 and
         int(meta.get("size") or 0)!=validated["byte_count"])):
        fail("source_drive_media_not_verified")
    props=json.loads(of.get("Remotion_Props_JSON") or "{}")
    if props.get("compositionId")!="ChicagoShiningPhotoSequence":
        fail("source_composition_mismatch")
    source={"verified":True,"authority":"server","output_id":output_id,
       "attempt_id":plan["source_attempt_id"],
       "artifact_id":plan["source_artifact_id"],
       "drive_file_id":source_file,
       "canonical_media_authority":"google_drive",
       "composition_id":"ChicagoShiningPhotoSequence"}
    original_by_id={x.get("id"):x for x in originals}
    return out,item,req,props,plan,source,original_by_id

def _render_sources(client,request,original_by_id,props,plan):
    # The original Production Request owns BOTH the master asset and the
    # approved 9:16 crop. The original Remotion props prove which crop was
    # actually rendered for V1. Neither may be substituted by the Producer.
    try:
        variants=json.loads(request["fields"].get("Studio_Variant_Manifest_JSON") or "null")
    except (TypeError,ValueError):
        fail("review_variant_manifest_unreadable")
    if (not isinstance(variants,dict) or variants.get("complete") is not True or
        variants.get("production_request_record_id")!=request.get("id") or
        not isinstance(variants.get("assets"),list)):
        fail("review_variant_manifest_unverified")
    by_asset={}
    for variant in variants["assets"]:
        if not isinstance(variant,dict) or variant.get("id") in by_asset:
            fail("review_variant_manifest_duplicate")
        by_asset[variant["id"]]=variant
    all_clips=props.get("clips")
    if not isinstance(all_clips,list):fail("source_render_props_no_clips")
    clips_by_record={c.get("mediaAssetRecordId"):c for c in all_clips}
    assets=[]
    for frozen in plan.get("asset_manifest",[]):
        asset_id=frozen.get("asset_id")
        source=original_by_id.get(asset_id)
        if (not isinstance(source,dict) or
            source.get("google_drive_file_id")!=frozen.get("drive_file_id")):
            fail("review_source_asset_changed")
        record_id=source.get("media_asset_record_id")
        if not RECORD.fullmatch(str(record_id or "")):
            fail("review_source_record_invalid")
        row=client.get_record(MEDIA,record_id)
        f=row["fields"]
        if (row.get("id")!=record_id or
            f.get("Google Drive File ID")!=frozen["drive_file_id"] or
            f.get("Rights_Status")!="Owned" or
            f.get("Asset_Status")!="Available" or
            f.get("Active") is not True or f.get("Do_Not_Use") is True or
            one_link(f.get("Content_Profile"))!=CHICAGO):
            fail("review_source_rights_or_profile_lost")
        clip=clips_by_record.get(record_id)
        master_variant=by_asset.get(asset_id)
        if not clip or not isinstance(master_variant,dict):
            fail("source_asset_not_in_original_render")
        crop=(master_variant.get("variants") or {}).get("9:16")
        if not isinstance(crop,dict):
            fail("review_approved_crop_missing")
        url=str(clip.get("url") or clip.get("src") or "")
        variant_file=str(crop.get("google_drive_file_id") or "")
        if (master_variant.get("media_asset_record_id")!=record_id or
            master_variant.get("google_drive_file_id")!=frozen["drive_file_id"] or
            crop.get("preview_status")!="Ready" or
            not IDENTITY.fullmatch(variant_file) or
            variant_file!=frozen.get("render_variant_drive_file_id") or
            variant_file!=clip.get("googleDriveFileId") or
            url!=crop.get("preview_url") or
            url!=frozen.get("render_url") or
            url!=str(clip.get("src") or clip.get("url") or "") or
            not url.startswith("https://media.chicagoshining.com/studio/previews/item4/") or
            clip.get("mediaAssetRecordId")!=record_id):
            fail("review_render_crop_not_verified")
        # Check actual renderer-readable bytes; never pass a Google Drive HTML
        # viewer URL as an image source. Do not edit or reshare originals.
        try:
            with requests.get(url,timeout=20,stream=True,allow_redirects=False) as r:
                if r.status_code!=200 or not r.headers.get("Content-Type","").startswith("image/"):
                    fail("review_image_cache_unavailable")
                chunk=next(r.iter_content(chunk_size=1024),b"")
                if not (chunk.startswith(b"\xff\xd8") or chunk.startswith(b"\x89PNG")):
                    fail("review_image_not_binary")
        except requests.RequestException as exc:
            raise ExactReviewRenderDenied("review_image_cache_unavailable") from exc
        assets.append({"asset_id":asset_id,"verified":True,"authority":"server",
          "canonical_media_authority":"google_drive",
          "drive_file_id":frozen["drive_file_id"],
          "rights_receipt_id":frozen["rights_receipt_id"],
          "profile_id":CHICAGO,"media_kind":"image","render_url":url})
    return assets

def _source_mix(drive,props,output_id):
    """Preserve V1's verified audio mix and caption choice, not a new AI guess.

    Read the canonical, already rendered Output Remotion props. The music file
    must still exist in Drive and must resolve to the exact URL V1 used.
    No source, publish or production-request fields are modified.
    """
    if not isinstance(props,dict) or type(props.get("spokenCaptionsEnabled")) is not bool:
        fail("original_spoken_caption_policy_missing")
    music=props.get("music")
    if not isinstance(music,dict) or not isinstance(music.get("url"),str):
        fail("original_music_mix_missing")
    url=music["url"]
    parsed=urlsplit(url)
    query=parse_qs(parsed.query)
    files=query.get("id") or []
    if (parsed.scheme!="https" or parsed.netloc!="drive.google.com" or
        parsed.path!="/uc" or query.get("export")!=["download"] or
        len(files)!=1 or not IDENTITY.fullmatch(files[0]) or parsed.fragment):
        fail("original_music_source_untrusted")
    if set(music) - {"url","volume","duckingEnabled","duckingMultiplier",
                      "duckFadeFrames","fadeInFrames","fadeOutFrames",
                      "startFromSeconds"}:
        fail("original_music_mix_schema_changed")
    if (type(music.get("volume")) not in (float,int) or
        not 0<=music["volume"]<=1):
        fail("original_music_volume_untrusted")
    details=drive.get_file(files[0])
    if (details.get("id")!=files[0] or
        not str(details.get("mimeType") or "").startswith("audio/")):
        fail("original_music_drive_not_verified")
    return {"verified":True,"authority":"server",
            "output_id":output_id,"music":dict(music),
            "music_drive_file_id":files[0],
            "spoken_captions_enabled":props["spokenCaptionsEnabled"],
            "spoken_caption_words_per_page":int(props.get("spokenCaptionWordsPerPage") or 4)}


def _voiceover(client,drive,item,plan,claim):
    spoken=plan["creative"]["narration"]
    voice_id=resolve_content_voice_id(item)
    audio=synthesize_voiceover_by_id(spoken,voice_id=voice_id)
    _,normalized=normalize_voiceover(audio,filename="review-"+claim["attempt_id"]+".mp3")
    seconds=probe_audio_duration_bytes(normalized)
    target=float(plan["creative"]["target_duration_seconds"])
    if not 1<=seconds<=180 or abs(seconds-target)>2.5:
        fail("review_voiceover_duration_requires_revision")
    uploaded=drive.upload_file(VOICEOVER_DRIVE_FOLDER_ID,
       "review-"+claim["attempt_id"]+".mp3",normalized,"audio/mpeg")
    file_id=str(uploaded.get("id") or "")
    if not file_id or drive.get_file(file_id).get("mimeType")!="audio/mpeg":
        fail("review_voiceover_drive_readback_failed")
    drive.share_anyone_reader(file_id)
    return {"verified":True,"authority":"server",
        "output_id":claim["output_id"],"attempt_id":claim["attempt_id"],
        "plan_hash":claim["plan_hash"],
        "narration_sha256":hashlib.sha256(spoken.encode()).hexdigest(),
        "canonical_media_authority":"google_drive",
        "drive_file_id":file_id,"duration_seconds":seconds,
        "audio_url":f"https://drive.google.com/uc?export=download&id={file_id}"}

def _validate_mp4(content,expected_duration):
    if not content or len(content)<100000:fail("render_mp4_empty")
    with tempfile.TemporaryDirectory(prefix="review-pilot-") as folder:
        p=Path(folder)/"attempt.mp4";p.write_bytes(content)
        result=subprocess.run(["ffprobe","-v","error","-show_entries",
          "stream=codec_type,width,height:format=duration","-of","json",str(p)],
          capture_output=True,text=True,timeout=30,check=True)
    details=json.loads(result.stdout)
    tracks=details.get("streams") or []
    video=[x for x in tracks if x.get("codec_type")=="video"]
    audio=[x for x in tracks if x.get("codec_type")=="audio"]
    duration=float((details.get("format") or {}).get("duration") or 0)
    if not video or not audio or video[0].get("width")!=1080 or (
        video[0].get("height")!=1920) or abs(duration-expected_duration)>2.5:
        fail("render_mp4_dimensions_audio_or_duration_invalid")
    return {"sha256":hashlib.sha256(content).hexdigest(),
            "byte_count":len(content),"mime_type":"video/mp4",
            "width":1080,"height":1920,"duration_seconds":duration,
            "audio_verified":True}

def _complete(worker,secret,claim,stage,**extra):
    body={k:claim[k] for k in ("output_id","job_id","attempt_id",
       "plan_hash","lease_owner","lease_fence")}
    body.update(stage=stage,**extra)
    receipt=_post_once(worker,secret,"/api/internal/rendering-review/complete-attempt",body)
    if receipt.get("stage")!=stage or receipt.get("attempt_id")!=claim["attempt_id"]:
        fail("render_completion_receipt_mismatch")
    return receipt

def render_exact_attempt(output_id,job_id,*,client=None,drive=None,
                         renderer=None,worker_base=None,shared_secret=None):
    """Do exactly one claimed job, with no retry after uncertain acceptance."""
    if os.environ.get("RENDERING_REVIEW_EXACT_RENDER_ENABLED")!="true":
        fail("review_exact_render_not_enabled")
    if (not RECORD.fullmatch(str(output_id)) or
        not IDENTITY.fullmatch(str(job_id)) or
        output_id!=os.environ.get("RENDERING_REVIEW_EXACT_OUTPUT_ID")):
        fail("review_output_not_allowlisted")
    worker=worker_base or os.environ.get("RENDERING_REVIEW_WORKER_BASE_URL","")
    secret=shared_secret or os.environ.get("RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET","")
    if len(secret)<24:fail("review_runner_secret_unconfigured")
    worker=_validate_base(worker)
    client=client or AirtableClient()
    drive=drive or GoogleDriveClient()
    output,item,req,props,plan,source,originals=_evidence(client,drive,output_id,job_id)
    assets=_render_sources(client,req,originals,props,plan)
    mix=_source_mix(drive,props,output_id)
    # Claim only the requested exact job. No scanning and no broad scheduler.
    request_id="rrclaim_"+hashlib.sha256(
        ("chicago-pilot-v1|"+output_id+"|"+job_id).encode()).hexdigest()[:48]
    claim=_post_once(worker,secret,"/api/internal/rendering-review/claim-render-job",
        {"output_id":output_id,"job_id":job_id,
         "client_request_id":request_id})
    if (claim.get("lease_verified") is not True or
        claim.get("output_id")!=output_id or claim.get("job_id")!=job_id or
        claim.get("plan_hash")!=plan.get("plan_hash") or
        not IDENTITY.fullmatch(str(claim.get("attempt_id") or "")) or
        claim.get("attempt_id")==plan.get("source_attempt_id")):
        fail("review_claim_unverified")
    # The claimed ID is the new attempt, NOT the frozen source attempt.
    job={"state":"claimed","lease_verified":True,
         **{k:claim[k] for k in ("output_id","job_id","attempt_id",
         "plan_hash","session_id","lease_owner","lease_fence")}}
    narration=_voiceover(client,drive,item,plan,claim)
    brand_url=brand_watermark_url(client)
    if not brand_url.startswith("https://"):
        fail("review_watermark_url_unavailable")
    watermark={"verified":True,"authority":"server",
        "profile_id":CHICAGO,"policy":"retain_current_approved",
        "url":brand_url}
    renderer_base=_review_renderer_base()
    renderer=renderer or RemotionClient(renderer_base)
    ledger=RemoteLaunchLedger(worker_base=worker,shared_secret=secret,claim=claim)
    result=launch_review_render_once(job=job,plan=plan,source=source,
        resolved_assets=assets,voiceover=narration,watermark=watermark,
        source_mix=mix,
        observed_source_segments=[],operations=ledger,renderer=renderer,
        renderer_base=renderer_base)
    if result.get("ok") is not True:fail("review_launch_requires_reconciliation")
    _complete(worker,secret,claim,"started")
    status_url=result["status_url"]
    payload=None
    for _ in range(100):
        raw=renderer.get_status(status_url)
        payload=raw.get("data") if isinstance(raw.get("data"),dict) else raw
        state=str(payload.get("status") or "").lower()
        if state in FINAL_STATUSES and payload.get("renderUrl"):break
        if state in {"error","failed","cancelled"}:
            fail("review_remotion_render_failed")
        time.sleep(5)
    else:
        fail("review_remotion_status_unconfirmed")
    if payload.get("jobId") and payload["jobId"]!=result["remotion_job_id"]:
        fail("review_remotion_wrong_job")
    _complete(worker,secret,claim,"validating")
    mp4=renderer.download_render(payload["renderUrl"])
    validation=_validate_mp4(mp4,float(plan["creative"]["target_duration_seconds"]))
    folder=get_google_drive_folder_id(client)
    name=f"review-{output_id}-{claim['attempt_id']}.mp4"
    uploaded=drive.upload_file(folder,name,mp4,"video/mp4")
    file_id=str(uploaded.get("id") or "")
    meta=drive.get_file(file_id)
    if (not file_id or file_id==source["drive_file_id"] or
        meta.get("id")!=file_id or meta.get("mimeType")!="video/mp4" or
        int(meta.get("size") or 0)!=len(mp4)):
        fail("review_attempt2_drive_upload_unverified")
    validation.update(google_drive_verified=True,google_drive_mime_type="video/mp4",
      watermark_verified=True, # Built-in watermarkRequired Remotion composition.
      render_job_id=result["remotion_job_id"])
    receipt=_complete(worker,secret,claim,"ready",
        artifact_id=file_id,validation=validation)
    return {"ok":True,"state":"ready_for_review","output_id":output_id,
       "attempt_id":claim["attempt_id"],"job_id":job_id,
       "remotion_job_id":result["remotion_job_id"],
       "drive_file_id":file_id,
       "original_file_id":source["drive_file_id"],
       "public_post_created":False,"receipt":receipt}
