"""Read-only exact post-admission reconciliation: no resume or publication writes."""
import hashlib, json, os, re, sqlite3, subprocess, sys, tempfile
from pathlib import Path
import requests
from dotenv import load_dotenv

BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"
PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
# Protected Drive metadata run 46175262381 proved #11240 is a valid
# 53,678,415-byte MP4. This cap is local to the six exact audit artifacts,
# never the producer, storage, or publication path.
LIMIT=64*1024*1024
# Verified canonical identities from the two accepted (never replay) parents.
COHORT=[
 ("recLprSXgeNbgKABG","spj-b8cba2008c3b","recbjg7rXQCiA6DzY",
  "1aae9a3cef8cc1fefb95b70155656760dc993e3252d348f746d94d50dedea852",
  "9fd9c9af7a32b83afb1ca22b1b7238bf05560af645bd64dfffe1fbc6269e6afb",
  [(11240,"recONsGlBKsE8VTdP","job-20261128175132-c6c624aa","1VtnawlN9OBhIyQfOs70C8xCKLTIWb2Dy"),
   (11241,"recKwClsbFCOJaKbC","job-20261128175309-fcd2fa69","1q46LN8Wuwpz9TM_UqOSt3Zr_M5kdf0so")]),
 ("recqfMGjV1CnCP5CB","spj-507e47315148","rec0gE5IoTuSoqy5E",
  "cae8fcf0c3e661c0ba84af5bde37630b8ca97b0d6fdf28e5edad6c8352ee9cc7",
  "8855207430ea046ae85e52808d23ca7cb3d3613c4cf1ebff33e303c868839b73",
  [(11262,"receOfwtyngfyCboh","job-20261128180141-023bba1a","1vzN1xcqNbBFw7lgdwMMBq7PUZBFEW7K5"),
   (11263,"recgCPmQEWy5cA5Nw","job-20261128180244-8e8009e1","1kYejq5tK9cy1nYo6VOLbx4Mj5E1-ALtu")]),
 ("recA97cVeskb9KQBm","spj-204c783abd6c","recQnOwB4Qg9FHIup",
  "44025e7f5c36ee7be229c8bfc18f8a50c5a05956da5418d6c2ba41a3d0552ccb",
  "3a4124902a171fe79989ee69f04d7d1c6c7286fda8688813b5460d83f3cc5753",
  [(11316,"reclCt4yPUBDhPR9Y","job-20261128190630-a62d36ff","1xCY2Mwv1r2WWVaAClbzp4L1u1MjjA2IV"),
   (11317,"recfrU5PjR5d5VwsR","job-20261128190808-9378785a","18kIYqnoqv7SrcJMAADXDl5BNoD7SN8rb")]),
]
PHASE="init"
def require(ok, reason):
    if not ok: raise RuntimeError(reason)

def receipt(row):
    v=(row.get("error_messages") or {}).get("Studio_Story_Voiceover_Receipt_JSON")
    for _ in range(3):
        if isinstance(v,dict): return v
        if isinstance(v,str): v=json.loads(v)
        else: break
    return {}

def stream_exact_media(response, path, expected_size):
    """Reject an oversized/mismatched response before it can fill disk."""
    require(0<expected_size<=LIMIT,"media_size_budget")
    require(response.status_code==200,"media_unavailable")
    declared=response.headers.get("Content-Length")
    require(declared is None or (declared.isdecimal() and int(declared)==expected_size),"media_content_length")
    n=0
    with path.open("wb") as out:
        for chunk in response.iter_content(1024*1024):
            n+=len(chunk)
            require(n<=expected_size,"media_byte_budget")
            out.write(chunk)
    require(n==expected_size,"media_length_mismatch")

def file_sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source,"sha256").hexdigest()

def inspect(path):
    info=json.loads(subprocess.check_output(
        ["ffprobe","-v","error","-count_frames","-show_streams","-show_format","-of","json",str(path)],
        timeout=45,stderr=subprocess.DEVNULL))
    video=[s for s in info["streams"] if s["codec_type"]=="video"]
    audio=[s for s in info["streams"] if s["codec_type"]=="audio"]
    require(len(video)==len(audio)==1,"stream_contract")
    v=video[0]; dur=float(info["format"]["duration"])
    require(v["width"]==1080 and v["height"]==1920 and int(v["nb_read_frames"])==300 and 9.95<=dur<=10.15,"video_contract")
    p=subprocess.run(["ffmpeg","-hide_banner","-nostats","-xerror","-i",str(path),"-map","0:v:0","-map","0:a:0","-af","volumedetect","-f","null","NUL"],capture_output=True,text=True,timeout=60)
    peak=re.search(r"max_volume:\s*(-?[0-9.]+) dB",p.stderr)
    require(p.returncode==0 and peak and float(peak.group(1))>-50,"video_decode_or_audio")
    return {"bytes":path.stat().st_size,"sha256":file_sha256(path),"frames":300,
            "width":1080,"height":1920,"duration":dur,"peak_db":float(peak.group(1)),"decode":"PASS"}

def main():
    global PHASE
    require((BASE/".env").is_file(),"env_missing")
    load_dotenv(BASE/".env",override=False)
    if not os.getenv("PORT"): os.environ["PORT"]="3350"
    PHASE="runner_import"
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    sys.path.insert(0,str(BASE))
    from integrations.google_drive import GoogleDriveClient
    from studio_produce import workload_governor as g
    PHASE="governor"
    require(g.enabled() and not g.recovery_read_only_active() and not g.circuit_open(),"governor_unavailable")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers={"apikey":key,"Authorization":"Bearer "+key}
    PHASE="drive_config"
    drive=GoogleDriveClient()
    PHASE="queue_config"
    queue=Path(os.environ["STUDIO_GOVERNOR_DB_PATH"])
    require(queue.is_absolute() and queue.is_file(),"queue_identity")
    def read(table,ident):
        r=requests.get(PROJECT+"/rest/v1/"+table,params={"airtable_record_id":"eq."+ident,"select":"*","limit":2},headers=headers,timeout=20)
        require(r.ok,"canonical_read_failed")
        rows=r.json()
        require(len(rows)==1 and rows[0]["airtable_record_id"]==ident,"row_identity")
        return rows[0]
    def retired(rid,job):
        with sqlite3.connect(queue.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
            require(not db.execute("SELECT state FROM producer_jobs WHERE request_id=?",(rid,)).fetchall(),"queue_not_retired")
        r=read("production_requests",rid)
        j=r["production_job"]
        require(j["job_id"]==job and j["step"]=="done","canonical_job_not_done")
        return r
    for rid,job,parent,digest,narration_sha,targets in COHORT:
        PHASE="parent"
        req=retired(rid,job)
        parent_row=read("content_items",parent)
        for number,ident,render,drive_id in targets:
            PHASE="canonical"
            r=read("platform_outputs",ident)
            require(r["content_item_id"]==parent_row["id"] and r["output_number"]==number and r["remotion_job_id"]==render,"output_identity")
            require(r["output_status"]=="Ready for Review" and r["render_status"]=="Rendered"
                and r["do_not_publish"] is True and r["auto_publish_enabled"] is False
                and r["publish_status"]=="Not Ready" and not r["review_status"] and r["render_total_frames"]==300
                and not any(r.get(k) for k in ("production_approved_at","scheduled_post_date","studio_scheduled_at","published_at","platform_post_url")),"publication_fence")
            preview=f"https://media.chicagoshining.com/studio/previews/{ident}/jobs/{render}.mp4"
            require(r["studio_preview_url"]==preview and r["final_file_url"]=="https://drive.google.com/file/d/"+drive_id+"/view","artifact_identity")
            rec=receipt(r)
            require(rec.get("state")=="verified" and rec.get("fingerprint")==digest and rec.get("sha256")==narration_sha
                and rec.get("url")==f"https://media.chicagoshining.com/studio/previews/story-voiceover/{parent}/{digest}.mp3"
                and 2<=float(rec.get("seconds",0))<=9.9,"narration_receipt")
            PHASE="transfer"
            with tempfile.TemporaryDirectory(prefix="3159-completed-story-") as tmp:
                a=Path(tmp)/"drive.mp4"; b=Path(tmp)/"preview.mp4"
                with g.resource_slot("transfer",key=f"3159-completed-{number}",limit=1,wait_seconds=5):
                    meta=drive.get_file(drive_id,fields="id,size,mimeType,trashed")
                    # Safe diagnostic: distinguish a size cap from identity, type,
                    # or deletion problems; no raw metadata or file names in logs.
                    size_text=str(meta.get("size") or "")
                    size=int(size_text) if size_text.isdecimal() else 0
                    diagnostic={"output":number,"identity_matches":meta.get("id")==drive_id,
                        "trashed":meta.get("trashed"),"video_mp4":meta.get("mimeType")=="video/mp4",
                        "size_bytes":size,"limit_bytes":LIMIT}
                    print("RECOVERY3159_DRIVE_META="+json.dumps(diagnostic,separators=(",",":")),flush=True)
                    require(diagnostic["identity_matches"] and diagnostic["trashed"] is False,"drive_identity_or_trashed")
                    require(diagnostic["video_mp4"],"drive_mime_type")
                    require(0<size<=LIMIT,"drive_size_budget")
                    # Use the existing Drive credential client, but enforce the
                    # exact metadata size on every streamed chunk, not after download.
                    with requests.get("https://www.googleapis.com/drive/v3/files/"+drive_id,
                        params={"alt":"media","supportsAllDrives":"true"},
                        headers={"Authorization":"Bearer "+drive.access_token()},
                        stream=True,timeout=(5,45),allow_redirects=False) as response:
                        stream_exact_media(response,a,size)
                    with requests.get(preview,stream=True,timeout=(5,45),allow_redirects=False) as response:
                        stream_exact_media(response,b,size)
                    require(drive.get_file(drive_id,fields="id,size,mimeType,trashed")==meta,"drive_metadata_changed")
                PHASE="decode"
                first=inspect(a); second=inspect(b)
                require(first["sha256"]==second["sha256"],"drive_preview_byte_mismatch")
            PHASE="readback"
            require(read("platform_outputs",ident)==r and retired(rid,job)==req,"canonical_changed")
            print("RECOVERY3159_MEDIA="+json.dumps({"output":number,"render_job":render,"drive":first,"preview":second,
                "canonical_unchanged":True,"queue_retired":True,"narration_sha256":narration_sha,"output_writes":0,"provider_writes":0},separators=(",",":")),flush=True)
    print("RECOVERY3159_COMPLETED_MEDIA=PASS",flush=True)
if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("RECOVERY3159_MEDIA_ERROR="+PHASE+"_"+(str(exc) if isinstance(exc,RuntimeError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__),flush=True)
        sys.exit(1)
