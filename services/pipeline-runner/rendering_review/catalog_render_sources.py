"""Independently bind a held revision's Asset Manager photo to its original Drive
master and exact completed 9:16 crop. Never reads output navigation profile.

No Drive/Airtable writes, no render launch, no fallback to a similarly named
media file. Every identifying value in the frozen plan is an untrusted claim
until checked against canonical Media Assets, transfer-queue and file bytes.
"""
from __future__ import annotations
from io import BytesIO
import hashlib
import re
import requests
from PIL import Image, UnidentifiedImageError

CHICAGO="recT2rbKX3MF7cVFU"
MEDIA="tblSITCujCsJTNcDe"
QUEUE="tblBZLXPd1p2NRWRK"
RECORD=re.compile(r"rec[A-Za-z0-9]{14}\Z")
IDENTITY=re.compile(r"[A-Za-z0-9_-]{16,}\Z")
ALLOWED_MIME={"image/jpeg","image/png","image/webp"}
MAX_SOURCE=30_000_000


class CatalogSourceDenied(RuntimeError):
    pass


def deny(reason):
    raise CatalogSourceDenied(reason)


def only_link(value):
    if isinstance(value,list) and len(value)==1:
        item=value[0]
        if isinstance(item,dict):
            item=item.get("id")
        if isinstance(item,str) and RECORD.fullmatch(item):
            return item
    return None


def eligible(row, identity, drive_id, *, allowed_class="Image"):
    if not RECORD.fullmatch(str(identity)) or row.get("id")!=identity:
        deny("catalog_media_record_changed")
    f=row.get("fields") or {}
    if(f.get("Media_Class")!=allowed_class or f.get("Asset_Status")!="Available" or
       f.get("Rights_Status")!="Owned" or f.get("Active") is not True or
       f.get("Do_Not_Use") is True or
       only_link(f.get("Content_Profile"))!=CHICAGO or
       f.get("Google Drive File ID")!=drive_id):
        deny("catalog_media_rights_or_profile_changed")
    return f


def image_bytes(drive, file_id, *, expected_size=None, crop=False):
    if not IDENTITY.fullmatch(str(file_id or "")):
        deny("catalog_drive_file_invalid")
    meta=drive.get_file(file_id)
    if(not isinstance(meta,dict) or meta.get("id")!=file_id or
       meta.get("trashed") is True or
       meta.get("mimeType") not in ALLOWED_MIME):
        deny("catalog_drive_metadata_invalid")
    size=int(meta.get("size") or 0)
    if(size<128 or size>MAX_SOURCE or
       expected_size is not None and size!=expected_size):
        deny("catalog_drive_size_changed")
    media,mime=drive.download_file(file_id)
    if(not isinstance(media,bytes) or len(media)!=size or
       mime!=meta["mimeType"] or
       not media.startswith((b"\xff\xd8\xff",b"\x89PNG\r\n\x1a\n",
                             b"RIFF"))):
        deny("catalog_drive_binary_invalid")
    try:
        with Image.open(BytesIO(media)) as image:
            if(image.format not in ("JPEG","PNG","WEBP") or
               (crop and image.size!=(1080,1920)) or
               not (128<=image.width<=12000 and 128<=image.height<=12000)):
                deny("catalog_image_dimensions_invalid")
            image.verify()
    except (OSError,ValueError,UnidentifiedImageError) as exc:
        raise CatalogSourceDenied("catalog_image_decode_invalid") from exc
    return media


def verify_catalog_render_source(client,drive,frozen,*,transport=requests.get):
    if not isinstance(frozen,dict) or frozen.get("origin")!="review_library":
        deny("catalog_manifest_origin_invalid")
    record_id=frozen.get("source_media_record_id")
    crop_record=frozen.get("variant_media_record_id")
    transfer_id=frozen.get("variant_transfer_record_id")
    req_id=frozen.get("source_request_id")
    asset_id=frozen.get("source_asset_id")
    source=frozen.get("drive_file_id")
    crop=frozen.get("render_variant_drive_file_id")
    source_size=frozen.get("source_size_bytes")
    if(not all(RECORD.fullmatch(str(x or "")) for x in
               (record_id,crop_record,transfer_id,req_id)) or
       not all(IDENTITY.fullmatch(str(x or "")) for x in (source,crop)) or
       frozen.get("asset_id")!="library_"+record_id or
       frozen.get("profile_id")!=CHICAGO or
       frozen.get("media_type")!="image" or
       frozen.get("crop_recipe") not in ("fill-crop-v2","graphic-fit-v1") or
       frozen.get("rights_receipt_id")!="rrcatalogrights_"+record_id or
       not re.fullmatch(r"[A-Za-z0-9_-]{8,120}",str(asset_id or "")) or
       type(source_size) is not int or source_size<1024 or
       source_size>MAX_SOURCE):
        deny("catalog_frozen_identity_invalid")
    media_class=frozen.get("source_media_class","Image")
    if media_class not in ("Image","Graphic"):
        deny("catalog_master_class_invalid")
    master=eligible(client.get_record(MEDIA,record_id),record_id,source,
                    allowed_class=media_class)
    if media_class=="Graphic" and master.get("MIME_Type")!="image/jpeg":
        deny("catalog_graphic_source_not_jpeg")
    if(master.get("File_Size_Bytes")!=source_size):
        deny("catalog_master_size_changed")
    queue=client.get_record(QUEUE,transfer_id)
    if queue.get("id")!=transfer_id:
        deny("catalog_transfer_record_changed")
    q=queue.get("fields") or {}
    recipe="graphic-fit-v1" if media_class=="Graphic" else "fill-crop-v2"
    style="graphic_fit" if media_class=="Graphic" else "center"
    if(q.get("Asset_Kind")!="Platform Variant" or
       q.get("Aspect_Ratio")!="9:16" or
       q.get("Variant_Style")!=style or
       q.get("Transfer_Status")!="Ready" or
       q.get("Preview_Status")!="Ready" or
       only_link(q.get("Source_Media_Asset"))!=record_id or
       q.get("Source_Drive_File_ID")!=source or
       q.get("Source_Size_Bytes")!=source_size or
       q.get("Source_Asset_ID")!=asset_id or
       q.get("Production_Request_Record_ID")!=req_id or
       q.get("Drive_File_ID")!=crop or
       only_link(q.get("Generated_Media_Asset"))!=crop_record or
       frozen.get("crop_recipe")!=recipe or
       q.get("Transfer_ID")!=("ITEM4-VARIANT-"+recipe+"-"+req_id+
                             "-"+asset_id+"-9x16") or
       not str(q.get("Target_File_Name") or "").endswith("9x16__"+recipe+".jpg")):
        deny("catalog_transfer_provenance_changed")
    derived=eligible(client.get_record(MEDIA,crop_record),crop_record,crop)
    if derived.get("MIME_Type")!="image/jpeg":
        deny("catalog_variant_mime_changed")
    expected_url=("https://media.chicagoshining.com/studio/previews/item4/"+
                  req_id+"/ITEM4-VARIANT-"+recipe+"-"+req_id+"-"+
                  asset_id+"-9x16-"+crop+".jpg")
    if(q.get("Preview_URL")!=expected_url or
       frozen.get("render_url")!=expected_url):
        deny("catalog_preview_provenance_changed")
    image_bytes(drive,source,expected_size=source_size)
    cropped=image_bytes(drive,crop,crop=True)
    # An R2 preview cannot be treated as the approved Drive crop merely
    # because its URL looks right. It must return the same exact binary.
    try:
        with transport(expected_url,timeout=20,stream=True,allow_redirects=False) as reply:
            if(reply.status_code!=200 or
               not reply.headers.get("Content-Type","").startswith("image/")):
                deny("catalog_preview_unavailable")
            binary=bytearray()
            for chunk in reply.iter_content(chunk_size=65536):
                binary.extend(chunk)
                if len(binary)>len(cropped):
                    deny("catalog_preview_binary_changed")
    except requests.RequestException as exc:
        raise CatalogSourceDenied("catalog_preview_unavailable") from exc
    if(hashlib.sha256(binary).digest()!=hashlib.sha256(cropped).digest() or
       len(binary)!=len(cropped)):
        deny("catalog_preview_binary_changed")
    return {"asset_id":frozen["asset_id"],"verified":True,"authority":"server",
        "canonical_media_authority":"google_drive","drive_file_id":source,
        "rights_receipt_id":frozen["rights_receipt_id"],
        "profile_id":CHICAGO,"media_kind":"image","render_url":expected_url}
