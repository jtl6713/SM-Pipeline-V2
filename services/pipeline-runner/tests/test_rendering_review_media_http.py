import json
import os
import unittest
from unittest.mock import patch
from flask import Flask
from rendering_review.media_http import (create_review_media_blueprint,
    OUTPUTS, SESSIONS, ATTEMPTS, ITEMS, CHICAGO)

OUTPUT="rec0uVrVeiUM6shp9"
ATTEMPT="rrattempt_1234567890abcdef"
SESSION="rrsession_test12345678"
FILE="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4"
SECRET="x"*32

class FakeClient:
    hold=True
    factory=False
    mismatch=False
    profile_id=CHICAGO
    item_profile_id=None
    platform="Instagram"
    output_type="Instagram Reel"
    def __init__(self): self.seen=[]
    def list_records(self,table,**kwargs):
        self.seen.append(table)
        if table==SESSIONS:
            session={"schema":"studio.render-review.1","id":SESSION,
                "output_id":OUTPUT,"profile_id":self.profile_id,"version":4,
                "platform":self.platform,"output_type":self.output_type,
                "state":"approved" if self.factory else "discussing",
                "approved_attempt_id":ATTEMPT if self.factory else None,
                "current_attempt_id":ATTEMPT,
                "factory_handoff":{"status":"ready_for_factory_approval",
                    "attempt_id":ATTEMPT,
                    "artifact_id":("different-asset" if self.mismatch else FILE)},
                "review_hold":{"active":self.hold,"id":"hold-test","owner":SESSION},
                "attempts":[{"id":ATTEMPT,"number":2,
                    "status":"ready_for_review","artifact_id":FILE}]}
            return [{"fields":{"Session_ID":SESSION,"Row_Version":4,
                                "Session_JSON":json.dumps(session)}}]
        if table==ATTEMPTS:
            return [{"fields":{"Attempt_ID":ATTEMPT,"Output_Record_ID":OUTPUT,
                "Session_ID":SESSION,"Attempt_Number":2,
                "Attempt_Status":"ready_for_review","Artifact_File_ID":FILE}}]
        return []
    def get_record(self,table,rid):
        if table==OUTPUTS:
            f={"Content_Item":["recSkCY227R8iuoaJ"],
                "Studio_Render_Review_Hold_Active":self.hold,
                "Studio_Render_Review_Hold_ID":"hold-test" if self.hold else "",
                "Studio_Render_Review_Hold_Owner":SESSION if self.hold else "",
                "Studio_Render_Review_Session_ID":SESSION if self.hold else "",
                "Do_Not_Publish":self.hold,"Auto_Publish_Enabled":False,
                "Platform":self.platform,"Platform_Output_Type":self.output_type}
            if self.factory:
                f.update({"Final_File_ID":FILE,
                    "Final_File_URL":"https://drive.google.com/file/d/"+FILE+"/view",
                    "Output_Status":"Ready for Review","Review_Status":"Review Sent",
                    "Publish_Status":"Not Ready"})
            return {"id":OUTPUT,"fields":f}
        if table==ITEMS: return {"fields":{"Content_Profile":[self.item_profile_id or self.profile_id]}}
        raise ValueError(table)

class FakeDrive:
    def access_token(self):return "private-oauth-token"

class FakeResponse:
    status_code=206
    headers={"Content-Type":"video/mp4","Content-Length":"4",
             "Content-Range":"bytes 0-3/900"}
    closed=False
    def close(self): self.closed=True
    def iter_content(self,chunk_size=0):yield b"mp4!"
class ProxyTests(unittest.TestCase):
    def setUp(self):
        self.client=FakeClient()
        self.transfers=[]
        def transport(url,**kwargs):
            self.transfers.append((url,kwargs))
            return FakeResponse()
        self.app=Flask("pilot-test")
        self.app.register_blueprint(create_review_media_blueprint(
            {"pipeline_runner_shared_secret":SECRET},
            client_factory=lambda:self.client,
            drive_factory=FakeDrive,transport=transport))
        self.http=self.app.test_client()
        self.url="/jobs/rendering-review/attempt-media/"+OUTPUT+"/"+ATTEMPT
        self.env=patch.dict(os.environ,{"RENDERING_REVIEW_EXACT_OUTPUT_ID":"recVFaT3VnhCD3dcb"})
        self.env.start()
    def tearDown(self):self.env.stop()
    def test_authenticated_range_stream_without_public_drive_url(self):
        r=self.http.get(self.url,headers={"X-Pipeline-Secret":SECRET,"Range":"bytes=0-3"})
        self.assertEqual(r.status_code,206)
        self.assertEqual(r.data,b"mp4!")
        self.assertEqual(r.headers["Content-Range"],"bytes 0-3/900")
        self.assertEqual(r.headers["Cache-Control"],"private, no-store")
        target,opts=self.transfers[0]
        self.assertEqual(target,"https://www.googleapis.com/drive/v3/files/"+FILE)
        self.assertEqual(opts["headers"]["Range"],"bytes=0-3")
        self.assertEqual(opts["headers"]["Authorization"],"Bearer private-oauth-token")
        self.assertFalse("Drive" in str(r.data))
    def test_untrusted_or_wrong_output_never_reads_google(self):
        self.assertEqual(self.http.get(self.url).status_code,401)
        self.assertEqual(self.http.get(self.url.replace(OUTPUT,"recA1B2C3D4E5F6G7"),
            headers={"X-Pipeline-Secret":SECRET}).status_code,409)
        self.assertEqual(self.transfers,[])
    def test_lost_hold_denied_before_drive(self):
        self.client.hold=False
        self.assertEqual(self.http.get(self.url,headers={"X-Pipeline-Secret":SECRET}).status_code,409)
        self.assertEqual(self.transfers,[])
    def test_factory_handoff_unheld_accepted_v2_is_still_streamable(self):
        self.client.factory=True
        self.client.hold=False
        resp=self.http.get(self.url,headers={"X-Pipeline-Secret":SECRET,
                                             "Range":"bytes=0-3"})
        self.assertEqual(resp.status_code,206)
        self.assertEqual(resp.data,b"mp4!")
        self.assertEqual(len(self.transfers),1)
    def test_factory_handoff_wrong_asset_is_denied_without_google(self):
        self.client.factory=True
        self.client.hold=False
        self.client.mismatch=True
        resp=self.http.get(self.url,headers={"X-Pipeline-Secret":SECRET})
        self.assertEqual(resp.status_code,409)
        self.assertEqual(self.transfers,[])
    def test_other_city_private_attempt_requires_runner_global_scope(self):
        self.client.profile_id="recF7UAn0LkMZZrWZ"
        self.client.platform="TikTok"
        self.client.output_type="TikTok Video"
        headers={"X-Pipeline-Secret":SECRET,"Range":"bytes=0-3"}
        self.assertEqual(self.http.get(self.url,headers=headers).status_code,409)
        self.assertEqual(self.transfers,[])
        flags={
            "RENDERING_REVIEW_ENROLL_WRITES_ENABLED":"true",
            "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED":"true",
            "RENDERING_REVIEW_INTEGRATION_VERIFIED":"true",
            "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED":"true",
            "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED":"true",
            "RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED":"true",
            "RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED":"true",
        }
        with patch.dict(os.environ,flags):
            ok=self.http.get(self.url,headers=headers)
            self.assertEqual(ok.status_code,206)
            self.assertEqual(ok.data,b"mp4!")
            self.assertEqual(len(self.transfers),1)
            self.client.item_profile_id=CHICAGO
            cross=self.http.get(self.url,headers=headers)
            self.assertEqual(cross.status_code,403)
            self.assertEqual(len(self.transfers),1)

    def test_other_city_fails_closed_when_one_runner_flag_is_off(self):
        self.client.profile_id="recF7UAn0LkMZZrWZ"
        self.client.platform="Facebook"
        self.client.output_type="Facebook Reel"
        flags={key:"true" for key in (
            "RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
            "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED",
            "RENDERING_REVIEW_INTEGRATION_VERIFIED",
            "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED",
            "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED",
            "RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED",
            "RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED")}
        with patch.dict(os.environ,flags):
            for key in flags:
                with patch.dict(os.environ,{key:"false"}):
                    self.assertEqual(self.http.get(self.url,
                        headers={"X-Pipeline-Secret":SECRET}).status_code,409,key)
        self.assertEqual(self.transfers,[])

    def test_head_probe_no_google_media_in_response(self):
        r=self.http.head(self.url,headers={"X-Pipeline-Secret":SECRET})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.headers.get("Content-Length"),"900")
        self.assertEqual(r.data,b"")
        self.assertEqual(self.transfers[0][1]["headers"]["Range"],"bytes=0-0")

if __name__=="__main__":unittest.main()
