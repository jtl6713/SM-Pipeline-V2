import hashlib
import io
from PIL import Image
import pytest
from studio_produce.quality_native_media_rebuild import compose, validate, stage

def jpeg():
    out=io.BytesIO()
    Image.new("RGB",(1080,1350),(125,170,210)).save(out,format="JPEG")
    return out.getvalue()

def payload():
    digest="a"*64
    return dict(output=10857,record_id="rec8I104V9gQmiOxf",target_version="2026-11-23T04:55:01Z",
        source_output=10855,source_version="2026-11-23T18:27:58Z",idea_id="recIdea0000000001",
        token="11111111-1111-4111-8111-111111111111",assets=[
            dict(index=i,media_asset_id="recSource0000000"+str(i),asset_name="Ferry "+str(i),
            drive_id="drive"+str(i),transfer_id="LIB-"+str(i),
            source_url=f"https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2221/slide-{i:02d}-{digest[:16]}.jpg",
            source_hash_prefix=digest[:16],branded_sha256=digest,
            branded_url=f"https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2221/shared-small-bottom-right/slide-{i:02d}-{digest[:16]}.jpg")
            for i in (1,2)])

def test_exact_payload_and_url_limits():
    validate(payload())
    for key,value in [("source_url","https://evil.example/a.jpg"),("branded_url","https://evil.example/b.jpg"),
                      ("source_hash_prefix","b"*16),("index",3)]:
        p=payload();p["assets"][0][key]=value
        with pytest.raises(ValueError): validate(p)
    p=payload();p["assets"][1]["media_asset_id"]=p["assets"][0]["media_asset_id"]
    with pytest.raises(ValueError): validate(p)

def test_vertical_preserves_source_and_corner_mark():
    data=jpeg();mark=Image.new("RGBA",(1024,1536),(250,0,0,255))
    vertical=compose(data,mark)
    with Image.open(io.BytesIO(vertical)) as image:
        assert image.size==(1080,1920)
        assert max(image.getpixel((20,20)))<5
        assert image.getpixel((540,960))[2]>150
        assert image.getpixel((990,1800))[0]>220
    assert hashlib.sha256(compose(data,mark,(1080,1350))).digest()==hashlib.sha256(compose(data,mark,(1080,1350))).digest()

def test_no_stage_without_current_worker_lease():
    class NoIO:
        def __getattr__(self,key):
            raise AssertionError("no I/O without lease")
    with pytest.raises(RuntimeError,match="lease"):
        stage(payload(),drive=NoIO(),uploader=NoIO(),renew=lambda *_:False)


def test_stage_reproduces_verified_source_then_builds_and_checks_vertical(monkeypatch):
    import studio_produce.quality_native_media_rebuild as mod
    mark=Image.new("RGBA",(1024,1536),(250,0,0,255))
    buf=io.BytesIO()
    mark.save(buf,format="PNG")
    watermark=buf.getvalue().ljust(2075758,b"\x00")
    monkeypatch.setattr(mod,"WATERMARK_SHA",hashlib.sha256(watermark).hexdigest())
    original=jpeg()
    orig_sha=hashlib.sha256(original).hexdigest()
    branded=compose(original,mark,(1080,1350))
    branded_sha=hashlib.sha256(branded).hexdigest()
    p=payload()
    for a in p["assets"]:
        i=a["index"]
        a["source_hash_prefix"]=orig_sha[:16]
        a["source_url"]=f"{mod.BASE}studio/previews/repairs/issue2371/nyc-2221/slide-{i:02d}-{orig_sha[:16]}.jpg"
        a["branded_sha256"]=branded_sha
        a["branded_url"]=f"{mod.BASE}studio/previews/repairs/issue2371/nyc-2221/shared-small-bottom-right/slide-{i:02d}-{branded_sha[:16]}.jpg"
    class Drive:
        def download_file(self,file_id):
            assert file_id==mod.WATERMARK_ID
            return watermark,"image/png"
    uploads={}
    class Uploader:
        def put_object(self,key,data,mime):
            assert key.startswith("studio/previews/watermarked/quality-native-rebuild/")
            assert mime=="image/jpeg"
            uploads[mod.BASE+key]=data
    def read(url,expected,geometry,*,prefix=False):
        data=uploads[url] if url in uploads else (branded if "shared-small-bottom-right" in url else original)
        sha=hashlib.sha256(data).hexdigest()
        assert sha.startswith(expected) if prefix else sha==expected
        with Image.open(io.BytesIO(data)) as im: assert im.size==geometry
        return data,sha
    result=stage(p,drive=Drive(),uploader=Uploader(),read=read,renew=lambda *_:True)
    assert result["verified"] is True
    assert result["provider_writes"]==result["source_writes"]==0
    assert len(result["assets"])==len(uploads)==2
    assert all(a["cdn_verified"] and a["geometry"]=="1080x1920" for a in result["assets"])
    uploads.clear()
    # Supply genuinely different pixels while pretending the source prefix
    # matched; full reproduction must still block before any R2 write.
    altered=io.BytesIO()
    Image.new("RGB",(1080,1350),(5,20,40)).save(altered,format="JPEG")
    def mismatched_pixels(url,expected,geometry,*,prefix=False):
        return (altered.getvalue(),orig_sha) if prefix else read(url,expected,geometry)
    with pytest.raises(RuntimeError,match="source_lineage_reproduction_failed"):
        stage(p,drive=Drive(),uploader=Uploader(),read=mismatched_pixels,renew=lambda *_:True)
    assert not uploads
