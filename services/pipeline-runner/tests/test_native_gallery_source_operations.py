import hashlib
from io import BytesIO
import unittest
from PIL import Image
from rendering_review.gallery_source_operations import VerifiedOriginalSourceOperation

OUTPUT="rec00000000000001"
PROFILE="rec00000000000002"
CONTENT="rec00000000000003"
DRIVE_ID="drive-native-test-original-001234567890"


def source():
    io=BytesIO()
    Image.new("RGB",(400,500),"blue").save(io,format="PNG")
    data=io.getvalue()
    slide=dict(slot_id="slide_0001",order=1,drive_file_id=DRIVE_ID,
        output_id=OUTPUT,profile_id=PROFILE,content_item_id=CONTENT,
        mime_type="image/png",sha256=hashlib.sha256(data).hexdigest(),
        byte_count=len(data),width=400,height=500,watermark_verified=True,
        rights_verified=True,airtable_identity_verified=True)
    return data,slide


class Drive:
    def __init__(self,data):
        self.data=data
    def get_file(self,fid):
        return {"id":fid,"mimeType":"image/png","trashed":False}
    def download_file(self,fid):
        return self.data,"image/png"


class GateTests(unittest.TestCase):
    def test_authoritative_reload_and_actual_drive_bytes(self):
        data,slide=source()
        live=dict(authority="airtable",output_id=OUTPUT,profile_id=PROFILE,
            content_item_id=CONTENT,aspect_ratio="4:5",rights_verified=True,
            hold_active=True,slides=[slide])
        original=dict(verified=True,output_id=OUTPUT,profile_id=PROFILE,
            content_item_id=CONTENT,aspect_ratio="4:5",artifacts=[slide])
        gate=VerifiedOriginalSourceOperation(
            airtable_source_loader=lambda *args:live,drive=Drive(data))
        self.assertTrue(gate(original))
        self.assertFalse(gate({**original,"artifacts":[{**slide,"sha256":"0"*64}]}))
        self.assertFalse(VerifiedOriginalSourceOperation(
            airtable_source_loader=lambda *args:{**live,"hold_active":False},
            drive=Drive(data))(original))
        self.assertFalse(VerifiedOriginalSourceOperation(
            airtable_source_loader=lambda *args:live,
            drive=Drive(data+b"tampered"))(original))


if __name__=="__main__":
    unittest.main()
