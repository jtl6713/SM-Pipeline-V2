import hashlib
import subprocess
import sys
import time
import pytest
import requests
from studio_produce import workload_governor as g
from item4 import restart_recovery as rr

@pytest.fixture(autouse=True)
def isolated(tmp_path,monkeypatch):
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED","true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH",str(tmp_path/"governor.sqlite"))
    monkeypatch.delenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY",raising=False)

def test_maintenance_fences_new_roots_but_not_active_children():
    token="a"*32
    with g.resource_slot("smv1_drain",wait_seconds=0):
        assert g.set_smv1_maintenance(token,begin=True)
        with g.resource_slot("transfer",key="recOne",wait_seconds=0):
            assert g.resource_active("transfer","recOne")
    g.enqueue("recProducer")
    assert g.claim_next() is None
    assert not g.claim_worker_heavy("recWorker","b"*32)
    with pytest.raises(g.AdmissionDeferred):
        with g.resource_slot("smv1_drain",wait_seconds=0):
            pytest.fail("maintenance must block root")
    assert not g.set_smv1_maintenance("b"*32,begin=False)
    assert g.set_smv1_maintenance(token,begin=False)
    with g.resource_slot("smv1_drain",wait_seconds=0):
        assert g.snapshot()["active_resource_slots"]["smv1_drain"]==1

def test_real_child_exit_does_not_require_twenty_minute_expiry(monkeypatch):
    code="from studio_produce import workload_governor as g; import os; c=g.resource_slot('smv1_drain',key='dead',wait_seconds=0); c.__enter__(); os._exit(0)"
    subprocess.run([sys.executable,"-c",code],check=True,timeout=20)
    with pytest.raises(g.AdmissionDeferred):
        with g.resource_slot("smv1_drain",wait_seconds=0):
            pytest.fail("first observation needs settling grace")
    with g._connect() as db:
        assert db.execute("SELECT owner_dead_seen_at FROM resource_leases WHERE lease_key='dead'").fetchone()[0]
        db.execute("UPDATE resource_leases SET owner_dead_seen_at=? WHERE lease_key='dead'",(time.time()-121,))
    with g.resource_slot("smv1_drain",key="new",wait_seconds=0):
        assert not g.resource_active("smv1_drain","dead")
        assert g.resource_active("smv1_drain","new")

def test_unknown_live_and_cross_host_leases_are_preserved():
    with g._connect() as db:
        for scope,key,pid in [("smv1_drain","legacy",None),("photo_group","live",g.os.getpid()),("worker_heavy","remote",999999)]:
            db.execute("INSERT INTO resource_leases(scope,lease_key,token,lease_until,owner_pid,owner_dead_seen_at) VALUES(?,?,?,?,?,?)",(scope,key,key,time.time()+500,pid,time.time()-500))
    with pytest.raises(g.AdmissionDeferred):
        with g.resource_slot("smv1_drain",wait_seconds=0):
            pytest.fail("unknown ownership must fail closed")
    assert g.resource_active("smv1_drain","legacy")
    assert g.resource_active("photo_group","live")
    assert g.resource_active("worker_heavy","remote")

class Drive:
    def __init__(self): self.files={};self.uploads=0;self.ids=0;self.lost=True
    def generate_file_id(self): self.ids+=1;return "drive-reserved"
    def get_file(self,fid,**kw):
        if fid not in self.files:
            response=requests.Response();response.status_code=404
            raise requests.HTTPError(response=response)
        return self.files[fid]
    def upload_file(self,folder,name,data,mime,*,reserved_id):
        self.uploads+=1
        self.files[reserved_id]={"id":reserved_id,"name":name,"mimeType":mime,"size":str(len(data)),"md5Checksum":hashlib.md5(data,usedforsecurity=False).hexdigest(),"parents":[folder],"trashed":False}
        if self.lost: self.lost=False;raise requests.Timeout("response lost")
        return self.files[reserved_id]

def test_upload_commit_then_lost_response_uses_same_id_and_media_identity():
    rr.register_claim("recCrop","transfer","2026-11-24T00:00:00+00:00")
    drive=Drive()
    with pytest.raises(requests.Timeout):
        rr.reserved_upload(drive,"recCrop","transfer","folder","photo.jpg",b"bytes")
    prior=rr.receipt("recCrop")
    rr.register_claim("recCrop","transfer","2026-11-24T00:01:00+00:00")
    f,m=rr.reserved_upload(drive,"recCrop","transfer","folder","photo.jpg",b"bytes")
    assert f["id"]==prior["drive_id"] and m==prior["media_id"]
    assert drive.uploads==1 and drive.ids==1
    with pytest.raises(RuntimeError,match="bytes or destination changed"):
        rr.reserved_upload(drive,"recCrop","transfer","folder","photo.jpg",b"changed")

def test_recovery_requires_exact_claim_and_positive_death(monkeypatch):
    rr.register_claim("recCrop","transfer","2026-11-24T00:00:00+00:00")
    assert not rr.recoverable_claim("recCrop","transfer","2026-11-24T00:00:00Z")
    monkeypatch.setattr(g,"_process_definitely_exited",lambda pid:True)
    assert rr.recoverable_claim("recCrop","transfer","2026-11-24T00:00:00Z")
    assert not rr.recoverable_claim("recCrop","different","2026-11-24T00:00:00Z")
    assert not rr.recoverable_claim("recCrop","transfer","2026-11-24T00:01:00Z")
    assert not rr.recoverable_claim("recLegacy","transfer","2026-11-24T00:00:00Z")
    with g.resource_slot("transfer",key="recCrop",wait_seconds=0):
        assert not rr.recoverable_claim("recCrop","transfer","2026-11-24T00:00:00Z")

def test_restart_queue_is_persistent_bounded_and_admission_aware():
    assert rr.remember_request("recExact")
    assert rr.remember_request("recExact")
    assert not rr.remember_request("recTest","test-only")
    with g._connect() as db:
        assert db.execute("SELECT count(*) FROM smv1_pending_requests").fetchone()[0]==1
        db.execute("UPDATE smv1_pending_requests SET next_at=0")
    assert rr.next_request()=="recExact"
    token="c"*32
    assert g.set_smv1_maintenance(token,begin=True)
    assert rr.next_request() is None
    assert g.set_smv1_maintenance(token,begin=False)
    for _ in range(8): rr.defer_request("recExact")
    assert rr.next_request() is None
    with g._connect() as db:
        assert db.execute("SELECT failures FROM smv1_pending_requests").fetchone()[0]==8
    rr.finish_request("recExact")
    with g._connect() as db:
        assert db.execute("SELECT count(*) FROM smv1_pending_requests").fetchone()[0]==0

def test_deploy_script_fences_before_normal_stop_and_releases():
    from pathlib import Path
    script=(Path(__file__).resolve().parents[3]/"deploy/local-services/Deploy-SMService.ps1").read_text(encoding="utf-8")
    normal=script.split("Write-Step '5/8  Stop only the selected service'",1)[1]
    assert normal.index("Enter-Smv1DeploymentMaintenance")<normal.index("Stop-LocalService")
    assert "finally { Exit-Smv1DeploymentMaintenance }" in normal
    assert "legacy runner busy; defer bootstrap" in script
