"""Read-only, server-authenticated streaming of exact profile-owned review media.

Google OAuth remains on the existing Pipeline Runner. No public Drive sharing,
new credentials or original-asset writes are required. Worker independently
checks the reviewer and exact attempt before requesting this route.
"""
from __future__ import annotations
import hmac
import json
import os
import re

import requests
from flask import Blueprint, Response, jsonify, request, stream_with_context
# Narrow table constants mirror the deployed one-Job and Worker contracts.
# Avoid importing render/FFmpeg/voiceover services just to read private bytes.
OUTPUTS="tblrlPeboBthkplH0"
SESSIONS="tblHX3UdoNszkoquG"
ATTEMPTS="tbl7wPOAE26o2coMU"
ITEMS="tblwzN9AXWvmKVKPs"
CHICAGO="recT2rbKX3MF7cVFU"

def _client():
    from airtable.client import AirtableClient
    return AirtableClient()

def _drive():
    from integrations.google_drive import GoogleDriveClient
    return GoogleDriveClient()

_RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
_ID = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
_FILE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")

def create_review_media_blueprint(settings, client_factory=_client,
                                  drive_factory=_drive, transport=None):
    blueprint=Blueprint("review_exact_media",__name__)
    transport=transport or requests.get
    def denied(status,code):
        return jsonify(ok=False,error=code),status
    def one(client,table,key,value):
        rows=client.list_records(table,formula='{'+key+'}="'+value+'"',max_records=2)
        return rows[0] if len(rows)==1 else None

    @blueprint.route("/jobs/rendering-review/attempt-media/<output_id>/<attempt_id>",methods=["GET","HEAD"])
    def attempt_media(output_id,attempt_id):
        secret=str(settings.get("pipeline_runner_shared_secret") or "").strip()
        incoming=request.headers.get("X-Pipeline-Secret","")
        if not secret or not incoming or not hmac.compare_digest(secret,incoming):
            return denied(401,"review_media_auth_required")
        if (not _RECORD.fullmatch(output_id) or
            not _ID.fullmatch(attempt_id)):
            # Exact output, owning profile and attempt are verified from the
            # authenticated durable review session below.
            return denied(403,"review_media_exact_output_required")
        try:
            client=client_factory()
            row=one(client,SESSIONS,"Output_Record_ID",output_id)
            sf=row.get("fields",{}) if row else {}
            session=json.loads(sf.get("Session_JSON") or "{}")
            hold=session.get("review_hold") or {}
            of=(client.get_record(OUTPUTS,output_id) or {}).get("fields",{})
            content_link=of.get("Content_Item")
            profile=session.get("profile_id")
            chicago_legacy=(profile==CHICAGO and
                of.get("Platform")=="Instagram" and
                of.get("Platform_Output_Type")=="Instagram Reel")
            # Read-only preview is independently fenced on Runner, not merely
            # exposed by the Studio Worker. No foreign city can piggyback
            # on Chicago's original pilot entitlement.
            global_flags=(
                "RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
                "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED",
                "RENDERING_REVIEW_INTEGRATION_VERIFIED",
                "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED",
                "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED",
                "RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED",
                "RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED",
            )
            global_enabled=all(os.environ.get(name)=="true" for name in global_flags)
            platform=session.get("platform") or ("Instagram" if chicago_legacy else None)
            output_type=session.get("output_type") or (
                "Instagram Reel" if chicago_legacy else None)
            identity_ok=(session.get("schema")=="studio.render-review.1" and
                session.get("id")==sf.get("Session_ID") and
                session.get("output_id")==output_id and
                _RECORD.fullmatch(str(profile or "")) is not None and
                (chicago_legacy or global_enabled) and
                sf.get("Row_Version")==session.get("version") and
                platform==of.get("Platform") and
                output_type==of.get("Platform_Output_Type") and
                not any(of.get(k) for k in ("Published_At","Platform_Post_ID",
                    "Platform_Media_ID","Platform_Post_URL","Publish_Started_At",
                    "Publish_Locked_At","Publish_Locked_By")) and
                isinstance(content_link,list) and len(content_link)==1)
            # The original route only streamed while the review hold existed.
            # After the verified V2-to-Factory handoff that hold is intentionally
            # released. Permit the *same selected artifact* for Factory review,
            # without permitting unapproved media or arbitrary Drive IDs.
            held=(hold.get("active") is True and
                of.get("Studio_Render_Review_Hold_Active") is True and
                of.get("Studio_Render_Review_Hold_ID")==hold.get("id") and
                of.get("Studio_Render_Review_Hold_Owner")==session.get("id") and
                of.get("Studio_Render_Review_Session_ID")==session.get("id") and
                of.get("Do_Not_Publish") is True)
            transfer=session.get("factory_handoff") or {}
            factory=(session.get("state")=="approved" and
                hold.get("active") is False and
                transfer.get("status")=="ready_for_factory_approval" and
                session.get("approved_attempt_id")==attempt_id and
                session.get("current_attempt_id")==attempt_id and
                transfer.get("attempt_id")==attempt_id and
                not of.get("Studio_Render_Review_Hold_Active") and
                not of.get("Studio_Render_Review_Hold_ID") and
                not of.get("Studio_Render_Review_Hold_Owner") and
                not of.get("Studio_Render_Review_Session_ID") and
                not of.get("Do_Not_Publish") and
                not of.get("Auto_Publish_Enabled") and
                of.get("Output_Status")=="Ready for Review" and
                of.get("Review_Status")=="Review Sent" and
                of.get("Publish_Status")=="Not Ready" and
                not of.get("Scheduled_Post_Date") and
                not of.get("Studio_Scheduled_At"))
            if not identity_ok or not (held or factory):
                return denied(409,"review_media_hold_unverified")
            content=(client.get_record(ITEMS,content_link[0]) or {}).get("fields",{})
            if content.get("Content_Profile")!=[profile]:
                return denied(403,"review_media_wrong_profile")
            attempts=session.get("attempts") or []
            selected=next((a for a in attempts if a.get("id")==attempt_id),None)
            if (not selected or type(selected.get("number")) is not int or
                selected["number"]<2 or selected.get("status")!="ready_for_review" or
                not _FILE.fullmatch(str(selected.get("artifact_id") or ""))):
                return denied(409,"review_media_attempt_unready")
            ar=one(client,ATTEMPTS,"Attempt_ID",attempt_id)
            af=ar.get("fields",{}) if ar else {}
            file_id=selected["artifact_id"]
            if factory and (
                transfer.get("artifact_id")!=file_id or
                of.get("Final_File_ID")!=file_id or
                of.get("Final_File_URL")!="https://drive.google.com/file/d/"+file_id+"/view"):
                return denied(409,"review_media_factory_asset_mismatch")
            if (af.get("Attempt_ID")!=attempt_id or
                af.get("Output_Record_ID")!=output_id or
                af.get("Session_ID")!=session.get("id") or
                af.get("Attempt_Number")!=selected["number"] or
                af.get("Attempt_Status")!="ready_for_review" or
                af.get("Artifact_File_ID")!=file_id):
                return denied(409,"review_media_artifact_changed")
        except Exception:
            return denied(503,"review_media_authority_unavailable")

        # Use the Runner's already configured Google Drive OAuth. No file ID,
        # Google credential or downloadable link is returned to the browser.
        try:
            drive=drive_factory()
            token=drive.access_token()
            headers={"Authorization":"Bearer "+token,"Accept":"video/mp4,video/*"}
            requested_range=request.headers.get("Range","")
            if requested_range:
                if not re.fullmatch(r"bytes=\d+-\d*",requested_range):
                    return denied(416,"invalid_media_range")
                headers["Range"]=requested_range
            if request.method=="HEAD":
                headers["Range"]="bytes=0-0"
            upstream=transport(
                "https://www.googleapis.com/drive/v3/files/"+file_id,
                params={"alt":"media","supportsAllDrives":"true"},
                headers=headers,timeout=(10,90),stream=True,allow_redirects=True)
        except Exception:
            return denied(502,"review_media_google_unavailable")
        if upstream.status_code not in (200,206):
            upstream.close()
            return denied(502,"review_media_google_unavailable")
        mime=(upstream.headers.get("Content-Type") or "").split(";")[0].lower().strip()
        if mime not in ("video/mp4","application/octet-stream"):
            upstream.close()
            return denied(502,"review_media_not_mp4")
        out_headers={"Content-Type":"video/mp4","Accept-Ranges":"bytes",
                     "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
        for name in ("Content-Length","Content-Range"):
            value=upstream.headers.get(name)
            if value:out_headers[name]=value
        if request.method=="HEAD":
            cr=upstream.headers.get("Content-Range","")
            match=re.search(r"/(\d+)$",cr)
            if match:out_headers["Content-Length"]=match.group(1)
            out_headers.pop("Content-Range",None)
            upstream.close()
            return Response(status=200,headers=out_headers)
        def chunks():
            try:
                for chunk in upstream.iter_content(chunk_size=256*1024):
                    if chunk:yield chunk
            finally:
                upstream.close()
        return Response(stream_with_context(chunks()),status=upstream.status_code,
                        headers=out_headers,direct_passthrough=True)
    return blueprint
