import hashlib
from flask import Flask
import factory_private_preview as preview

SECRET="test-private-runner-secret-0123456789"
OID="recaV78on0RSfqb31"
DATA=b"\x00\x00\x00\x10ftyp12345678"
AUTH={"X-Pipeline-Secret":SECRET}
PATH="/jobs/factory/private-preview-source/"+OID

def fixture(monkeypatch):
    source=preview.Source("verified-source",hashlib.sha256(DATA).hexdigest(),len(DATA))
    monkeypatch.setitem(preview.SPECS,OID,source)
    row={"airtable_record_id":OID,"output_status":"Ready for Review",
         "review_status":"Review Sent","publish_status":"Not Ready",
         "do_not_publish":False,"auto_publish_enabled":False,
         "final_file_url":"https://drive.google.com/file/d/"+source.file_id+"/view",
         "error_messages":{"Final_File_ID":source.file_id,
           "SM_2618_Creative_Rework_Plan":{"candidate_sha256":source.sha256},
           "SM_2618_Factory_Review_Handoff":{"corrected_final_drive_id":source.file_id,
             "candidate_sha256":source.sha256,"human_factory_approval_pending":True,
             "publishing_authorized":False}}}
    return source,row

def client(reader,downloader,secret=SECRET):
    app=Flask(__name__)
    app.register_blueprint(preview.create_factory_private_preview_blueprint(
        {"pipeline_runner_shared_secret":secret},reader=reader,downloader=downloader))
    return app.test_client()

def test_auth_exact_scope_and_no_range(monkeypatch):
    source,row=fixture(monkeypatch)
    def never(*args): raise AssertionError("unexpected source read")
    c=client(never,never)
    assert c.get(PATH).status_code==401
    assert client(never,never,"").get(PATH,headers=AUTH).status_code==401
    assert c.get(PATH+"?file_id=other",headers=AUTH).status_code==404
    assert c.get("/jobs/factory/private-preview-source/other",headers=AUTH).status_code==404
    assert c.get(PATH,headers={**AUTH,"Range":"bytes=0-1"}).status_code==404

def test_exact_verified_bytes_and_double_authority(monkeypatch):
    source,row=fixture(monkeypatch)
    calls=[]
    def reader(settings,oid):
        calls.append(oid)
        return row
    c=client(reader,lambda s: DATA if s==source else b"")
    response=c.get(PATH,headers=AUTH)
    assert response.status_code==200
    assert response.data==DATA
    assert response.headers["X-Factory-Source-Sha256"]==source.sha256
    assert response.headers["Cache-Control"]=="private, no-store"
    assert calls==[OID,OID]

def test_state_changes_and_invalid_bytes_are_denied(monkeypatch):
    source,row=fixture(monkeypatch)
    c=client(lambda *args: {**row,"published_at":"now"},lambda s: DATA)
    assert c.get(PATH,headers=AUTH).status_code==409
    c=client(lambda *args: row,lambda s: DATA[:-1])
    assert c.get(PATH,headers=AUTH).status_code==409
    rows=iter([row,{**row,"do_not_publish":True}])
    c=client(lambda *args: next(rows),lambda s: DATA)
    assert c.get(PATH,headers=AUTH).status_code==409

def test_busy_slot_rejects_without_read(monkeypatch):
    source,row=fixture(monkeypatch)
    assert preview.SLOT.acquire(blocking=False)
    try:
        c=client(lambda *a: row,lambda s: DATA)
        assert c.get(PATH,headers=AUTH).status_code==429
    finally:
        preview.SLOT.release()
