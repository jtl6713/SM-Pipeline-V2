import hashlib
from io import BytesIO
import unittest

from PIL import Image
from rendering_review.gallery_media_io import (
    GalleryMediaDenied, GalleryMediaIO,
)

PROFILE="rec00000000000002"
OTHER="rec00000000000003"
FOLDER="drive-review-gallery-staging-0123456789"
LOGO_FILE="drive-profile-watermark-0123456789"


def png(width,height,color):
    out=BytesIO()
    Image.new("RGBA",(width,height),color).save(out,format="PNG")
    return out.getvalue()


def digest(data):
    return hashlib.sha256(data).hexdigest()


class FakeDrive:
    def __init__(self):
        self.files={}
        self.count=0
    def upload_file(self,folder,name,content,mime):
        self.count+=1
        fid="drive-review-generated-file-0123456789-%d"%self.count
        self.files[fid]={"content":content,"name":name,
                         "mime":mime,"folder":folder}
        return {"id":fid}
    def get_file(self,fid):
        v=self.files.get(fid)
        return {"id":fid,"mimeType":v["mime"],"parents":[v["folder"]],
                "size":str(len(v["content"])),"trashed":False}
    def download_file(self,fid):
        v=self.files[fid]
        return (v["content"],v["mime"])


def fixture(*,logo=None,profile=PROFILE,receipt=None,drive=None):
    mark=logo or png(220,80,(255,255,255,120))
    proof=receipt or {"verified":True,"authority":"server","profile_id":profile,
       "media_authority":"google_drive","drive_file_id":LOGO_FILE,
       "sha256":digest(mark)}
    generator=lambda prompt,ratio:png(720,1080,(220,200,150,255))
    return GalleryMediaIO(profile_id=profile,
       profile_watermark=mark,profile_watermark_receipt=proof,
       drive=drive or FakeDrive(),staging_folder_id=FOLDER,
       generator=generator)


class GalleryMediaIOTests(unittest.TestCase):
    def test_profile_watermark_and_drive_round_trip_without_source_mutation(self):
        drive=FakeDrive()
        io=fixture(drive=drive)
        raw=io.generate_image("Replace the dusk photo with a daylight frame.","4:5")
        self.assertEqual(Image.open(BytesIO(raw)).size,(1080,1350))
        branded=io.watermark_image(raw,PROFILE)
        self.assertEqual(Image.open(BytesIO(branded)).size,(1080,1350))
        self.assertNotEqual(raw,branded)
        name="review-rec00000000000001-rrattempt_123456789-01.png"
        uploaded=io.upload_image(name,branded)
        file_id=uploaded["id"]
        receipt=io.verify_drive_image(file_id,digest(branded),len(branded))
        self.assertTrue(receipt["google_drive_verified"])
        self.assertEqual((receipt["width"],receipt["height"]),(1080,1350))
        self.assertEqual(receipt["mime_type"],"image/png")
        self.assertEqual(drive.count,1)

    def test_wrong_city_branding_and_unauthorized_profile_never_process(self):
        mark=png(220,80,(200,200,200,100))
        bad={"verified":True,"authority":"server",
             "profile_id":OTHER,"media_authority":"google_drive",
             "drive_file_id":LOGO_FILE,"sha256":digest(mark)}
        with self.assertRaisesRegex(GalleryMediaDenied,"branding"):
            fixture(logo=mark,receipt=bad)
        good=fixture(logo=mark)
        raw=good.generate_image("Replace a scene with approved sunshine.","4:5")
        with self.assertRaisesRegex(GalleryMediaDenied,"profile_mismatch"):
            good.watermark_image(raw,OTHER)

    def test_uploaded_file_must_match_exact_google_drive_sha_parent_and_mime(self):
        for kind in ("byte_drift","parent_drift","mime_drift"):
            drive=FakeDrive()
            io=fixture(drive=drive)
            raw=io.generate_image("Replace an image of the night skyline.","9:16")
            branded=io.watermark_image(raw,PROFILE)
            fid=io.upload_image(
                "review-rec00000000000001-rrattempt_123456789-01.png",branded)["id"]
            if kind=="byte_drift":
                drive.files[fid]["content"]=branded+b"modified"
            elif kind=="parent_drift":
                drive.files[fid]["folder"]="unexpected-folder"
            else:
                drive.files[fid]["mime"]="text/html"
            with self.subTest(kind=kind):
                with self.assertRaises(GalleryMediaDenied):
                    io.verify_drive_image(fid,digest(branded),len(branded))

    def test_only_deterministic_private_staging_filenames_are_accepted(self):
        drive=FakeDrive()
        io=fixture(drive=drive)
        raw=io.generate_image("New image with corrected morning lighting.","4:5")
        branded=io.watermark_image(raw,PROFILE)
        for bad in ("../override.png","ChicagoShiningPhotoSequence.mp4",
                    "publish-now.png","review-wrong-output.png"):
            with self.assertRaises(GalleryMediaDenied):
                io.upload_image(bad,branded)
        self.assertEqual(drive.count,0)

    def test_non_png_and_malformed_source_images_are_denied(self):
        io=fixture()
        with self.assertRaises(GalleryMediaDenied):
            io.watermark_image(b"not-a-png",PROFILE)
        io.generator=lambda *_args,**_kwargs:b"<html>Cloudflare Access</html>"
        with self.assertRaises(GalleryMediaDenied):
            io.generate_image("Change this photo to daytime.", "4:5")


if __name__=="__main__":
    unittest.main()
