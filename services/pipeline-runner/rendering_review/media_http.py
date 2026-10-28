"""Read-only, server-authenticated streaming of one Chicago review attempt.

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
from airtable.client import AirtableClient
from integrations.google_drive import GoogleDriveClient
from rendering_review.one_job import OUTPUTS, SESSIONS, ATTEMPTS, ITEMS, CHICAGO

_RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
_ID = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
_FILE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")

def create_review_media_blueprint(settings, client_factory=AirtableClient,
                                  drive_factory=GoogleDriveClient, transport=None):
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
            output_id!=os.environ.get("RENDERING_REVIEW_EXACT_OUTPUT_ID") or
            not _ID.fullmatch(attempt_id)):
            return denied(403,"review_media_exact_output_required")
        try:
            client=client_factory()
            row=one(client,SESSIONS,"Output_Record_ID",output_id)
            sf=row.get("fields",{}) if row else {}
            session=json.loads(sf.get("Session_JSON") or "{}")
            hold=session.get("review_hold") or {}
            of=(client.get_record(OUTPUTS,output_id) or {}).get("fields",{})
            content_link=of.get("Content_Item")
            if (session.get("schema")!="studio.render-review.1" or
                session.get("id")!=sf.get("Session_ID") or
                session.get("output_id")!=output_id or
                session.get("profile_id")!=CHICAGO or
                sf.get("Row_Version")!=session.get("version") or
                not hold.get("active") or
                of.get("Studio_Render_Review_Hold_Active") is not True or
                of.get("Studio_Render_Review_Hold_ID")!=hold.get("id") or
                of.get("Studio_Render_Review_Hold_Owner")!=session.get("id") or
                of.get("Studio_Render_Review_Session_ID")!=session.get("id") or
                of.get("Do_Not_Publish") is not True or
                of.get("Platform")!="Instagram" or
                of.get("Platform_Output_Type")!="Instagram Reel" or
                any(of.get(k) for k in ("Published_At","Platform_Post_ID",
                    "Platform_Media_ID","Publish_Started_At","Publish_Locked_At",
                    "Publish_Locked_By")) or
                not isinstance(content_link,list) or len(content_link)!=1):
                return denied(409,"review_media_hold_unverified")
            content=(client.get_record(ITEMS,content_link[0]) or {}).get("fields",{})
            if content.get("Content_Profile")!=[CHICAGO]:
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
                headers=headers,timeout=(10,90),stream=True,allow_redirects=False)
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
