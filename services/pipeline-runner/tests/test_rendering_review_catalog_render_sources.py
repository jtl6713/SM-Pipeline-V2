import io
import unittest
from PIL import Image

from rendering_review.catalog_render_sources import (
    verify_catalog_render_source, CatalogSourceDenied, CHICAGO, MEDIA, QUEUE,
)

MASTER_ID="rec12345678901234"
DERIVED_ID="rec99999999999999"
TRANSFER_ID="rec77777777777777"
REQUEST_ID="rec88888888888888"
SOURCE_FILE="1abcdefghijklmnopqRSTUVWxy1234Z"
VARIANT_FILE="1_abcdefghijklmnopqrstuvwxyz123"
SOURCE_ASSET="800c0da312e24b19aa"
URL=("https://media.chicagoshining.com/studio/previews/item4/"+
     REQUEST_ID+"/ITEM4-VARIANT-fill-crop-v2-"+REQUEST_ID+"-"+
     SOURCE_ASSET+"-9x16-"+VARIANT_FILE+".jpg")


def image_bytes(size,format):
    img=Image.new("RGB",size,(26,115,161))
    stream=io.BytesIO()
    img.save(stream,format=format)
    return stream.getvalue()


class Transport:
    status_code=200
    headers={"Content-Type":"image/jpeg"}
    def __init__(self,data):self.data=data
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def iter_content(self,chunk_size):yield self.data


def fixture():
    original=image_bytes((800,600),"PNG")
    crop=image_bytes((1080,1920),"JPEG")
    fields=lambda file,klass,mime:{
      "Media_Class":klass,"Asset_Status":"Available","Rights_Status":"Owned",
      "Active":True,"Do_Not_Use":False,"Content_Profile":[CHICAGO],
      "Google Drive File ID":file,"MIME_Type":mime
    }
    source={**fields(SOURCE_FILE,"Image","image/png"),
            "File_Size_Bytes":len(original)}
    derived=fields(VARIANT_FILE,"Image","image/jpeg")
    queue={"Asset_Kind":"Platform Variant","Aspect_Ratio":"9:16",
        "Variant_Style":"center","Transfer_Status":"Ready",
        "Preview_Status":"Ready","Source_Media_Asset":[MASTER_ID],
        "Source_Drive_File_ID":SOURCE_FILE,"Source_Size_Bytes":len(original),
        "Source_Asset_ID":SOURCE_ASSET,"Generated_Media_Asset":[DERIVED_ID],
        "Production_Request_Record_ID":REQUEST_ID,"Drive_File_ID":VARIANT_FILE,
        "Target_File_Name":"Adler-Planetarium-12__9x16__fill-crop-v2.jpg",
        "Preview_URL":URL}
    rows={(MEDIA,MASTER_ID):{"id":MASTER_ID,"fields":source},
          (MEDIA,DERIVED_ID):{"id":DERIVED_ID,"fields":derived},
          (QUEUE,TRANSFER_ID):{"id":TRANSFER_ID,"fields":queue}}
    class Client:
        def get_record(self,table,id):return rows[(table,id)]
    payload={SOURCE_FILE:(original,"image/png"),VARIANT_FILE:(crop,"image/jpeg")}
    class Drive:
        def get_file(self,id):
            data,mime=payload[id]
            return {"id":id,"size":str(len(data)),"mimeType":mime,"trashed":False}
        def download_file(self,id):return payload[id]
    frozen={"origin":"review_library","asset_id":"library_"+MASTER_ID,
        "source_media_record_id":MASTER_ID,"variant_media_record_id":DERIVED_ID,
        "variant_transfer_record_id":TRANSFER_ID,"source_request_id":REQUEST_ID,
        "source_asset_id":SOURCE_ASSET,"source_size_bytes":len(original),
        "drive_file_id":SOURCE_FILE,"render_variant_drive_file_id":VARIANT_FILE,
        "render_url":URL,"media_type":"image","profile_id":CHICAGO,
        "rights_receipt_id":"rrcatalogrights_"+MASTER_ID,
        "crop_recipe":"fill-crop-v2"}
    return Client(),Drive(),rows,payload,frozen


class CatalogRendererBindingTests(unittest.TestCase):
    def test_source_crop_and_preview_bytes_match(self):
        c,d,rows,payload,plan=fixture()
        result=verify_catalog_render_source(c,d,plan,
            transport=lambda *_a,**_k:Transport(payload[VARIANT_FILE][0]))
        self.assertEqual(result["render_url"],URL)
        self.assertEqual(result["asset_id"],"library_"+MASTER_ID)
        self.assertEqual(result["drive_file_id"],SOURCE_FILE)

    def test_cross_profile_graphic_or_changed_rights_fail_closed(self):
        for update in ({"Media_Class":"Graphic"},
                       {"Rights_Status":"Unknown"},
                       {"Content_Profile":["rec44444444444444"]},
                       {"Do_Not_Use":True}):
            c,d,rows,payload,plan=fixture()
            rows[MEDIA,MASTER_ID]["fields"].update(update)
            with self.assertRaises(CatalogSourceDenied):
                verify_catalog_render_source(c,d,plan,
                    transport=lambda *_a,**_k:Transport(payload[VARIANT_FILE][0]))

    def test_explicit_graphic_jpeg_preserves_original_media_class(self):
        client,drive,rows,payload,frozen=fixture()
        rows[MEDIA,MASTER_ID]["fields"]["Media_Class"]="Graphic"
        rows[MEDIA,MASTER_ID]["fields"]["MIME_Type"]="image/jpeg"
        source_bytes=image_bytes((800,600),"JPEG")
        payload[SOURCE_FILE]=(source_bytes,"image/jpeg")
        rows[MEDIA,MASTER_ID]["fields"]["File_Size_Bytes"]=len(source_bytes)
        rows[QUEUE,TRANSFER_ID]["fields"]["Source_Size_Bytes"]=len(source_bytes)
        frozen["source_size_bytes"]=len(source_bytes)
        frozen["source_media_class"]="Graphic"
        receipt=verify_catalog_render_source(client,drive,frozen,
            transport=lambda *_a,**_kw:Transport(payload[VARIANT_FILE][0]))
        self.assertEqual(receipt["asset_id"],"library_"+MASTER_ID)
        self.assertEqual(rows[MEDIA,MASTER_ID]["fields"]["Media_Class"],"Graphic")
        frozen["source_media_class"]="Image"
        with self.assertRaises(CatalogSourceDenied):
            verify_catalog_render_source(client,drive,frozen,
                transport=lambda *_a,**_kw:Transport(payload[VARIANT_FILE][0]))

    def test_stale_queue_crop_link_or_recipe_denied(self):
        for patch in ({"Source_Drive_File_ID":"1stale_abcdefghijklmnopqrst"},
                      {"Generated_Media_Asset":["rec44444444444444"]},
                      {"Aspect_Ratio":"4:5"},{"Transfer_Status":"Pending"},
                      {"Preview_Status":"Failed"},
                      {"Source_Size_Bytes":9999},
                      {"Preview_URL":"https://example.org/changed.jpg"}):
            c,d,rows,payload,plan=fixture()
            rows[QUEUE,TRANSFER_ID]["fields"].update(patch)
            with self.assertRaises(CatalogSourceDenied):
                verify_catalog_render_source(c,d,plan,
                    transport=lambda *_a,**_k:Transport(payload[VARIANT_FILE][0]))

    def test_wrong_frozen_source_or_file_denied(self):
        for patch in ({"source_media_record_id":"rec44444444444444"},
                      {"drive_file_id":"1stale_abcdefghijklmnopqrst"},
                      {"render_variant_drive_file_id":"1another_abcdefghijklmnopq"},
                      {"source_size_bytes":0},
                      {"origin":"original_asset"}):
            c,d,rows,payload,plan=fixture()
            plan.update(patch)
            with self.assertRaises(CatalogSourceDenied):
                verify_catalog_render_source(c,d,plan,
                    transport=lambda *_a,**_k:Transport(payload[VARIANT_FILE][0]))

    def test_url_is_not_enough_wrong_preview_bytes_denied(self):
        c,d,rows,payload,plan=fixture()
        with self.assertRaisesRegex(CatalogSourceDenied,"preview_binary_changed"):
            verify_catalog_render_source(c,d,plan,
                transport=lambda *_a,**_k:Transport(b"not the cropped image"))

    def test_drive_decode_and_dimensions_block_render(self):
        c,d,rows,payload,plan=fixture()
        data,mime=payload[VARIANT_FILE]
        payload[VARIANT_FILE]=(image_bytes((1080,1350),"JPEG"),mime)
        with self.assertRaises(CatalogSourceDenied):
            verify_catalog_render_source(c,d,plan,
                transport=lambda *_a,**_k:Transport(data))

    def test_immutable_crop_bytes_must_match_drive_metadata(self):
        c,d,rows,payload,plan=fixture()
        raw,mime=payload[VARIANT_FILE]
        payload[VARIANT_FILE]=(raw+b"tampered",mime)
        with self.assertRaises(CatalogSourceDenied):
            verify_catalog_render_source(c,d,plan,
                transport=lambda *_a,**_k:Transport(raw))


if __name__ == "__main__":
    unittest.main()
