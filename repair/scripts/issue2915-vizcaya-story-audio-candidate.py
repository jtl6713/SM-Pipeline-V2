#!/usr/bin/env python3
"""Exact #5628 held Story candidate: original picture, canonical generated VO,
and a newly synthesized instrumental. Stage candidate only; no approval,
output write, provider request, or reuse of old mixed soundtrack."""
from __future__ import annotations
import array, hashlib, json, math, os, re, shutil, subprocess, sys, tempfile, wave
from pathlib import Path
import requests
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
OUTPUT="rec1Zg5eEJjQKzUDO"
OUTPUT_UUID="f68a570b-98e2-4537-97a5-d8516653ca95"
CONTENT_UUID="d1ad9498-36fd-4e28-b398-d0a8aa4a6c54"
PROFILE_UUID="65e9071a-d2fd-4898-88a4-111bf8a3bfb5"
SOURCE="https://media.chicagoshining.com/studio/previews/rec1Zg5eEJjQKzUDO/jobs/job-20261018035323-c4b6f443.mp4"
DRIVE_FINAL="https://drive.google.com/file/d/1CTcy2wE3OrQbgXQn7K5a2NuTXS7H22_j/view"
VOICE_ID="1dDQQfM2uKG7aV1NzKeuv59EO_UjXhCzq"
VOICE_URL="https://drive.google.com/uc?id="+VOICE_ID+"&export=download"
BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"
RATE=48000

def require(ok, reason):
    if not ok: raise RuntimeError(reason)

def _setup():
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    os.environ.setdefault("PORT","3350")
    sys.path.insert(0,str(BASE))
    require(os.getenv("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_supabase_project")
    for n in ("SUPABASE_SERVICE_ROLE_KEY","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN","R2_UPLOAD_WORKER_URL","R2_UPLOAD_WORKER_SECRET"):
        require(bool(os.getenv(n)),"missing_owner_credential_"+n)
    from integrations.google_drive import GoogleDriveClient
    from integrations.r2_upload import R2UploadClient
    return GoogleDriveClient(),R2UploadClient()

def _get(table,params):
    k=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    res=requests.get(PROJECT+"/rest/v1/"+table,params=params,headers={"apikey":k,"Authorization":"Bearer "+k},timeout=30)
    res.raise_for_status()
    return res.json()

def preflight():
    rows=_get("platform_outputs",{
      "id":"eq."+OUTPUT_UUID,"airtable_record_id":"eq."+OUTPUT,"output_number":"eq.5628","limit":2,
      "select":"id,airtable_record_id,output_number,content_number,content_item_id,content_profile_id,platform,format,output_status,review_status,publish_status,render_status,do_not_publish,auto_publish_enabled,publish_retry_eligible,studio_preview_url,final_file_url,publish_asset_url,platform_post_url,published_at,updated_at,error_messages"})
    require(len(rows)==1,"exact_output_missing")
    r=rows[0]
    require(r["content_number"]==1018 and r["content_item_id"]==CONTENT_UUID and r["content_profile_id"]==PROFILE_UUID and r["platform"]=="Instagram" and r["format"]=="Story","exact_scope_changed")
    require(r["output_status"]=="Approved for Publishing" and r["review_status"]=="Approved" and r["publish_status"]=="Failed" and r["render_status"]=="Rendered","original_failure_changed")
    require(r["do_not_publish"] is True and r["auto_publish_enabled"] is False and r["publish_retry_eligible"] is False and not r["published_at"] and not r["platform_post_url"],"publication_safety_state_changed")
    require(r["studio_preview_url"]==SOURCE and r["publish_asset_url"]==SOURCE and r["final_file_url"]==DRIVE_FINAL,"source_revision_changed")
    require((r.get("error_messages") or {}).get("Studio_Publish_Dispatch_Count")==2,"provider_dispatch_history_changed")
    parents=_get("content_items",{"id":"eq."+CONTENT_UUID,"content_number":"eq.1018","select":"id,content_profile_id,content_title,voiceover_status,updated_at,extras","limit":2})
    require(len(parents)==1,"parent_missing")
    p=parents[0]; e=p.get("extras") or {}
    require(p["content_profile_id"]==PROFILE_UUID and p["voiceover_status"]=="Generated" and e.get("Script_Status")=="Generated" and e.get("Include_Voiceover")=="Yes" and e.get("Include_Background_Music")=="Yes" and e.get("Voiceover_URL")==VOICE_URL,"generated_narration_provenance_changed")
    return r,p

def command(args,timeout=180):
    result=subprocess.run(args,capture_output=True,timeout=timeout,check=False)
    require(result.returncode==0,"media_command_failed_"+Path(args[0]).name)
    return result.stdout

def probe(ffprobe,path):
    return json.loads(command([ffprobe,"-v","error","-show_format","-show_streams","-of","json",str(path)],45))

def duration(info,stream=None):
    d=float((stream or {}).get("duration") or info["format"]["duration"])
    require(math.isfinite(d) and d>0,"invalid_duration")
    return d

def stream_of(info,kind):
    return [s for s in info["streams"] if s.get("codec_type")==kind]

def download_bounded(url,dest,limit=120_000_000):
    h=hashlib.sha256(); size=0
    with requests.get(url,stream=True,allow_redirects=False,timeout=(15,45),headers={"Cache-Control":"no-cache"}) as res:
        require(res.status_code==200,"source_get_failed")
        with dest.open("wb") as f:
            for chunk in res.iter_content(256*1024):
                size+=len(chunk)
                require(size<=limit,"media_size_exceeds_budget")
                h.update(chunk); f.write(chunk)
    require(size>1000,"media_empty")
    return h.hexdigest()

def original_score(dest,seconds):
    """Original procedural score; no samples, external assets or named song."""
    require(1<seconds<=90,"score_duration_budget")
    chords=((130.81,164.81,196.00,261.63),(110.00,130.81,164.81,220.00),
            (87.31,130.81,174.61,220.00),(98.00,146.83,196.00,246.94))
    notes=[(f,2*math.pi*f/RATE) for chord in chords for f in chord]
    frames=math.ceil(seconds*RATE)
    block=array.array("h")
    with wave.open(str(dest),"wb") as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE)
        for i in range(frames):
            t=i/RATE; bar=int(t/4)%4; within=t%4
            fade=min(1.0,t/0.5,max(0.0,(seconds-t)/0.9),within/0.25,(4-within)/0.25)
            v=0.0
            for n in range(4):
                f,phase=notes[bar*4+n]
                v+=(math.sin(i*phase)+0.13*math.sin(i*phase*2))/4
            value=int(max(-1,min(1,v*max(0,fade)*0.11))*32767)
            block.extend((value,value))
            if len(block)>=RATE*2:
                if sys.byteorder!="little":block.byteswap()
                out.writeframesraw(block.tobytes());block=array.array("h")
        if block:
            if sys.byteorder!="little":block.byteswap()
            out.writeframesraw(block.tobytes())

def video_hash(ffmpeg,path):
    return command([ffmpeg,"-v","error","-i",str(path),"-map","0:v:0","-c","copy","-f","hash","-hash","sha256","-"],90).decode().strip()

def pcm_stats(ffmpeg,path):
    pcm=command([ffmpeg,"-v","error","-i",str(path),"-map","0:a:0","-vn","-ac","1","-ar","16000","-f","s16le","-"],90)
    a=array.array("h");a.frombytes(pcm)
    if sys.byteorder!="little":a.byteswap()
    require(len(a)>16000,"audio_too_short")
    peak=max(abs(x) for x in a)/32768
    rms=math.sqrt(sum((x/32768)**2 for x in a)/len(a))
    return {"duration":round(len(a)/16000,3),"peak":round(peak,5),"rms":round(rms,5)}

def main():
    drive,r2=_setup()
    from studio_produce.workload_governor import enabled as governor_enabled,resource_slot,recovery_read_only_active,circuit_open
    require(governor_enabled() and not recovery_read_only_active() and not circuit_open(),"governed_workload_unavailable")
    health=requests.get("http://127.0.0.1:3350/health",timeout=20).json()
    require(health.get("ok") is True and health.get("studio_write_source")=="supabase" and health.get("studio_runner_output_read_source")=="supabase","supabase_authority_unavailable")
    ffmpeg=shutil.which("ffmpeg");ffprobe=shutil.which("ffprobe")
    require(bool(ffmpeg and ffprobe),"ffmpeg_or_ffprobe_missing")
    with resource_slot("issue_2915_vizcaya_audio_candidate",limit=1),tempfile.TemporaryDirectory(prefix="issue2915-5628-") as tmp:
        r,p=preflight()
        d=Path(tmp);source=d/"original.mp4";voice=d/"voice.source";score=d/"original-score.wav";candidate=d/"candidate.mp4"
        original_sha=download_bounded(SOURCE,source)
        info=probe(ffprobe,source);vs=stream_of(info,"video");old_audio=stream_of(info,"audio")
        require(len(vs)==1 and len(old_audio)==1 and vs[0].get("codec_name")=="h264" and vs[0]["width"]*16==vs[0]["height"]*9,"source_video_or_audio_shape_unverified")
        seconds=duration(info,vs[0]);require(2<seconds<=90,"source_story_duration_budget")
        voice_bytes,mime=drive.download_file(VOICE_ID)
        require(str(mime).startswith("audio/") and 1000<len(voice_bytes)<25_000_000,"canonical_narration_not_audio")
        voice.write_bytes(voice_bytes);voice_sha=hashlib.sha256(voice_bytes).hexdigest()
        vi=probe(ffprobe,voice);vas=stream_of(vi,"audio")
        require(len(vas)==1 and not stream_of(vi,"video"),"narration_not_separate_audio")
        vo_seconds=duration(vi,vas[0])
        require(1<vo_seconds<=seconds+0.02,"narration_does_not_fit_story_no_truncation")
        vo_stats=pcm_stats(ffmpeg,voice)
        require(vo_stats["rms"]>=0.008 and vo_stats["peak"]>0.03,"narration_silent_or_invalid")
        original_score(score,seconds)
        # Input 0 contributes video ONLY: no old mixed audio or commercial song.
        filters="[1:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.85,apad[vo];[2:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[bg];[vo][bg]amix=inputs=2:duration=shortest:normalize=0,alimiter=limit=0.88:level=0:latency=1[a]"
        command([ffmpeg,"-nostdin","-v","error","-y","-i",str(source),"-i",str(voice),"-i",str(score),"-filter_complex",filters,"-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","-map_metadata","-1","-map_chapters","-1","-movflags","+faststart","-t",str(seconds),str(candidate)])
        ci=probe(ffprobe,candidate);cvs=stream_of(ci,"video");cas=stream_of(ci,"audio")
        require(len(cvs)==len(cas)==1 and cas[0]["codec_name"]=="aac" and cvs[0]["codec_name"]=="h264" and (cvs[0]["width"],cvs[0]["height"])==(vs[0]["width"],vs[0]["height"]),"candidate_format_invalid")
        require(abs(duration(ci,cvs[0])-seconds)<0.15 and abs(duration(ci,cas[0])-seconds)<0.2,"candidate_duration_changed")
        require(video_hash(ffmpeg,source)==video_hash(ffmpeg,candidate),"original_picture_stream_changed")
        command([ffmpeg,"-v","error","-xerror","-i",str(candidate),"-map","0:v:0","-map","0:a:0","-f","null","-"],120)
        mixed=pcm_stats(ffmpeg,candidate);require(0.008<=mixed["rms"]<=0.35 and 0.03<mixed["peak"]<0.99,"candidate_audio_silent_or_clipped")
        payload=candidate.read_bytes();require(len(payload)<120_000_000,"candidate_size_budget")
        sha=hashlib.sha256(payload).hexdigest()
        fresh,parent=preflight()
        require(fresh["updated_at"]==r["updated_at"] and parent["updated_at"]==p["updated_at"],"source_revision_changed_during_work")
        key="studio/previews/repairs/issue2915/miami-1018/story-5628/candidate-"+sha[:24]+".mp4"
        r2.put_object(key,payload,"video/mp4")
        url="https://media.chicagoshining.com/"+key
        require(download_bounded(url,d/"readback.mp4")==sha,"cdn_sha256_mismatch")
        print("ISSUE2915_STORY_AUDIO_CANDIDATE="+json.dumps({"verified":True,"output":5628,"content":1018,"source_updated_at":r["updated_at"],"parent_updated_at":p["updated_at"],"original_sha256":original_sha,"narration_sha256":voice_sha,"narration_source":"canonical_generated_parent","narration_seconds":vo_seconds,"music_origin":"new_procedural_original_no_samples","music_sha256":hashlib.sha256(score.read_bytes()).hexdigest(),"original_mixed_audio_reused":False,"picture_stream_identical":True,"video_seconds":seconds,"geometry":str(vs[0]["width"])+"x"+str(vs[0]["height"]),"audio":mixed,"url":url,"sha256":sha,"cdn_verified":True,"human_audio_review_required":True,"source_writes":0,"provider_writes":0,"factory_approvals":0},separators=(",",":")),flush=True)

if __name__=="__main__":
    main()
