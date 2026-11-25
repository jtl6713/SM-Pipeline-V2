import io
import hashlib
from flask import Flask
from PIL import Image
import asset_private_preview as preview

SECRET="test-private-runner-secret-0123456789"
AUTH={"X-Pipeline-Secret":SECRET}
ID=next(iter(preview.SPECS))
PATH="/jobs/assets/private-preview-source/"+ID

def fixture(monkeypatch):
    buf=io.BytesIO()
    Image.new("RGB",(1000,500),"blue").save(buf,"PNG")
    data=buf.getvalue()
    source=preview.Source("exact-test-source",len(data))
    monkeypatch.setitem(preview.SPECS,ID,source)
    row={"airtable_record_id":ID,"asset_status":"Available","active":True,
         "do_not_use":False,"media_class":"Image","mime_type":"image/png",
         "file_size_bytes":source.size,"google_drive_file_id":source.file_id,
         "metadata":{"content_profile_airtable_id":preview.PROFILE,"studio_transfer_id":"ITEM4-MASTER-example"}}
    return source,row,data

def client(reader,downloader,secret=SECRET):
    app=Flask(__name__)
    app.register_blueprint(preview.create_asset_private_preview_blueprint(
        {"pipeline_runner_shared_secret":secret},reader=reader,downloader=downloader))
    return app.test_client()

def test_exact_scope_no_public_auth(monkeypatch):
    fixture(monkeypatch)
    def never(*args): raise AssertionError("unexpected read")
    c=client(never,never)
    assert c.get(PATH).status_code==401
    assert c.get(PATH+"?file_id=another",headers=AUTH).status_code==404
    assert c.get(PATH,headers={**AUTH,"Range":"bytes=0-1"}).status_code==404
    assert c.get("/jobs/assets/private-preview-source/unknown",headers=AUTH).status_code==404
    assert c.head(PATH,headers=AUTH).status_code==404

def test_verified_thumbnail_and_cache_recheck(monkeypatch):
    source,row,data=fixture(monkeypatch)
    calls=[]
    c=client(lambda *args: row,lambda s: calls.append(s) or data)
    response=c.get(PATH,headers=AUTH)
    assert response.status_code==200
    assert response.headers["Content-Type"]=="image/jpeg"
    assert response.headers["X-Asset-Preview-Source-Id"]==source.file_id
    assert response.headers["X-Asset-Preview-Sha256"]==hashlib.sha256(response.data).hexdigest()
    assert response.headers["Cache-Control"]=="private, no-store"
    with Image.open(io.BytesIO(response.data)) as im:
        im.load()
        assert im.size==(720,360)
    assert c.get(PATH,headers=AUTH).status_code==200
    assert calls==[source]
    row["do_not_use"]=True
    assert c.get(PATH,headers=AUTH).status_code==409

def test_changed_scope_and_bytes_fail_closed(monkeypatch):
    source,row,data=fixture(monkeypatch)
    c=client(lambda *args: {**row,"metadata":{**row["metadata"],"content_profile_airtable_id":"other"}},lambda s:data)
    assert c.get(PATH,headers=AUTH).status_code==409
    c=client(lambda *args:row,lambda s:data[:-1])
    assert c.get(PATH,headers=AUTH).status_code==409
    rows=iter([row,{**row,"active":False}])
    c=client(lambda *args:next(rows),lambda s:data)
    assert c.get(PATH,headers=AUTH).status_code==409

def test_invalid_png_rejected():
    import pytest
    with pytest.raises(Exception):
        preview.make_thumbnail(b"not-a-png"*12)
