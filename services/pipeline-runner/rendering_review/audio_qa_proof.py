"""Private, read-only media QA proof for *existing* Chicago #8447 V2.

No render, no Drive upload, no Airtable mutation. Download each exact owned MP4,
verify its whole-file digest, then compare COPY-mode video and audio bitstream
hashes. The corrected V2 must have the exact original V2 video and V1 audio.
"""
from __future__ import annotations
import hashlib
import os
import subprocess
import tempfile

V1=("1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4",
    "e2ea35272fa911d92d265e5732641a06aac1b3d41f8d55fd16f26985f366104b")
V2=("1MgyPrgEDWUFwdX--uZamtK8_fvY7Nki3",
    "74a9ec2018e51bf5d6a2f041e3d080d7b188da896578a85ad3fa24a3ca2ab31e")
CORRECTED=("1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up",
    "8ee06c1f0234959c5ff4610b020d6bb72a005200ffa5d6590d920754b3c0f77e")
EXPECTED_BYTES=21961807

class AudioRepairProofFailed(RuntimeError): pass

def _packet_hash(filename: str, stream: str) -> str:
    cmd=["ffmpeg","-hide_banner","-nostdin","-v","error",
         "-i",filename,"-map",stream,"-c","copy",
         "-f","hash","-hash","SHA256","-"]
    result=subprocess.run(cmd,capture_output=True,text=True,timeout=45,check=True)
    digest=result.stdout.strip()
    if not digest.startswith("SHA256=") or len(digest)!=71:
        raise AudioRepairProofFailed("media_stream_digest_unverified")
    return digest

def verify_8447_audio_repair(drive=None) -> dict:
    if drive is None:
        from integrations.google_drive import GoogleDriveClient
        drive=GoogleDriveClient()
    files={}
    with tempfile.TemporaryDirectory(prefix="review8447_qa_") as tmp:
        for name,(file_id,expected_digest) in (
            ("original",V1),("rendered",V2),("corrected",CORRECTED)):
            metadata=drive.get_file(file_id)
            if metadata.get("id")!=file_id or metadata.get("mimeType")!="video/mp4":
                raise AudioRepairProofFailed("private_drive_file_identity_unverified")
            file_path=os.path.join(tmp,name+".mp4")
            result_path,mime=drive.download_file_to_path(file_id,file_path,timeout=120)
            if result_path!=file_path or mime not in ("video/mp4","application/octet-stream"):
                raise AudioRepairProofFailed("private_drive_download_invalid")
            digest=hashlib.sha256()
            size=0
            with open(file_path,"rb") as f:
                for part in iter(lambda:f.read(1048576),b""):
                    size+=len(part);digest.update(part)
            if digest.hexdigest()!=expected_digest or size<100000 or (
                name=="corrected" and size!=EXPECTED_BYTES):
                raise AudioRepairProofFailed("private_media_sha256_mismatch")
            files[name]=file_path
        if _packet_hash(files["rendered"],"0:v:0") != _packet_hash(files["corrected"],"0:v:0"):
            raise AudioRepairProofFailed("repaired_v2_video_bitstream_changed")
        if _packet_hash(files["original"],"0:a:0") != _packet_hash(files["corrected"],"0:a:0"):
            raise AudioRepairProofFailed("original_v1_audio_bitstream_not_preserved")
        return {"verified":True,"original_file_id":V1[0],
            "previous_file_id":V2[0],"corrected_file_id":CORRECTED[0],
            "corrected_sha256":CORRECTED[1],"byte_count":EXPECTED_BYTES,
            "v2_video_unchanged":True,"v1_audio_unchanged":True,
            "public_post_created":False}
