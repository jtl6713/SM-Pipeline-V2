import io
import json
import pytest

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


@pytest.mark.parametrize("duplicate,legacy", [(False,False),(True,False),(False,True)])
def test_build_both_native_siblings_as_exact_unapproved_packages(monkeypatch, duplicate, legacy):
    from copy import deepcopy
    rid="rec"+"r"*14
    pid="rec"+"p"*14
    profile="rec"+"q"*14
    cover_id="rec"+"c"*14
    cover_drive="generated_cover_drive_file"
    cover_url=g.CDN+"studio/previews/thumbnails/"+pid+"/cover-9x16.png"
    count = 4 if legacy else 19
    source_ids=[f"source-{i}" for i in range(count)]
    ids=["rec"+f"{i:014d}" for i in range(count)]
    drives=[f"owned_crop_drive_{i:02d}" for i in range(count)]
    clips=[{"order":i+1,"source_asset_id":sid,"media_kind":"photo","asset_name":sid}
           for i,sid in enumerate(source_ids)]
    if legacy:
        for i,c in enumerate(clips):
            c.update({"url":g.CDN+f"studio/previews/legacy/{i}.jpg",
                      "media_asset_record_id":"rec"+f"{i+200:014d}",
                      "google_drive_file_id":drives[i]})
    crop_rows=[{"payload":{"source_asset_id":sid,"media_asset_record_id":ids[i],
                          "drive_file_id":drives[i],"width":1080,"height":1350}}
               for i,sid in enumerate(source_ids)]
    outputs={}
    for i,platform in enumerate(("Instagram","Facebook"),1):
        oid="rec"+str(i+100).zfill(14)
        outputs[oid]={"id":f"uuid-{i}","airtable_record_id":oid,"content_item_id":"parent-uuid",
            "content_profile_id":"profile-uuid","output_number":11157+i,"output_status":"Ready for Review",
            "render_status":"Native Photo Route","platform":platform,
            "platform_output_type":"Instagram Carousel" if i==1 else "Facebook Photo Set",
            "studio_output_type":"Carousel" if i==1 else "Multi-Image Post","output_caption":"Caption",
            "selected_clip_count":count,"selected_assets":{"authority":g.AUTHORITY,
                "production_request_record_id":rid,"selected_clips":deepcopy(clips)},
            "do_not_publish":False,"auto_publish_enabled":None,"updated_at":"2026-11-24T19:00:00Z"}
    stored=[]
    patches=[]
    if legacy:
        for oid,row in outputs.items():
            row.update({"output_caption":None,"auto_publish_enabled":False,"error_messages":{
                g.LEGACY_HOLD:{"issue_number":2294,"verification_status":"not_yet_verified","publishing_authorized":False},
                "Studio_Effective_Caption_Mode":"AI decides"}})
            number=row["output_number"]
            for i,c in enumerate(clips,1):
                stored.append({"id":f"legacy-{number}-{i}","airtable_record_id":g._legacy_id(number,i),
                    "current_order":i,"deleted_from_carousel":False,"updated_at":"2026-11-22T00:00:00Z",
                    "fields":{"Platform Output":[oid],"PO_Output_ID":[number],"Slide Number":i,
                    "Final Image URL":c["url"],"Asset_4x5_Public_URL":c["url"],
                    "Google Drive File ID":c["google_drive_file_id"],"Asset_Family_Key":c["media_asset_record_id"],
                    "Review Status":"Pending Review","Approved For Final":False,"Shared_Asset_Approved":False,
                    g.LEGACY_DRAFT:{"output_number":number,"slide_order":i,
                      "source_asset":c["media_asset_record_id"],"variant_drive_file_id":c["google_drive_file_id"],
                      "publishing_authorized":False,"final_creative_approved":False}}})
    def asset(a,d):
        return {"airtable_record_id":a,"active":True,"do_not_use":False,"asset_status":"Available",
                "google_drive_file_id":d,"metadata":{"rights_status":"Owned","content_profile_airtable_id":profile}}
    def rest(settings,path,method,body=None,prefer=None):
        if path.startswith("platform_outputs?airtable_record_id"):
            key=path.split("eq.",1)[1].split("&",1)[0]
            return [deepcopy(outputs[key])]
        if path.startswith("content_items?"):
            return [{"id":"parent-uuid","content_profile_id":"profile-uuid","production_request_id":"request-uuid",
                     "thumbnail_url":cover_url,"extras":{"Thumbnail_Status":"Generated","Thumbnail_Google_Drive_File_ID":cover_drive}}]
        if path.startswith("production_requests?"):
            return [{"id":"request-uuid","promoted_content_item_id":"parent-uuid","variant_status":"Ready",
                     "master_assets":[{"id":s} for s in source_ids]}]
        if path.startswith("content_profiles?"):
            return [{"airtable_record_id":profile}]
        if path.startswith("studio_media_transfer_queue?"):
            return deepcopy(crop_rows)
        if path.startswith("media_assets?google_drive_file_id"):
            return [asset(cover_id,cover_drive)]
        if path.startswith("media_assets?airtable_record_id"):
            a=path.split("eq.",1)[1].split("&",1)[0]
            return [asset(a,drives[ids.index(a)])]
        if path.startswith("carousel_slides?deleted"):
            from urllib.parse import unquote
            number=int(unquote(path.split("=cs.",1)[1].split("&",1)[0]).strip("[]"))
            return [deepcopy(s) for s in stored if s["fields"]["PO_Output_ID"]==[number] and not s["deleted_from_carousel"]]
        if path.startswith("carousel_slides?airtable_record_id=in."):
            from urllib.parse import unquote
            ids_query=unquote(path.split("in.(",1)[1].split(")",1)[0]).split(",")
            return [deepcopy(s) for s in stored if s["airtable_record_id"] in ids_query]
        if path.startswith("carousel_slides?id=eq."):
            target=next(s for s in stored if "eq."+s.get("id","")+"&" in path)
            assert method=="PATCH" and target["deleted_from_carousel"] is False
            assert body["fields"]["Approved For Final"] is False
            target.update(deepcopy(body))
            return [deepcopy(target)]
        if path.startswith("carousel_slides?on_conflict"):
            assert method=="POST"
            stored.extend(deepcopy(body))
            return deepcopy(body)
        if path.startswith("platform_outputs?id="):
            target=next(o for o in outputs.values() if "eq."+o["id"]+"&" in path)
            target.update(deepcopy(body)); patches.append(deepcopy(body))
            return [deepcopy(target)]
        raise AssertionError(path)
    class Drive:
        def download_file(self, file_id, **kwargs):
            return (drives[0] if duplicate and file_id == drives[1] else file_id).encode(), "image/jpeg"
    monkeypatch.setattr(g,"_rest",rest)
    if legacy:
        monkeypatch.setattr(g,"_legacy_caption",lambda *args:"Plan a winter visit to Bryant Park. #NYC")
    monkeypatch.setattr(g,"GoogleDriveClient",Drive)
    monkeypatch.setattr(g,"R2UploadClient",lambda:object())
    monkeypatch.setattr(g,"brand_watermark_bytes",lambda client:b"mark")
    monkeypatch.setattr(g,"_cover_jpeg",lambda data:data)
    monkeypatch.setattr(g,"_image_proof",lambda data:"a"*64)
    monkeypatch.setattr(g,"letter_jpeg_bytes",lambda data,text:data)
    monkeypatch.setattr(g,"apply_watermark_bytes",lambda data,mark,**kw:data)
    import hashlib
    monkeypatch.setattr(g,"_stage",lambda uploader,data,pid:(g.CDN+"studio/previews/"+hashlib.sha256(data).hexdigest()+".jpg",hashlib.sha256(data).hexdigest()))
    client=type("Client",(),{"_settings":{}})()
    for oid in outputs:
        marker=g.complete_gallery(client,{"id":rid},{"id":pid},{"id":oid})
        assert marker["slide_count"]==(5 if legacy else 10) and marker["human_approval_required"]
        result=outputs[oid]["selected_assets"]["selected_clips"]
        assert result[0]["is_cover"] is True
        expected = [source_ids[0], *source_ids[2:10]] if duplicate else source_ids[:9]
        assert [x["source_asset_id"] for x in result[1:]]==expected
        assert len(marker["skipped_exact_duplicate_sources"]) == int(duplicate)
        assert len({x["sha256"] for x in result}) == (5 if legacy else 10)
        assert outputs[oid]["selected_clip_count"]==(5 if legacy else 10)
        if legacy:
            assert outputs[oid]["output_caption"].startswith("Plan a winter")
            assert outputs[oid]["error_messages"][g.LEGACY_HOLD]["verification_status"]=="verified_for_human_review"
        assert outputs[oid]["review_status"]=="Review Sent"
        assert outputs[oid]["auto_publish_enabled"] is False
    active=[s for s in stored if not s["deleted_from_carousel"]]
    expected_count=10 if legacy else 20
    assert len(active)==expected_count and len({s["airtable_record_id"] for s in active})==expected_count
    if legacy:
        assert len(stored)==18
        assert all(s["fields"][g.LEGACY_RETIRED]["human_approval_required"] for s in stored if s["deleted_from_carousel"])
    assert all(s["fields"]["Approved For Final"] is False for s in stored)
    assert all(s["fields"]["Shared_Asset_Approved"] is False for s in stored)
    assert all("scheduled_post_date" not in p and "published_at" not in p for p in patches)
    half=expected_count//2
    assert [s["fields"]["Final Image URL"] for s in active[:half]]==[s["fields"]["Final Image URL"] for s in active[half:]]
    assert len(clips)==count and len(crop_rows)==count


def test_native_tiktok_stamps_missing_typed_ratio_without_truncating_photos():
    from studio_produce.stamp import stamp_fields
    clips = [{"order": i+1, "url": f"https://media.chicagoshining.com/studio/previews/item4/example/{i}.jpg",
              "media_asset_record_id": f"rec{i:014d}", "aspect_ratio": "9:16",
              "media_kind": "photo", "durationFrames": 30} for i in range(19)]
    package = {"native": True, "ratio": "9:16", "clips": clips, "clip_count": 19,
               "total_frames": 570, "effective": {"platform": "TikTok", "output_type": "Multi-Photo"},
               "selected_assets_json": json.dumps({"authority": g.AUTHORITY, "aspect_ratio": "9:16",
                                                    "selected_clips": clips}),
               "render_clip_list_json": json.dumps(clips)}
    fields = stamp_fields(package, None, existing={"fields": {"Platform": "TikTok", "Studio_Output_Type": "Multi-Photo"}})
    assert fields["Aspect_Ratio"] == "9:16"
    assert fields["Selected_Clip_Count"] == 19
    assert fields["Output_Status"] == "Ready for Review"
    assert len(json.loads(fields["Selected_Assets_JSON"])["selected_clips"]) == 19
    assert "Aspect_Ratio" not in stamp_fields(package, None, existing={"fields": {"Aspect_Ratio": "9:16"}})
    conflicting = {**package, "clips": [{**clips[0], "aspect_ratio": "4:5"}, *clips[1:]]}
    assert "Aspect_Ratio" not in stamp_fields(conflicting, None)
