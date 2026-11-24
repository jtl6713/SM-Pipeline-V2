"""Durable local SMV1 execution receipts. Supabase remains content authority.

A reservation is written before the external Drive create. Retry uses the
same provider-generated file ID and canonical media record identity, not a
filename search or a second create. Legacy unjournaled claims fail closed.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime
from studio_produce import workload_governor as governor


def register_claim(record_id, transfer_id, stamp):
    if not record_id or not transfer_id:
        raise ValueError("exact crop transfer identity required")
    with governor._connect() as db:
        governor._transaction(db)
        lease=db.execute("""SELECT token FROM resource_leases WHERE scope='transfer' AND lease_key=?
            AND owner_pid=? AND lease_until>?""",(record_id,os.getpid(),__import__("time").time())).fetchone()
        if not lease:
            raise governor.AdmissionDeferred("exact crop transfer lease not held")
        prior = db.execute("SELECT transfer_id FROM smv1_crop_attempts WHERE record_id=?", (record_id,)).fetchone()
        if prior and prior[0] != transfer_id:
            raise RuntimeError("crop transfer identity changed")
        db.execute("""INSERT INTO smv1_crop_attempts(record_id,transfer_id,claim_at,owner_pid,lease_token)
            VALUES(?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET
            claim_at=excluded.claim_at,owner_pid=excluded.owner_pid,lease_token=excluded.lease_token""",
            (record_id,transfer_id,stamp,os.getpid(),lease[0]))
        db.commit()


def receipt(record_id):
    with governor._connect() as db:
        db.row_factory = __import__("sqlite3").Row
        row = db.execute("SELECT * FROM smv1_crop_attempts WHERE record_id=?", (record_id,)).fetchone()
        return dict(row) if row else None


def _instant(s):
    return datetime.fromisoformat(str(s).replace("Z","+00:00"))


def recoverable_claim(record_id, transfer_id, stamp):
    r = receipt(record_id)
    if not r or r["transfer_id"] != transfer_id:
        return False
    try:
        exact = _instant(r["claim_at"]) == _instant(stamp)
    except (TypeError, ValueError):
        return False
    return exact and governor._process_definitely_exited(r["owner_pid"]) and not governor.resource_active("transfer",record_id)


def assert_current_claim(record_id,transfer_id,claim_at):
    r=receipt(record_id)
    if not r or r["transfer_id"]!=transfer_id or r["claim_at"]!=claim_at or r["owner_pid"]!=os.getpid():
        raise governor.AdmissionDeferred("crop attempt ownership changed")
    with governor._connect() as db:
        live=db.execute("""SELECT 1 FROM resource_leases WHERE scope='transfer'
            AND lease_key=? AND token=? AND owner_pid=? AND lease_until>?""",
            (record_id,r["lease_token"],os.getpid(),__import__("time").time())).fetchone()
    if not live:
        raise governor.AdmissionDeferred("crop attempt lease lost")
    return r


def claim_row_path(record_id,transfer_id,claim_at):
    from urllib.parse import quote
    return (f"studio_media_transfer_queue?airtable_record_id=eq.{quote(record_id,safe='')}"
            f"&status=eq.Processing&last_attempt_at=eq.{quote(claim_at,safe='')}"
            f"&payload->>transfer_id=eq.{quote(transfer_id,safe='')}")


def read_claim(client,record_id,transfer_id,claim_at):
    from supabase_pipeline import _rest
    assert_current_claim(record_id,transfer_id,claim_at)
    rows=_rest(client._settings,claim_row_path(record_id,transfer_id,claim_at)+"&select=airtable_record_id,payload&limit=1","GET")
    if not isinstance(rows,list) or len(rows)!=1 or not isinstance(rows[0].get("payload"),dict):
        raise governor.AdmissionDeferred("canonical crop claim no longer current")
    return rows[0]


def finish_claim(client,record_id,transfer_id,claim_at,fields):
    from supabase_pipeline import _rest,_queue_row
    from urllib.parse import quote
    import json
    prior=read_claim(client,record_id,transfer_id,claim_at)
    patch=_queue_row({"fields":fields})
    if isinstance(patch.get("payload"),dict):
        patch["payload"]={**prior["payload"],**patch["payload"]}
    assert_current_claim(record_id,transfer_id,claim_at)
    observed=quote(json.dumps(prior["payload"],separators=(",",":")),safe="")
    rows=_rest(client._settings,claim_row_path(record_id,transfer_id,claim_at)+
        f"&payload=eq.{observed}&select=airtable_record_id,status,payload",
        "PATCH",patch,prefer="return=representation")
    if not isinstance(rows,list) or len(rows)!=1 or rows[0].get("airtable_record_id")!=record_id:
        raise governor.AdmissionDeferred("canonical crop completion claim changed")
    if rows[0].get("status")!=patch.get("status"):
        raise RuntimeError("canonical crop completion did not verify")
    return rows[0]


def reserved_upload(drive, record_id, transfer_id, folder, filename, content, *, claim_at):
    """Reconcile a lost response by exact pre-generated ID, checksum and folder."""
    from supabase_pipeline import mint_record_id
    import requests
    digest = hashlib.md5(content, usedforsecurity=False).hexdigest()
    r = assert_current_claim(record_id,transfer_id,claim_at)
    newly_reserved=False
    if not r["drive_id"]:
        file_id = drive.generate_file_id()
        media_id = mint_record_id()
        with governor._connect() as db:
            governor._transaction(db)
            changed = db.execute("""UPDATE smv1_crop_attempts SET drive_id=?,media_id=?,digest=?,size=?,folder=?,filename=?
                WHERE record_id=? AND transfer_id=? AND owner_pid=? AND claim_at=? AND drive_id IS NULL""",
                (file_id,media_id,digest,len(content),folder,filename,record_id,transfer_id,os.getpid(),r["claim_at"])).rowcount
            db.commit()
        if changed != 1:
            raise RuntimeError("crop upload reservation changed")
        r = assert_current_claim(record_id,transfer_id,claim_at)
        newly_reserved=True
    if (r["digest"],r["size"],r["folder"],r["filename"]) != (digest,len(content),folder,filename):
        raise RuntimeError("reserved crop bytes or destination changed; new revision required")
    file_id = r["drive_id"]
    def lookup():
        try:
            return drive.get_file(file_id, fields="id,name,mimeType,size,md5Checksum,parents,trashed,webViewLink")
        except requests.HTTPError as exc:
            if getattr(exc.response,"status_code",None)==404:
                return None
            raise
    existing = None if newly_reserved else lookup()
    if existing is None:
        assert_current_claim(record_id,transfer_id,claim_at)
        try:
            drive.upload_file(folder,filename,content,"image/jpeg",reserved_id=file_id)
        except requests.HTTPError as exc:
            if getattr(exc.response,"status_code",None)!=409:
                raise
        existing = lookup()
    if not existing or existing.get("id")!=file_id or existing.get("name")!=filename or existing.get("mimeType")!="image/jpeg" or str(existing.get("size"))!=str(len(content)) or existing.get("md5Checksum")!=digest or folder not in (existing.get("parents") or []) or existing.get("trashed") is not False:
        raise RuntimeError("reserved crop Drive receipt could not be verified")
    assert_current_claim(record_id,transfer_id,claim_at)
    return existing,r["media_id"]

# A local durable dispatch hint is written before attempting admission. The
# canonical queue, not this hint, decides whether work exists after restart.
import logging
import re
import threading
import time

_log = logging.getLogger("pipeline-runner.smv1-recovery")
_wake = threading.Event()
_start_lock = threading.Lock()
_started = False


def remember_request(request_id, test_run_id=None):
    if not governor.enabled() or test_run_id or not re.fullmatch(r"rec[A-Za-z0-9]{1,64}",str(request_id or "")):
        return False
    with governor._connect() as db:
        changed = db.execute("INSERT OR IGNORE INTO smv1_pending_requests(request_id,next_at) VALUES(?,?)",
                             (request_id,time.time()+5)).rowcount
    if changed:
        _wake.set()
    return True


def next_request():
    with governor._connect() as db:
        if governor.admission_paused() or governor.circuit_open(db) or governor.smv1_maintenance_active(db):
            return None
        row=db.execute("SELECT request_id FROM smv1_pending_requests WHERE next_at<=? AND failures<8 ORDER BY next_at,request_id LIMIT 1",(time.time(),)).fetchone()
        return row[0] if row else None


def defer_request(request_id, *, admission=False, progressed=False):
    with governor._connect() as db:
        governor._transaction(db)
        row=db.execute("SELECT failures FROM smv1_pending_requests WHERE request_id=?",(request_id,)).fetchone()
        if row:
            failures=0 if progressed else row[0]+(0 if admission else 1)
            delay=5 if admission or progressed else min(120,5*(2**min(failures,5)))
            db.execute("UPDATE smv1_pending_requests SET failures=?,next_at=? WHERE request_id=?",
                       (failures,time.time()+delay,request_id))
            if failures==8:
                _log.error("SMV1 exact recovery parked after bounded no-progress attempts request=%s",request_id)
        db.commit()


def finish_request(request_id):
    with governor._connect() as db:
        db.execute("DELETE FROM smv1_pending_requests WHERE request_id=?",(request_id,))


def consume_once():
    from item4 import processor
    request_id=next_request()
    if not request_id:
        return False
    try:
        # One host-wide root remains the admission authority. No blind replay:
        # the processor reads the existing canonical transfer queue.
        processor.process_drain(production_request_record_id=request_id,
                                photo_workers=1,max_followup=1,_recovery_dispatch=True)
    except governor.AdmissionDeferred:
        defer_request(request_id,admission=True)
    except Exception:
        _log.exception("SMV1 exact restart recovery failed request=%s",request_id)
        defer_request(request_id)
    return True


def _consume():
    while True:
        try:
            consume_once()
        except Exception:
            _log.exception("SMV1 durable recovery consumer failed")
        _wake.wait(5)
        _wake.clear()


def start_consumer():
    global _started
    if not governor.enabled():
        return
    with _start_lock:
        if _started:
            return
        with governor._connect() as db:
            db.execute("SELECT 1")
        threading.Thread(target=_consume,daemon=True,name="smv1-durable-recovery").start()
        _started=True
