import pytest
from integrations import r2_upload
from r5 import processor

def test_large_preview_uses_multipart_transport_and_exact_revision(monkeypatch):
    monkeypatch.setattr(processor, "_preview_settings", lambda client: ("https://upload.example", "test-secret", "studio/previews", "https://preview.example"))
    monkeypatch.setattr(r2_upload, "DIRECT_PUT_MAX_BYTES", 8)
    calls=[]
    def put(self, key, handle, mime, size):
        calls.append((self._upload_url(),self._secret(),key,handle.read(),mime,size))
        return {"ok":True,"size":size}
    monkeypatch.setattr(r2_upload.R2UploadClient, "_put_multipart", put)
    key,url=processor._upload_preview(None,output_id="recTest",content=b"123456789",revision_token="job-123")
    assert key=="studio/previews/recTest/jobs/job-123.mp4"
    assert url=="https://preview.example/"+key
    assert calls==[("https://upload.example","test-secret",key,b"123456789","video/mp4",9)]

def test_large_preview_upload_failure_propagates(monkeypatch):
    monkeypatch.setattr(processor, "_preview_settings", lambda client: ("https://upload.example","test-secret","studio/previews","https://preview.example"))
    monkeypatch.setattr(r2_upload,"DIRECT_PUT_MAX_BYTES",8)
    def fail(*args,**kwargs):
        raise RuntimeError("multipart failed")
    monkeypatch.setattr(r2_upload.R2UploadClient,"_put_multipart",fail)
    with pytest.raises(RuntimeError,match="multipart failed"):
        processor._upload_preview(None,output_id="recTest",content=b"123456789",revision_token="job-123")

def test_partial_explicit_config_is_rejected():
    with pytest.raises(ValueError):
        r2_upload.R2UploadClient(upload_url="https://upload.example")
