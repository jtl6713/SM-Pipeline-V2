import hashlib
import json
import os
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.native_gallery_preview_http import (
    create_native_gallery_preview_blueprint, read_private_native_gallery_image,
)

OUTPUT="rec00000000000001"
CONTENT="rec00000000000002"
PROFILE="rec00000000000003"
SLIDE="rec00000000000004"
JOB="ngjob_12345678901234567890"
FILE="private_gallery_revision_12345678"
ORIGINAL_FILE="private_gallery_original_12345678"
FOLDER="private_gallery_folder_12345678"
SECRET="gallery-private-preview-secret-123456789"
PNG=b"original_branded_pixel_data" * 70


class TestRunnerImagePreview(unittest.TestCase):
    def test_service_auth_default_off_and_private_stream(self):
        app=Flask(__name__)
        hits=[]
        app.register_blueprint(create_native_gallery_preview_blueprint(
            {"pipeline_runner_shared_secret":SECRET},
            client_factory=lambda:object(),drive_factory=lambda:object(),
            reader=lambda **args:(hits.append(args) or (PNG,"image/png"))))
        http=app.test_client()
        path=f"/jobs/native-gallery/revision-media/{OUTPUT}/{JOB}/{SLIDE}/revised"
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(http.get(path,headers={"X-Pipeline-Secret":SECRET}).status_code,405)
        with patch.dict(os.environ,{
            "NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED":"true",
            "NATIVE_GALLERY_STAGING_FOLDER_ID":FOLDER,
        }):
            self.assertEqual(http.get(path,headers={"X-Pipeline-Secret":"wrong"}).status_code,403)
            reply=http.get(path,headers={"X-Pipeline-Secret":SECRET})
        self.assertEqual(reply.status_code,200)
        self.assertEqual(reply.data,PNG)
        self.assertEqual(reply.headers["Cache-Control"],"private, no-store")
        self.assertEqual(reply.headers["Content-Type"],"image/png")
        self.assertEqual(hits[0]["variant"],"revised")

    def test_exact_durable_job_and_source_manifest_gate(self):
        raw=PNG
        source={"slot_id":SLIDE,"order":1,
                "drive_file_id":ORIGINAL_FILE,
                "sha256":"a"*64}
        revised={**source,"drive_file_id":FILE,
                 "sha256":hashlib.sha256(raw).hexdigest(),
                 "mime_type":"image/png","byte_count":len(raw)}
        expected=hashlib.sha256(json.dumps([revised],
            separators=(",",":")).encode()).hexdigest()
        job={"id":"rec00000000000005","fields":{
            "Job_ID":JOB,"Output_Record_ID":OUTPUT,
            "Job_State":"ready_for_review",
            "Profile_Record_ID":PROFILE,
            "Content_Item_Record_ID":CONTENT,
            "Original_Manifest_SHA256":"b"*64,
            "Revised_Manifest_SHA256":expected,
            "Original_Manifest_JSON":json.dumps([source]),
            "Revised_Manifest_JSON":json.dumps([revised],separators=(",",":")),
            "Plan_JSON":json.dumps({"selected":[{"slide_id":SLIDE}],
                "profile_id":PROFILE,"output_id":OUTPUT}),
            "Hold_ID":"hold_12345678","Hold_Owner":"owner_12345678",
        }}
        output={"id":OUTPUT,"fields":{"Content_Item":[CONTENT],
            "Do_Not_Publish":True,"Studio_Render_Review_Hold_Active":True,
            "Studio_Render_Review_Hold_ID":"hold_12345678",
            "Studio_Render_Review_Hold_Owner":"owner_12345678",
            "Studio_Render_Review_Session_ID":"owner_12345678"}}
        item={"id":CONTENT,"fields":{"Content_Profile":[PROFILE]}}
        class Client:
            def list_records(self,*args,**kwargs):
                return [job]
            def get_record(self,table,identity):
                return output if identity==OUTPUT else item
        class Drive:
            def download_file(self,file_id):
                self.last=file_id
                return raw,"image/png"
        drive=Drive()
        def source_loader(**kwargs):
            return {"artifacts":[source],"original_artifacts_sha256":"b"*64,
                "original_artifact_watermark_verified":True}
        result=read_private_native_gallery_image(
            client=Client(),drive=drive,output_id=OUTPUT,job_id=JOB,
            slide_id=SLIDE,variant="revised",folder=FOLDER,
            source_loader=source_loader,verifier=lambda **kwargs:True)
        self.assertEqual(result,(raw,"image/png"))
        self.assertEqual(drive.last,FILE)
        output["fields"]["Do_Not_Publish"]=False
        with self.assertRaisesRegex(ValueError,"hold_changed"):
            read_private_native_gallery_image(
                client=Client(),drive=drive,output_id=OUTPUT,job_id=JOB,
                slide_id=SLIDE,variant="revised",folder=FOLDER,
                source_loader=source_loader,verifier=lambda **kwargs:True)


if __name__=="__main__":
    unittest.main()
