"""Resolve the exact Content Profile's owned Drive watermark, never Chicago by default.

Airtable is the authoritative profile/catalog source; Google Drive is the
media authority. This resolver is read-only. No missing city watermark can be
'fixed' by falling back to another brand or by using a browser URL.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from airtable.constants import CONTENT_PROFILES_TABLE,MEDIA_ASSETS_TABLE
from render.fields import field,field_str,linked_ids

RECORD=re.compile(r"rec[A-Za-z0-9]{14}\Z")
DRIVE=re.compile(r"[A-Za-z0-9_-]{20,}\Z")

class ProfileWatermarkUnavailable(ValueError):
    pass

def denied(reason):
    raise ProfileWatermarkUnavailable(reason)

def _select(v):
    if isinstance(v,dict):return str(v.get("name") or "")
    return str(v or "")

def resolve_profile_watermark(*,client:Any,drive:Any,profile_id:str)->dict:
    if not RECORD.fullmatch(str(profile_id or "")):
        denied("profile_identity_invalid")
    if not callable(getattr(client,"get_record",None)) or not callable(
        getattr(client,"list_records",None)
    ) or not callable(getattr(drive,"download_file",None)) or not callable(
        getattr(drive,"get_file",None)
    ):
        denied("profile_watermark_authoritative_clients_required")
    profile=client.get_record(CONTENT_PROFILES_TABLE,profile_id)
    if profile.get("id")!=profile_id or not field_str(profile,"Profile_Name"):
        denied("profile_not_authoritative")
    # Airtable linked-record fields return record IDs; don't use their display
    # names to infer or authorize tenant membership.
    candidates=client.list_records(MEDIA_ASSETS_TABLE,
       formula='AND({Asset_Role}="Watermark",{Asset_Status}="Available")',
       max_records=200)
    if not isinstance(candidates,list) or len(candidates)>=200:
        denied("profile_watermark_catalog_unbounded")
    selected=[]
    for r in candidates:
        if (not isinstance(r,dict) or
            linked_ids(field(r,"Content_Profile"))!=[profile_id] or
            _select(field(r,"Asset_Role"))!="Watermark" or
            _select(field(r,"Asset_Status"))!="Available" or
            _select(field(r,"Rights_Status"))!="Owned" or
            field(r,"Active") is not True or field(r,"Do_Not_Use") is True or
            field_str(r,"MIME_Type")!="image/png"):
            continue
        file_id=field_str(r,"Google Drive File ID")
        if not DRIVE.fullmatch(file_id):continue
        selected.append(r)
    # For Chicago, the small watermark is preferred over the large. No
    # arbitrary first-record wins when more than one candidate exists.
    small=[x for x in selected if "_watermark_small." in
           field_str(x,"Asset Name").casefold()]
    if len(small)==1:
        target=small[0]
    elif len(selected)==1:
        target=selected[0]
    else:
        denied("profile_watermark_missing_or_ambiguous")
    fid=field_str(target,"Google Drive File ID")
    meta=drive.get_file(fid)
    if not isinstance(meta,dict) or meta.get("id")!=fid or (
        meta.get("mimeType")!="image/png" or meta.get("trashed") is True
    ):
        denied("profile_watermark_drive_metadata_invalid")
    content,mime=drive.download_file(fid)
    if mime!="image/png" or not isinstance(content,bytes) or (
        len(content)<128 or not content.startswith(b"\x89PNG\r\n\x1a\n")
    ):
        denied("profile_watermark_not_png")
    return {"bytes":content,
      "receipt":{"verified":True,"authority":"server",
        "profile_id":profile_id,"media_authority":"google_drive",
        "media_asset_record_id":target["id"],"drive_file_id":fid,
        "sha256":hashlib.sha256(content).hexdigest()}}


def require_owned_profile_watermark_url(*,client:Any,drive:Any,
                                        profile_id:str,url:str)->dict:
    """Bind a Remotion source watermark to THIS profile's owned catalog asset.

    A Drive file merely being accessible is not ownership evidence. Source
    props may refer to a different Shining city or a stale, untracked image.
    Do not use them to bypass the authoritative Airtable/Drive receipt.
    """
    from urllib.parse import urlsplit,parse_qs
    owned=resolve_profile_watermark(client=client,drive=drive,profile_id=profile_id)
    receipt=owned["receipt"]
    if not isinstance(url,str):
        denied("profile_source_watermark_identity_mismatch")
    parsed=urlsplit(url)
    query=parse_qs(parsed.query,keep_blank_values=True)
    if (parsed.scheme!="https" or parsed.netloc!="drive.google.com" or
        parsed.path!="/uc" or parsed.fragment or parsed.username or
        parsed.password or set(query)!={"id","export"} or
        query.get("export")!=["download"] or
        query.get("id")!=[receipt["drive_file_id"]]):
        denied("profile_source_watermark_identity_mismatch")
    return {"url":url,"receipt":receipt}
