import hashlib
from io import BytesIO
import unittest
from unittest.mock import patch

from PIL import Image
from rendering_review.native_gallery_revised_verify import (
    verify_staged_gallery_revision, RevisedGalleryDenied,
)

OUTPUT="rec00000000000001"
CONTENT="rec00000000000002"
PROFILE="rec00000000000003"
SLIDE="rec00000000000004"
ASSET="rec00000000000005"
NEW_ASSET="rec00000000000006"
OLD="drive_gallery_original_123456789"
NEW="drive_gallery_revision_123456789"
FOLDER="private_gallery_folder_12345678"


def image_data():
    stream=BytesIO()
    Image.effect_noise((400,500),70).convert("RGB").save(stream,format="PNG")
    return stream.getvalue()


class FakeDrive:
    def __init__(self, raw):
        self.raw=raw
        self.parents=[FOLDER]
    def get_file(self,fid):
        return {"id":fid,"mimeType":"image/png","parents":self.parents,
                "size":len(self.raw),"trashed":False}
    def download_file(self,fid):
        return self.raw,"image/png"


def run(raw=None, modify=None, source=None, rights=None):
    actual=image_data()
    old=dict(slot_id=SLIDE,order=1,output_id=OUTPUT,profile_id=PROFILE,
        content_item_id=CONTENT,drive_file_id=OLD,sha256="a"*64,
        source_media_asset_id=ASSET,mime_type="image/png",byte_count=2048,
        width=400,height=500,rights_verified=True,watermark_verified=True,
        airtable_identity_verified=True)
    new={**old,"drive_file_id":NEW,"sha256":hashlib.sha256(actual).hexdigest(),
         "byte_count":len(actual),"revision_media_asset_id":NEW_ASSET}
    if modify:
        modify(old,new)
    drive=FakeDrive(actual if raw is None else raw)
    loader=source or (lambda **kw:{
        "content_item_id":CONTENT,
        "original_artifact_watermark_verified":True,
        "sources_byte_verified":True,"aspect_ratio":"4:5","artifacts":[old]})
    lookup=rights or (lambda *a:NEW_ASSET)
    return verify_staged_gallery_revision(
        client=object(),drive=drive,output_id=OUTPUT,profile_id=PROFILE,
        content_item_id=CONTENT,original_artifacts=[old],
        revision_artifacts=[new],selected_slide_ids=[SLIDE],
        staging_folder_id=FOLDER,source_loader=loader,
        asset_lookup=lookup,branding_resolver=lambda **kw:{
            "bytes":b"brand", "receipt":{"verified":True}},
    )


class TestStagedRevision(unittest.TestCase):
    @patch("rendering_review.native_gallery_revised_verify.visible_source_watermark",
           return_value=True)
    def test_staged_private_owned_media_reads_actual_bytes(self,_):
        self.assertTrue(run())

    @patch("rendering_review.native_gallery_revised_verify.visible_source_watermark",
           return_value=True)
    def test_mismatched_revised_bytes_denied(self,_):
        with self.assertRaisesRegex(RevisedGalleryDenied,"drive_bytes_changed"):
            run(raw=image_data()+b"modified")

    @patch("rendering_review.native_gallery_revised_verify.visible_source_watermark",
           return_value=True)
    def test_missing_new_asset_rights_denied(self,_):
        with self.assertRaisesRegex(RevisedGalleryDenied,"rights_record_invalid"):
            run(rights=lambda *a:ASSET)

    @patch("rendering_review.native_gallery_revised_verify.visible_source_watermark",
           return_value=False)
    def test_missing_watermark_pixels_denied(self,_):
        with self.assertRaisesRegex(RevisedGalleryDenied,"watermark_pixels_missing"):
            run()

    @patch("rendering_review.native_gallery_revised_verify.visible_source_watermark",
           return_value=True)
    def test_wrong_slot_unchanged_file_and_foreign_profile_denied(self,_):
        for transform in (
            lambda old,new:new.update(slot_id="rec99999999999999"),
            lambda old,new:new.update(drive_file_id=OLD),
            lambda old,new:new.update(profile_id="rec99999999999999"),
        ):
            with self.subTest(transform=transform):
                with self.assertRaises(RevisedGalleryDenied):
                    run(modify=transform)


if __name__=="__main__":
    unittest.main()
