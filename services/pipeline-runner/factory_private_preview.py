"""Bounded, authenticated Factory private-preview source transport (#2888).

Reuse the existing Windows Google Drive identity, never accept a raw Drive ID
from the caller, independently verify current Supabase provenance and exact
bytes. Worker owns user authorization and private R2 cache. No DB/provider
writes, public sharing, or change to loopback-only Drive transport.
"""
from __future__ import annotations
import hashlib
import hmac
import threading
from dataclasses import dataclass

import requests
from flask import Blueprint, Response, jsonify, request

PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
MAX_BYTES = 20_000_000

@dataclass(frozen=True)
class Source:
    file_id: str
    sha256: str
    size: int

SPECS = {}
for ids, file_id, digest, size in (
    (("recaV78on0RSfqb31","recgeicEbdlbmQiv5","recy1CzV4MJQycBMq"),
     "1aWyb-OkXhJ9GwWkg3VWruTaivdms6pTL","cde325819144408f3341c23287637f9ab19aed9cd62c69332d91e49dd8d04875",2194946),
    (("recfwDzGh6St6WB9f",),"1KMygA91kqVv2InOcAQbCoy5IvQDjkfgH",
     "a93676f4b1cfa53e22c7cf3b677ceb2136f1366acd74de7f7a80d890d0972d67",895259),
    (("rec1PDreUDoe2AcPV","rec1kjgusW1fX9BOp","recidhGcJSfOlxMsc"),
     "1DlqSVCwMkzUVJ4bFLJDrvals8Bal3imj","f1e5986c31a6032334cd47a1ad6a4555085cdaa0fa3c79b614c915d1ce91af93",17892121),
):
    for oid in ids:
        SPECS[oid] = Source(file_id, digest, size)

SLOT = threading.Lock()
SELECT = ("airtable_record_id,output_status,review_status,publish_status,"
          "do_not_publish,auto_publish_enabled,scheduled_post_date,studio_scheduled_at,"
          "youtube_scheduled_publish_at,published_at,platform_post_url,"
          "platform_publish_response,final_file_url,error_messages")

def read_row(settings, output_id):
    url = str(settings.get("supabase_url") or "").rstrip("/")
    key = str(settings.get("supabase_service_role_key") or "").strip()
    if url != PROJECT or not key or settings.get("studio_write_source") != "supabase":
        raise ValueError("canonical_authority_unavailable")
    with requests.get(url + "/rest/v1/platform_outputs", params={
        "airtable_record_id": "eq." + output_id, "select": SELECT, "limit": 2,
    }, headers={"apikey":key,"Authorization":"Bearer "+key},
        timeout=(5,15), allow_redirects=False) as response:
        if response.status_code != 200:
            raise ValueError("canonical_read_failed")
        rows = response.json()
    return rows[0] if isinstance(rows,list) and len(rows)==1 else None

def eligible(row, oid, source):
    if not isinstance(row,dict) or row.get("airtable_record_id") != oid:
        return False
    em = row.get("error_messages")
    if not isinstance(em,dict):
        return False
    handoff = em.get("SM_2618_Factory_Review_Handoff")
    plan = em.get("SM_2618_Creative_Rework_Plan")
    return (isinstance(handoff,dict) and isinstance(plan,dict)
        and row.get("output_status")=="Ready for Review"
        and row.get("review_status")=="Review Sent"
        and row.get("publish_status")=="Not Ready"
        and row.get("do_not_publish") is False
        and row.get("auto_publish_enabled") is False
        and not any(row.get(k) for k in ("scheduled_post_date","studio_scheduled_at",
          "youtube_scheduled_publish_at","published_at","platform_post_url","platform_publish_response"))
        and row.get("final_file_url")=="https://drive.google.com/file/d/"+source.file_id+"/view"
        and em.get("Final_File_ID")==source.file_id
        and handoff.get("corrected_final_drive_id")==source.file_id
        and handoff.get("candidate_sha256")==source.sha256
        and plan.get("candidate_sha256")==source.sha256
        and handoff.get("human_factory_approval_pending") is True
        and handoff.get("publishing_authorized") is False
        and "SM_2618_Creative_QA_Hold" not in em)

def download_source(source):
    from integrations.google_drive import GoogleDriveClient
    if not 8 <= source.size <= MAX_BYTES:
        raise ValueError("source_size_unbounded")
    token=GoogleDriveClient().access_token()
    with requests.get("https://www.googleapis.com/drive/v3/files/"+source.file_id,
        params={"alt":"media","supportsAllDrives":"true"},
        headers={"Authorization":"Bearer "+token,"Accept":"video/mp4,application/octet-stream"},
        stream=True, timeout=(10,45), allow_redirects=False) as response:
        if response.status_code != 200:
            raise ValueError("source_http_failed")
        mime=(response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if mime not in ("video/mp4","application/octet-stream"):
            raise ValueError("source_mime_invalid")
        data=bytearray()
        for chunk in response.iter_content(256*1024):
            if len(data)+len(chunk)>source.size:
                raise ValueError("source_size_changed")
            data.extend(chunk)
        return bytes(data)

def create_factory_private_preview_blueprint(settings, *, reader=read_row, downloader=download_source):
    bp=Blueprint("factory_private_preview_source",__name__)
    def denied(status,code):
        return jsonify(ok=False,error=code),status,{"Cache-Control":"private, no-store"}

    @bp.get("/jobs/factory/private-preview-source/<output_id>")
    def source_media(output_id):
        secret=str(settings.get("pipeline_runner_shared_secret") or "").strip()
        supplied=request.headers.get("X-Pipeline-Secret","")
        if len(secret)<24 or not supplied or not hmac.compare_digest(secret,supplied):
            return denied(401,"factory_preview_auth_required")
        source=SPECS.get(output_id)
        if not source or request.query_string or request.headers.get("Range") or request.method!="GET":
            return denied(404,"factory_preview_exact_output_required")
        if not SLOT.acquire(blocking=False):
            return denied(429,"factory_preview_source_busy")
        try:
            if not eligible(reader(settings,output_id),output_id,source):
                return denied(409,"factory_preview_source_changed")
            data=downloader(source)
            if (not isinstance(data,bytes) or len(data)!=source.size
                or data[4:8]!=b"ftyp" or hashlib.sha256(data).hexdigest()!=source.sha256):
                return denied(409,"factory_preview_source_bytes_changed")
            if not eligible(reader(settings,output_id),output_id,source):
                return denied(409,"factory_preview_source_changed")
            return Response(data,status=200,headers={
                "Content-Type":"video/mp4","Content-Length":str(len(data)),
                "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
                "X-Factory-Source-Sha256":source.sha256,
            })
        except Exception:
            return denied(503,"factory_preview_source_unavailable")
        finally:
            SLOT.release()
    return bp
