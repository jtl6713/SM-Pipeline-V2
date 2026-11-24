import io
import json

from PIL import Image
from studio_produce import native_gallery as g
from studio_produce.steps import pick_resume_step, _output_file_ready


def test_cap_10_including_cover_and_no_change_to_other_route():
    source = [{"id": i} for i in range(19)]
    assert g.selected_body(source) == source[:9]
    assert len(source) == 19
    assert g.selected_body(source[:4]) == source[:4]
    assert g.meta_gallery("Instagram", "Carousel")
    assert g.meta_gallery("Facebook", "Multi-Image Post")
    assert not g.meta_gallery("TikTok", "Multi-Photo")
    assert not g.meta_gallery("Instagram", "Reel")


def test_gallery_completion_is_not_native_route_status_alone():
    package = {"authority":g.AUTHORITY,"selected_clips":[{"id":1}]}
    row = {"id":"recExample", "fields":{
        "Platform":"Instagram","Studio_Output_Type":"Carousel",
        "Output_Status":"Ready for Review","Render_Status":"Native Photo Route",
        "Selected_Assets_JSON":json.dumps(package)}}
    assert g.pending_gallery(row)
    assert not _output_file_ready(row)
    assert pick_resume_step({},[row]) == "render"
    row["fields"]["Do_Not_Publish"] = True
    assert not g.pending_gallery(row)


def test_cover_preserves_full_portrait_design_in_exact_4x5_jpeg():
    b=io.BytesIO()
    Image.new("RGB",(108,192),(230,20,30)).save(b,"PNG")
    out=g._cover_jpeg(b.getvalue())
    assert len(g._image_proof(out)) == 64
    with Image.open(io.BytesIO(out)) as img:
        assert img.size == (1080,1350)
        assert img.getpixel((540,0))[0] > 200
        assert img.getpixel((0,675))[0] < 50


def test_linked_slide_identity_is_deterministic_and_cannot_reuse_approved_or_foreign_row():
    id1="rec"+"a"*14
    id2="rec"+"b"*14
    assert g._slide_id(id1,1) == g._slide_id(id1,1)
    assert g._slide_id(id1,1) != g._slide_id(id2,1)
    f={"Platform Output":[id1],"PO_Output_ID":[11158],"Approved For Final":False,"Shared_Asset_Approved":False,"Final Image URL":"https://example.invalid/1.jpg"}
    row={"airtable_record_id":g._slide_id(id1,1),"current_order":1,"deleted_from_carousel":False,"fields":f}
    assert g._same_slide(row,row)
    assert not g._same_slide({**row,"fields":{**f,"Approved For Final":True}},row)
    assert not g._same_slide({**row,"fields":{**f,"Platform Output":[id2]}},row)
