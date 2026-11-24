#!/usr/bin/env python3
"""Exact #5628 candidate only: preserve video, replace mixed audio with generated narration
and an original procedural instrumental bed. No approval, DB or provider mutation."""
import hashlib, json, math, os, shutil, subprocess, sys, tempfile, wave
from array import array
from pathlib import Path
import requests
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
OUTPUT="rec1Zg5eEJjQKzUDO"
CONTENT="recfiPkbp6KaZd6VE"
PROFILE="65e9071a-d2fd-4898-88a4-111bf8a3bfb5"
VIDEO="1CTcy2wE3OrQbgXQn7K5a2NuTXS7H22_j"
VOICE="1dDQQfM2uKG7aV1NzKeuv59EO_UjXhCzq"
PREVIEW="https://media.chicagoshining.com/studio/previews/rec1Zg5eEJjQKzUDO/jobs/job-20261018035323-c4b6f443.mp4"
VOICE_URL="https://drive.google.com/uc?id="+VOICE+"&export=download"
BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"
def require(ok, reason):
    if not ok: raise RuntimeError(reason)
def sha(data): return hashlib.sha256(data).hexdigest()
def get(table,params):
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    r=requests.get(PROJECT+"/rest/v1/"+table,params=params,headers={"apikey":key,"Authorization":"Bearer "+key},timeout=30)
    r.raise_for_status(); return r.json()
def preflight():
    rows=get("platform_outputs",{"output_number":"eq.5628","select":"airtable_record_id,content_item_id,content_profile_id,output_title,platform,format,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,final_file_url,studio_preview_url,publish_asset_url,updated_at,published_at,platform_post_url","limit":2})
    require(len(rows)==1,"exact_output_missing")
    row=rows[0]
    require(row["airtable_record_id"]==OUTPUT and row["content_profile_id"]==PROFILE and row["output_title"]=="Vizcaya Museum and Gardens, Miami 2" and row["platform"]=="Instagram" and row["format"]=="Story","output_identity_changed")
    require(row["output_status"]=="Approved for Publishing" and row["review_status"]=="Approved" and row["publish_status"]=="Failed" and row["do_not_publish"] is True and row["auto_publish_enabled"] is False and not row["published_at"] and not row["platform_post_url"],"provider_or_hold_state_changed")
    require(row["final_file_url"]=="https://drive.google.com/file/d/"+VIDEO+"/view" and row["studio_preview_url"]==PREVIEW and row["publish_asset_url"]==PREVIEW,"video_revision_changed")
    parents=get("content_items",{"id":"eq."+row["content_item_id"],"select":"airtable_record_id,content_profile_id,voiceover_status,extras","limit":2})
    require(len(parents)==1,"parent_missing")
    p=parents[0]; ex=p["extras"]
    require(p["airtable_record_id"]==CONTENT and p["content_profile_id"]==PROFILE and p["voiceover_status"]=="Generated" and ex.get("Voiceover_URL")==VOICE_URL and ex.get("Include_Voiceover")=="Yes" and ex.get("Include_Background_Music")=="Yes","generated_narration_provenance_changed")
    return row
def run(args):
    result=subprocess.run(args,capture_output=True,timeout=120,check=True)
    return result.stdout
def probe(ffprobe,path):
    return json.loads(run([ffprobe,"-v","error","-show_streams","-show_format","-of","json",str(path)]))
def video_hash(ffmpeg,path):
    return run([ffmpeg,"-v","error","-i",str(path),"-map","0:v:0","-c:v","copy","-f","hash","-hash","sha256","-"]).decode().strip()
def generate_bed(path,seconds):
    # Original algorithmic ambient bed, no samples, existing melody, or recorded track.
    rate=24000; samples=array("h")
    # Gentle sustained open chord, slowly evolving amplitude; no borrowed song.
    for i in range(round(rate*seconds)):
        t=i/rate
        envelope=min(1,t/1.2,max(0,(seconds-t)/1.5))
        mod=0.70+0.30*math.sin(2*math.pi*t/9)**2
        v=sum(math.sin(2*math.pi*f*t+0.08*math.sin(t*0.6+j)) for j,f in enumerate((130.8128,195.9977,261.6256,329.6276)))/4
        samples.append(round(32767*0.12*envelope*mod*v))
    if sys.byteorder!="little": samples.byteswap()
    with wave.open(str(path),"wb") as out:
        out.setparams((1,2,rate,0,"NONE","not compressed")); out.writeframes(samples.tobytes())
def rms_db(ffmpeg,path):
    raw=run([ffmpeg,"-v","error","-i",str(path),"-map","0:a:0","-ac","1","-ar","16000","-f","s16le","-"])
    pcm=array("h"); pcm.frombytes(raw)
    if sys.byteorder!="little": pcm.byteswap()
    require(len(pcm)>1600,"empty_audio")
    return 20*math.log10(max(1e-9,math.sqrt(sum(x*x for x in pcm)/len(pcm))/32768)), max(abs(x) for x in pcm)/32768
def main():
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False); os.environ.setdefault("PORT","3350"); sys.path.insert(0,str(BASE))
    require(os.getenv("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    from integrations.google_drive import GoogleDriveClient
    from integrations.r2_upload import R2UploadClient
    from studio_produce.workload_governor import enabled, resource_slot, recovery_read_only_active, circuit_open
    require(enabled() and not recovery_read_only_active() and not circuit_open(),"governed_workload_unavailable")
    health=requests.get("http://127.0.0.1:3350/health",timeout=20).json()
    require(health.get("ok") is True and health.get("studio_write_source")=="supabase" and health.get("studio_runner_output_read_source")=="supabase","supabase_authority_unavailable")
    ffmpeg=shutil.which("ffmpeg"); ffprobe=shutil.which("ffprobe")
    require(ffmpeg and ffprobe,"ffmpeg_or_ffprobe_missing")
    with resource_slot("issue_2915_story_audio_stage",limit=1), tempfile.TemporaryDirectory(prefix="vizcaya-5628-") as temp:
        row=preflight(); drive=GoogleDriveClient(); r2=R2UploadClient(); d=Path(temp)
        old,mime=drive.download_file(VIDEO); voice,voice_mime=drive.download_file(VOICE)
        require(mime=="video/mp4" and 10000<len(old)<180000000,"invalid_source_video")
        require(voice_mime.startswith("audio/") and 1000<len(voice)<30000000,"invalid_generated_voiceover")
        v=d/"source.mp4"; a=d/"voice.audio"; b=d/"bed.wav"; out=d/"candidate.mp4"
        v.write_bytes(old);a.write_bytes(voice)
        remote=requests.get(PREVIEW,timeout=90);remote.raise_for_status()
        # If preview and Drive disagree, don't replace possibly different creative.
        require(sha(remote.content)==sha(old),"drive_preview_bytes_differ")
        vp=probe(ffprobe,v); ap=probe(ffprobe,a); vs=[s for s in vp["streams"] if s["codec_type"]=="video"]
        require(len(vs)==1 and vs[0]["codec_name"]=="h264" and vs[0]["width"]==1080 and vs[0]["height"]==1920,"unexpected_video_geometry_or_codec")
        require(len(ap["streams"])==1 and ap["streams"][0]["codec_type"]=="audio","voice_source_not_audio_only")
        duration=float(vs[0].get("duration") or vp["format"]["duration"]); vd=float(ap["format"]["duration"])
        require(2<duration<=60 and 1<vd<=duration+0.15,"narration_not_aligned_to_story_duration")
        vrms,vpeak=rms_db(ffmpeg,a); require(-42<vrms<-3 and vpeak>0.02,"narration_silent_or_invalid")
        generate_bed(b,duration)
        # Explicit map excludes EVERY original audio stream. Original visuals copied.
        run([ffmpeg,"-hide_banner","-loglevel","error","-y","-i",str(v),"-i",str(a),"-i",str(b),
             "-filter_complex","[1:a]aresample=48000,volume=0.90,apad=whole_dur="+str(duration)+"[vo];[2:a]aresample=48000,volume=0.32[bed];[vo][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.90:latency=1[mix]",
             "-map","0:v:0","-map","[mix]","-c:v","copy","-c:a","aac","-b:a","192k","-ar","48000","-t",str(duration),"-movflags","+faststart",str(out)])
        result=probe(ffprobe,out); streams=result["streams"]; vv=[s for s in streams if s["codec_type"]=="video"]; aa=[s for s in streams if s["codec_type"]=="audio"]
        require(len(vv)==len(aa)==1 and len(streams)==2 and aa[0]["codec_name"]=="aac","candidate_stream_contract_failed")
        require(abs(float(result["format"]["duration"])-duration)<0.25,"candidate_duration_mismatch")
        require(video_hash(ffmpeg,v)==video_hash(ffmpeg,out),"video_stream_changed")
        rms,peak=rms_db(ffmpeg,out);require(-42<rms<-3 and 0.02<peak<0.99,"candidate_audio_invalid")
        # Full decoding catches damaged streams before staging.
        run([ffmpeg,"-v","error","-xerror","-i",str(out),"-f","null","-"])
        data=out.read_bytes(); digest=sha(data); require(preflight()["updated_at"]==row["updated_at"],"concurrent_source_change")
        key="studio/previews/repairs/issue2915/miami-5628/original-bed-"+digest[:24]+".mp4"
        r2.put_object(key,data,"video/mp4")
        url="https://media.chicagoshining.com/"+key
        readback=requests.get(url,timeout=90,headers={"Cache-Control":"no-cache"});readback.raise_for_status()
        require(sha(readback.content)==digest,"candidate_cdn_sha_mismatch")
        require(preflight()["updated_at"]==row["updated_at"],"source_changed_after_stage")
        print("ISSUE2915_STORY_STAGE="+json.dumps({"output":5628,"verified":True,"candidate_url":url,"sha256":digest,"source_sha256":sha(old),"narration_sha256":sha(voice),"source_updated_at":row["updated_at"],"video_stream_unchanged":True,"old_audio_removed":True,"instrumental_provenance":"original_procedural_synthesis_no_samples","duration":duration,"narration_duration":vd,"audio_rms_db":rms,"audio_peak":peak,"human_audio_visual_review_pending":True,"source_writes":0,"provider_writes":0,"factory_approvals":0}),flush=True)
if __name__=="__main__": main()
