"""Exercise the actual isolated Runner crop binding without importing live clients."""
import ast
import json
import os
import re
import unittest
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace

CHICAGO = "recT2rbKX3MF7cVFU"
MASTER = "1i6YqrXzr8a4D0DfC1QxMYdrkzUYdL976"
CROP = "1DGV7Ql-1hyjrYKdhhCIPxg4JEdg8hZYn"
SOURCE_ID = "fb590a7e933d4eaea4"
MEDIA = "receHeCYd89YrEZrL"
REQUEST = "recEcxgIR0XFI1VVW"
URL = "https://media.chicagoshining.com/studio/previews/item4/approved.jpg"

class Denied(RuntimeError):
    pass

class Stream:
    status_code=200
    headers={"Content-Type":"image/jpeg"}
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def iter_content(self,chunk_size): yield bytes([255,216,255,224])

def tested_function():
    path=Path(__file__).resolve().parents[1]/"rendering_review"/"one_job.py"
    tree=ast.parse(path.read_text(encoding="utf-8"))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="_render_sources")
    namespace={
        "json":json, "RECORD":re.compile(r"rec[A-Za-z0-9]{14}$"),
        "IDENTITY":re.compile(r"[A-Za-z0-9_-]{8,120}$"),
        "CHICAGO":CHICAGO,"MEDIA":"tblSITCujCsJTNcDe",
        "one_link":lambda x:x[0] if isinstance(x,list) and len(x)==1 else "",
        "fail":lambda message:(_ for _ in ()).throw(Denied(message)),
        "ExactReviewRenderDenied":Denied,
        "requests":SimpleNamespace(get=lambda *a,**k:Stream(),RequestException=Exception),
    }
    exec(compile(ast.Module(body=[fn],type_ignores=[]),str(path),"exec"),namespace)
    return namespace["_render_sources"]

def fixture():
    master={SOURCE_ID:{"id":SOURCE_ID,"media_asset_record_id":MEDIA,
                     "google_drive_file_id":MASTER}}
    plan={"asset_manifest":[{"asset_id":SOURCE_ID,"drive_file_id":MASTER,
           "render_variant_drive_file_id":CROP,"render_url":URL,
           "rights_receipt_id":"rrrights_"+MEDIA}]}
    props={"clips":[{"mediaAssetRecordId":MEDIA,"googleDriveFileId":CROP,
                       "url":URL,"src":URL}]}
    request={"id":REQUEST,"fields":{"Studio_Variant_Manifest_JSON":json.dumps({
        "complete":True,"production_request_record_id":REQUEST,
        "assets":[{"id":SOURCE_ID,"media_asset_record_id":MEDIA,
        "google_drive_file_id":MASTER,"variants":{"9:16":{
            "google_drive_file_id":CROP,"preview_status":"Ready",
            "preview_url":URL}}}]})}}
    client=SimpleNamespace(get_record=lambda table,id:{"id":MEDIA,"fields":{
        "Google Drive File ID":MASTER,"Rights_Status":"Owned",
        "Asset_Status":"Available","Active":True,
        "Do_Not_Use":False,"Content_Profile":[CHICAGO]}})
    return client,request,master,props,plan

def renderer_base():
    path=Path(__file__).resolve().parents[1]/"rendering_review"/"one_job.py"
    tree=ast.parse(path.read_text(encoding="utf-8"))
    fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef)
            and n.name=="_review_renderer_base")
    ns={"os":os}
    exec(compile(ast.Module(body=[fn],type_ignores=[]),str(path),"exec"),ns)
    return ns["_review_renderer_base"]()


class VariantContract(unittest.TestCase):
    def test_exact_renderer_reuses_existing_configured_production_remotion(self):
        with patch.dict(os.environ,{
            "RENDERING_REVIEW_REMOTION_BASE_URL":"",
            "REMOTION_RENDERER_URL":"https://render.chicagoshining.com/",
        }):
            self.assertEqual(renderer_base(),"https://render.chicagoshining.com")

    def test_exact_renderer_honors_narrow_override(self):
        with patch.dict(os.environ,{
            "RENDERING_REVIEW_REMOTION_BASE_URL":"https://pilot-render.chicagoshining.com/",
            "REMOTION_RENDERER_URL":"https://render.chicagoshining.com/",
        }):
            self.assertEqual(renderer_base(),"https://pilot-render.chicagoshining.com")

    def test_real_original_crop_binding_is_accepted(self):
        bound=tested_function()(*fixture())
        self.assertEqual(len(bound),1)
        self.assertEqual(bound[0]["drive_file_id"],MASTER)
        self.assertEqual(bound[0]["render_url"],URL)

    def test_stale_frozen_crop_is_rejected(self):
        args=list(fixture())
        args[4]["asset_manifest"][0]["render_variant_drive_file_id"]="wrong-crop"
        with self.assertRaisesRegex(Denied,"crop_not_verified"):
            tested_function()(*args)

    def test_swapped_renderer_url_is_rejected(self):
        args=list(fixture())
        args[3]["clips"][0]["url"]="https://media.chicagoshining.com/studio/previews/item4/other.jpg"
        with self.assertRaisesRegex(Denied,"crop_not_verified"):
            tested_function()(*args)

    def test_variant_request_not_complete_is_rejected(self):
        args=list(fixture())
        data=json.loads(args[1]["fields"]["Studio_Variant_Manifest_JSON"])
        data["complete"]=False
        args[1]["fields"]["Studio_Variant_Manifest_JSON"]=json.dumps(data)
        with self.assertRaisesRegex(Denied,"variant_manifest_unverified"):
            tested_function()(*args)


    def test_original_owned_video_passes_through_without_image_fetch(self):
        video_id="59a9b4d684904e5382"
        file_id="1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"
        url="https://drive.google.com/uc?export=download&id="+file_id
        video_record="recByWv7yDeVi2NPE"
        master={video_id:{"id":video_id,"media_asset_record_id":video_record,
            "google_drive_file_id":file_id}}
        plan={"asset_manifest":[{"asset_id":video_id,"drive_file_id":file_id,
            "render_variant_drive_file_id":file_id,"render_url":url,
            "rights_receipt_id":"rrrights_"+video_record}]}
        props={"clips":[{"mediaAssetRecordId":video_record,
            "googleDriveFileId":file_id,"url":url,"src":url}]}
        request={"id":REQUEST,"fields":{"Studio_Variant_Manifest_JSON":json.dumps({
            "complete":True,"production_request_record_id":REQUEST,
            "assets":[{"id":video_id,"media_asset_record_id":video_record,
              "google_drive_file_id":file_id,"media_kind":"video",
              "variants":{"9:16":{"google_drive_file_id":file_id,
                "preview_status":"Ready","recipe_version":"video-passthrough",
                "media_kind":"video","width":1080,"height":1920,
                "preview_url":"/api/media-assets/"+video_record+"/stream"}}}]})}}
        client=SimpleNamespace(get_record=lambda *_:{"id":video_record,"fields":{
            "Google Drive File ID":file_id,"Rights_Status":"Owned",
            "Asset_Status":"Available","Active":True,"Do_Not_Use":False,
            "Content_Profile":[CHICAGO],"Media_Class":"Video","MIME_Type":"video/mp4"}})
        drive=SimpleNamespace(get_file=lambda key:{"id":key,
            "mimeType":"video/mp4","size":"78925885"})
        result=tested_function()(client,request,master,props,plan,drive=drive)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["media_kind"],"video")
        self.assertEqual(result[0]["render_url"],url)

    def test_video_substitution_denied_even_if_approved_variant_exists(self):
        video_id="59a9b4d684904e5382"
        file_id="1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"
        url="https://drive.google.com/uc?export=download&id="+file_id
        video_record="recByWv7yDeVi2NPE"
        master={video_id:{"id":video_id,"media_asset_record_id":video_record,
            "google_drive_file_id":file_id}}
        plan={"asset_manifest":[{"asset_id":video_id,"drive_file_id":file_id,
            "render_variant_drive_file_id":file_id,"render_url":url,
            "rights_receipt_id":"rrrights_"+video_record}]}
        props={"clips":[{"mediaAssetRecordId":video_record,
            "googleDriveFileId":file_id,"url":url+"-swapped","src":url+"-swapped"}]}
        request={"id":REQUEST,"fields":{"Studio_Variant_Manifest_JSON":json.dumps({
            "complete":True,"production_request_record_id":REQUEST,
            "assets":[{"id":video_id,"media_asset_record_id":video_record,
              "google_drive_file_id":file_id,"media_kind":"video",
              "variants":{"9:16":{"google_drive_file_id":file_id,
                "preview_status":"Ready","recipe_version":"video-passthrough",
                "media_kind":"video","width":1080,"height":1920}}}]})}}
        client=SimpleNamespace(get_record=lambda *_:{"id":video_record,"fields":{
            "Google Drive File ID":file_id,"Rights_Status":"Owned",
            "Asset_Status":"Available","Active":True,"Do_Not_Use":False,
            "Content_Profile":[CHICAGO],"Media_Class":"Video","MIME_Type":"video/mp4"}})
        drive=SimpleNamespace(get_file=lambda key:{"id":key,
            "mimeType":"video/mp4","size":"78925885"})
        with self.assertRaisesRegex(Denied,"crop_not_verified"):
            tested_function()(client,request,master,props,plan,drive=drive)

if __name__=="__main__":
    unittest.main()
