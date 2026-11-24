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
        prior = db.execute("SELECT transfer_id FROM smv1_crop_attempts WHERE record_id=?", (record_id,)).fetchone()
        if prior and prior[0] != transfer_id:
            raise RuntimeError("crop transfer identity changed")
        db.execute("""INSERT INTO smv1_crop_attempts(record_id,transfer_id,claim_at,owner_pid)
            VALUES(?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET
            claim_at=excluded.claim_at,owner_pid=excluded.owner_pid""",
            (record_id,transfer_id,stamp,os.getpid()))
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


def reserved_upload(drive, record_id, transfer_id, folder, filename, content):
    """Reconcile a lost response by exact pre-generated ID, checksum and folder."""
    from supabase_pipeline import mint_record_id
    import requests
    digest = hashlib.md5(content, usedforsecurity=False).hexdigest()
    r = receipt(record_id)
    if not r or r["transfer_id"] != transfer_id or r["owner_pid"] != os.getpid():
        raise RuntimeError("crop upload has no current durable claim receipt")
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
        r = receipt(record_id)
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
    existing = lookup()
    if existing is None:
        try:
            drive.upload_file(folder,filename,content,"image/jpeg",reserved_id=file_id)
        except requests.HTTPError as exc:
            if getattr(exc.response,"status_code",None)!=409:
                raise
        existing = lookup()
    if not existing or existing.get("id")!=file_id or existing.get("name")!=filename or existing.get("mimeType")!="image/jpeg" or str(existing.get("size"))!=str(len(content)) or existing.get("md5Checksum")!=digest or folder not in (existing.get("parents") or []) or existing.get("trashed") is not False:
        raise RuntimeError("reserved crop Drive receipt could not be verified")
    return existing,r["media_id"]
