"""Exact read-only held production MP4 and source media proof."""
import hashlib, json, os, re, subprocess, sys, tempfile
from pathlib import Path
import requests
from dotenv import load_dotenv
from PIL import Image
import io

BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"
PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
RID = "rechGp2O1CBjGyetM"
FINAL = "1EcuG21eFX8R7XkZYsexJy7fHmU0n-peb"
SOURCE = "1EgIBiTSwTFGQSh2VoHrl-NuyoBnHV6Ok"
ASSET = "recayLODxfDnX1rVG"
PREVIEW = "https://media.chicagoshining.com/studio/previews/rechGp2O1CBjGyetM/jobs/job-20261126025808-942b43a1.mp4"
LIMIT = 64 * 1024 * 1024
def require(ok, reason):
    if not ok: raise RuntimeError(reason)
def main():
    require((BASE/".env").is_file(), "env_missing")
    load_dotenv(BASE/".env",override=False)
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    sys.path.insert(0,str(BASE))
    from integrations.google_drive import GoogleDriveClient
    from studio_produce import workload_governor as g
    require(g.enabled() and not g.recovery_read_only_active() and not g.circuit_open(),"governor_unavailable")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers={"apikey":key,"Authorization":"Bearer "+key}
    def read():
        res=requests.get(PROJECT+"/rest/v1/platform_outputs",params={"airtable_record_id":"eq."+RID,"select":"output_number,content_profile_id,output_status,render_status,review_status,publish_status,do_not_publish,auto_publish_enabled,final_file_url,studio_preview_url,render_total_frames,studio_effective_voiceover_mode,studio_effective_background_music_mode,selected_assets,remotion_job_id,published_at,platform_post_url,updated_at","limit":2},headers=headers,timeout=20)
        require(res.ok,"canonical_read_failed")
        rows=res.json()
        require(len(rows)==1,"row_identity")
        return rows[0]
    r=read()
    require(r["output_number"]==11246 and r["content_profile_id"]=="65e9071a-d2fd-4898-88a4-111bf8a3bfb5" and r["output_status"]=="Ready for Review" and r["render_status"]=="Rendered" and r["do_not_publish"] is True and r["auto_publish_enabled"] is False and not r["review_status"] and not r["published_at"] and not r["platform_post_url"] and r["publish_status"]=="Not Ready","hold_or_revision_changed")
    require(r["final_file_url"]=="https://drive.google.com/file/d/"+FINAL+"/view" and r["studio_preview_url"]==PREVIEW and r["remotion_job_id"]=="job-20261126025808-942b43a1" and r["render_total_frames"]==805 and r["studio_effective_voiceover_mode"]==r["studio_effective_background_music_mode"]=="Yes","media_identity_changed")
    clip=r["selected_assets"]["selected_clips"][0]
    require(clip["media_asset_record_id"]==ASSET and clip["google_drive_file_id"]==SOURCE,"source_identity_changed")
    drive=GoogleDriveClient()
    def inspect(path):
        args=["ffprobe","-v","error","-count_frames","-show_streams","-show_format","-of","json",str(path)]
        info=json.loads(subprocess.check_output(args,timeout=60,stderr=subprocess.DEVNULL))
        vs=[x for x in info["streams"] if x["codec_type"]=="video"]
        aud=[x for x in info["streams"] if x["codec_type"]=="audio"]
        require(len(vs)==len(aud)==1,"stream_contract")
        v=vs[0]
        require(v["width"]==1080 and v["height"]==1920 and abs(int(v["nb_read_frames"])-805)<=1,"frame_contract")
        check=subprocess.run(["ffmpeg","-hide_banner","-nostats","-xerror","-i",str(path),"-map","0:v:0","-map","0:a:0","-af","volumedetect","-f","null","NUL"],capture_output=True,text=True,timeout=90)
        require(check.returncode==0,"decode_failed")
        m=re.search(r"mean_volume:\s*(-?[0-9.]+) dB",check.stderr)
        peak=re.search(r"max_volume:\s*(-?[0-9.]+) dB",check.stderr)
        require(m and peak and float(peak.group(1))>-50,"audio_silent_or_unverified")
        return {"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"video_codec":v["codec_name"],"frames":int(v["nb_read_frames"]),"width":v["width"],"height":v["height"],"duration":float(info["format"]["duration"]),"audio_codec":aud[0]["codec_name"],"mean_db":float(m.group(1)),"peak_db":float(peak.group(1)),"decode":"PASS"}
    with tempfile.TemporaryDirectory(prefix="3159-media-") as d:
        with g.resource_slot("transfer",key="3159-held-media-11246",limit=1,wait_seconds=5):
            for ident,cap in ((SOURCE,16*1024*1024),(FINAL,LIMIT)):
                meta=drive.get_file(ident,fields="id,size,mimeType,trashed")
                require(meta["id"]==ident and not meta.get("trashed") and 0<int(meta["size"])<=cap,"drive_size_or_identity")
            src,mime=drive.download_file(SOURCE,timeout=35)
            require(mime in ("image/jpeg","image/png") and 0<len(src)<=16*1024*1024,"source_bytes")
            with Image.open(io.BytesIO(src)) as im:
                require(im.width*im.height<=25000000,"source_pixel_budget")
                im.load()
                source={"bytes":len(src),"sha256":hashlib.sha256(src).hexdigest(),"width":im.width,"height":im.height}
            mp4=Path(d)/"drive.mp4"
            drive.download_file_to_path(FINAL,str(mp4),timeout=45)
            require(0<mp4.stat().st_size<=LIMIT,"drive_video_size")
            cdn=Path(d)/"preview.mp4"
            with requests.get(PREVIEW,stream=True,timeout=30,allow_redirects=False) as res:
                require(res.status_code==200,"cdn_http")
                n=0
                with cdn.open("wb") as out:
                    for chunk in res.iter_content(65536):
                        n+=len(chunk)
                        require(n<=LIMIT,"cdn_video_size")
                        out.write(chunk)
        a=inspect(mp4)
        b=inspect(cdn)
    require(read()==r,"canonical_changed")
    print("RECOVERY3159_MEDIA="+json.dumps({"output":11246,"source":source,"drive":a,"preview":b,"byte_identical":a["sha256"]==b["sha256"],"canonical_unchanged":True,"output_writes":0,"provider_writes":0},separators=(",",":")),flush=True)

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("RECOVERY3159_MEDIA_ERROR="+(str(exc) if isinstance(exc,RuntimeError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__),flush=True)
        sys.exit(1)
