"""Read-only exact post-admission reconciliation: no resume or publication writes."""
import hashlib, json, os, re, sqlite3, subprocess, sys, tempfile
from pathlib import Path
import requests
from dotenv import load_dotenv

BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"
PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
LIMIT=32*1024*1024
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
    return {"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"frames":300,
            "width":1080,"height":1920,"duration":dur,"peak_db":float(peak.group(1)),"decode":"PASS"}

def main():
    global PHASE
    require((BASE/".env").is_file(),"env_missing")
    load_dotenv(BASE/".env",override=False)
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    sys.path.insert(0,str(BASE))
    from integrations.google_drive import GoogleDriveClient
    from studio_produce import workload_governor as g
    require(g.enabled() and not g.recovery_read_only_active() and not g.circuit_open(),"governor_unavailable")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers={"apikey":key,"Authorization":"Bearer "+key}
    drive=GoogleDriveClient()
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
                    require(meta["id"]==drive_id and not meta.get("trashed") and 0<int(meta["size"])<=LIMIT,"drive_size_or_identity")
                    drive.download_file_to_path(drive_id,str(a),timeout=45)
                    require(0<a.stat().st_size<=LIMIT,"drive_byte_budget")
                    with requests.get(preview,stream=True,timeout=30,allow_redirects=False) as response:
                        require(response.status_code==200,"preview_unavailable")
                        n=0
                        with b.open("wb") as f:
                            for chunk in response.iter_content(65536):
                                n+=len(chunk); require(n<=LIMIT,"preview_byte_budget"); f.write(chunk)
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
