import os
import unittest
from unittest.mock import patch
from flask import Flask

from rendering_review.native_gallery_revised_http import (
    create_native_gallery_revised_blueprint,
)
from rendering_review.native_gallery_revised_verify import RevisedGalleryDenied

OUT="rec00000000000001"
PROFILE="rec00000000000002"
ITEM="rec00000000000003"
SECRET="service-gallery-revision-secret-123456789"
PATH="/jobs/native-gallery/verify-revision"
FOLDER="private_gallery_folder_12345678"


def payload():
    return {"output_id":OUT,"profile_id":PROFILE,"content_item_id":ITEM,
            "original_artifacts":[{"slot_id":"rec00000000000004"}],
            "revision_artifacts":[{"slot_id":"rec00000000000004"}],
            "selected_slide_ids":["rec00000000000004"]}


class TestRevisionEndpoint(unittest.TestCase):
    def setUp(self):
        self.invocations=[]
        self.app=Flask(__name__)
        def verifier(**kwargs):
            self.invocations.append(kwargs)
            return True
        self.app.register_blueprint(create_native_gallery_revised_blueprint(
            {"pipeline_runner_shared_secret":SECRET},
            client_factory=lambda:object(),drive_factory=lambda:object(),
            verifier=verifier))
        self.http=self.app.test_client()
        self.headers={"X-Pipeline-Secret":SECRET}

    def call(self,p=None,h=None):
        return self.http.post(PATH,json=payload() if p is None else p,
                              headers=self.headers if h is None else h)

    def test_disabled_default_and_wrong_credentials(self):
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(self.call().status_code,405)
        with patch.dict(os.environ,{"NATIVE_GALLERY_REVISED_VERIFY_ENABLED":"true",
                                    "NATIVE_GALLERY_STAGING_FOLDER_ID":FOLDER}):
            self.assertEqual(self.call(h={"X-Pipeline-Secret":"bad"}).status_code,403)
        self.assertEqual(self.invocations,[])

    def test_read_only_private_media_receipt(self):
        with patch.dict(os.environ,{"NATIVE_GALLERY_REVISED_VERIFY_ENABLED":"true",
                                    "NATIVE_GALLERY_STAGING_FOLDER_ID":FOLDER}):
            reply=self.call()
        self.assertEqual(reply.status_code,200)
        self.assertTrue(reply.get_json()["verified"])
        self.assertFalse(reply.get_json()["publication_authorized"])
        self.assertNotIn("revision_artifacts",reply.get_json())
        self.assertEqual(reply.headers.get("Cache-Control"),"no-store")
        self.assertEqual(self.invocations[0]["staging_folder_id"],FOLDER)

    def test_reject_unexpected_fields_and_oversized_body(self):
        with patch.dict(os.environ,{"NATIVE_GALLERY_REVISED_VERIFY_ENABLED":"true",
                                    "NATIVE_GALLERY_STAGING_FOLDER_ID":FOLDER}):
            self.assertEqual(self.call(p={**payload(),"publish":True}).status_code,400)
            reply=self.http.post(PATH,data="a"*40001,
                content_type="application/json",headers=self.headers)
            self.assertEqual(reply.status_code,413)
        self.assertEqual(self.invocations,[])

    def test_denied_rights_cannot_be_used_as_success(self):
        other=Flask("denied_gallery_revision")
        other.register_blueprint(create_native_gallery_revised_blueprint(
            {"pipeline_runner_shared_secret":SECRET},
            verifier=lambda **kw:(_ for _ in ()).throw(
                RevisedGalleryDenied("no_rights")),
            client_factory=lambda:object(),drive_factory=lambda:object()))
        with patch.dict(os.environ,{"NATIVE_GALLERY_REVISED_VERIFY_ENABLED":"true",
                                    "NATIVE_GALLERY_STAGING_FOLDER_ID":FOLDER}):
            reply=other.test_client().post(PATH,json=payload(),headers=self.headers)
        self.assertEqual(reply.status_code,409)
        self.assertFalse(reply.get_json()["ok"])


if __name__=="__main__":
    unittest.main()
