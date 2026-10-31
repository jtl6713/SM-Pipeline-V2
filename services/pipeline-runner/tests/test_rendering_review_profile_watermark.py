from __future__ import annotations
import unittest
from rendering_review.profile_watermark import (
    ProfileWatermarkUnavailable, resolve_profile_watermark,
    require_owned_profile_watermark_url,
)
from airtable.constants import CONTENT_PROFILES_TABLE, MEDIA_ASSETS_TABLE

CHICAGO="recT2rbKX3MF7cVFU"
LA="recF7UAn0LkMZZrWZ"
FILE="1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
LARGE="17z7jHA-GL6nlWICxWJPyne5OrZethcZY"
DATA=b"\x89PNG\r\n\x1a\n"+b"a"*250

def media(id,file_id,name,profile=CHICAGO):
    return {"id":id,"fields":{"Asset Name":name,"Asset_Role":"Watermark",
      "Asset_Status":"Available","Rights_Status":"Owned","Active":True,
      "Content_Profile":[profile],"MIME_Type":"image/png","Google Drive File ID":file_id}}
class FakeAirtable:
    def __init__(self,records=None):self.records=records or [
      media("rec00000000000001",FILE,"ChicagoShining_Watermark_Small.png"),
      media("rec00000000000002",LARGE,"ChicagoShining_Watermark_Large.png"),
    ]
    def get_record(self,table,id):
        assert table==CONTENT_PROFILES_TABLE
        return {"id":id,"fields":{"Profile_Name":"ChicagoShining" if id==CHICAGO else "LA Shining"}}
    def list_records(self,table,formula=None,max_records=None):
        assert table==MEDIA_ASSETS_TABLE
        assert "Watermark" in formula and max_records<=200
        return self.records
class FakeDrive:
    def get_file(self,id):
        return {"id":id,"mimeType":"image/png","trashed":False}
    def download_file(self,id):
        return DATA,"image/png"

class ProfileWatermarkTests(unittest.TestCase):
    def test_chicago_chooses_exact_small_owned_asset(self):
        result=resolve_profile_watermark(client=FakeAirtable(),drive=FakeDrive(),profile_id=CHICAGO)
        self.assertEqual(result["bytes"],DATA)
        self.assertEqual(result["receipt"]["drive_file_id"],FILE)
        self.assertEqual(result["receipt"]["profile_id"],CHICAGO)
        self.assertTrue(result["receipt"]["verified"])

    def test_other_city_has_no_fallback_to_chicago_logo(self):
        with self.assertRaisesRegex(ProfileWatermarkUnavailable,"missing_or_ambiguous"):
            resolve_profile_watermark(client=FakeAirtable(),drive=FakeDrive(),profile_id=LA)

    def test_future_los_angeles_owned_watermark_is_supported_without_hardcoded_allowlist(self):
        a=FakeAirtable([media("rec00000000000003",FILE,"LA_Shining_Watermark_Small.png",LA)])
        result=resolve_profile_watermark(client=a,drive=FakeDrive(),profile_id=LA)
        self.assertEqual(result["receipt"]["profile_id"],LA)

    def test_ambiguous_or_unowned_watermarks_do_not_resolve(self):
        changes=[
          lambda r:r["fields"].update(Rights_Status="Unknown"),
          lambda r:r["fields"].update(Asset_Status="Unverified"),
          lambda r:r["fields"].update(Active=False),
          lambda r:r["fields"].update(Content_Profile=[LA]),
          lambda r:r["fields"].update(MIME_Type="text/html"),
          lambda r:r["fields"].update(**{"Google Drive File ID":""}),
        ]
        for change in changes:
            item=media("rec00000000000001",FILE,"Watermark.png")
            change(item)
            with self.assertRaises(ProfileWatermarkUnavailable):
                resolve_profile_watermark(client=FakeAirtable([item]),drive=FakeDrive(),profile_id=CHICAGO)

    def test_unauthorized_drive_html_or_wrong_file_metadata_is_never_branding(self):
        class BadDrive(FakeDrive):
            def download_file(self,id):return b"<html>Google sign-in</html>","text/html"
        with self.assertRaises(ProfileWatermarkUnavailable):
            resolve_profile_watermark(client=FakeAirtable(),drive=BadDrive(),profile_id=CHICAGO)

    def test_catalog_capped_to_avoid_silent_partial_profile_lookup(self):
        entries=[media("rec"+str(i).zfill(14),FILE,"Watermark.png") for i in range(200)]
        with self.assertRaisesRegex(ProfileWatermarkUnavailable,"unbounded"):
            resolve_profile_watermark(client=FakeAirtable(entries),drive=FakeDrive(),profile_id=CHICAGO)
    def test_source_watermark_url_must_match_owning_profile_catalog_receipt(self):
        catalog=FakeAirtable([media(
            "rec00000000000003",FILE,"LA_Shining_Watermark_Small.png",LA)])
        url="https://drive.google.com/uc?export=download&id="+FILE
        verified=require_owned_profile_watermark_url(
            client=catalog,drive=FakeDrive(),profile_id=LA,url=url)
        self.assertEqual(verified["url"],url)
        self.assertEqual(verified["receipt"]["profile_id"],LA)

        # A valid Google Drive PNG belonging to a different city is never
        # enough to authorize the V2 render.
        other="https://drive.google.com/uc?export=download&id="+LARGE
        with self.assertRaisesRegex(ProfileWatermarkUnavailable,
                                    "profile_source_watermark_identity_mismatch"):
            require_owned_profile_watermark_url(
                client=catalog,drive=FakeDrive(),profile_id=LA,url=other)

    def test_source_watermark_url_rejects_unowned_variants(self):
        catalog=FakeAirtable([media(
            "rec00000000000003",FILE,"LA_Shining_Watermark_Small.png",LA)])
        invalid=[
          "http://drive.google.com/uc?export=download&id="+FILE,
          "https://drive.google.com/uc?export=download&id="+FILE+"&foo=x",
          "https://drive.google.com/uc?export=download&id="+FILE+"#t",
          "https://example.com/uc?export=download&id="+FILE,
          "https://drive.google.com/uc?export=download&id="+FILE+"&id="+LARGE,
        ]
        for url in invalid:
            with self.subTest(url=url),self.assertRaises(ProfileWatermarkUnavailable):
                require_owned_profile_watermark_url(
                    client=catalog,drive=FakeDrive(),profile_id=LA,url=url)

if __name__=="__main__":
    unittest.main()
