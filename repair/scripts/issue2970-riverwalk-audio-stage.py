"""#2970 exact held Riverwalk audio preparation. No canonical/output/provider writes.
One new short voiceover and one verified owned music stem; normal R4/R5 owns rendering.
"""
from __future__ import annotations
import hashlib
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
PARENT = "reczPj2wBhqxuo0T2"
REQUEST = "recZswSwDPUSNoW9N"
PROFILE = "3d0d5221-9e53-4513-972c-67b70963a97d"
MUSIC = "recXf5VWVeeBdiIqd"
MUSIC_DRIVE = "1Z4oEWGOeufJnoCVo4ZvQ5GLdHaB2i42l"
VOICE_DRIVE = "15OsQQIA4WkFa4Jo27vsLo5AO5hm-agNk"
ORIGINAL = "https://drive.google.com/file/d/1Oaz2fTOIpMF1lrmpHmWx4r6ermQbtHg8/view"
OUTPUTS = {11166:"rec9uodYpY4L6BvyQ",11167:"recCYflzPH65HdbpS",11168:"recyEgGuGKIrJw8Ca",
           11169:"recwGZF0JxVyTS2eF",11170:"recckY9KlAJkWtXxO",11171:"recl9v0xTGSwGgt8u"}
BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"
CDN = "https://media.chicagoshining.com/"
# Complete, original first narration sentence; no truncation of the 42-second track.
SCRIPT = "Morning Riverwalk beat, boats, footsteps, and coffee on the current as sun edges skyscrapers."

def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def get(table, params):
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    res = requests.get(PROJECT+"/rest/v1/"+table, params=params,
                       headers={"apikey":key,"Authorization":"Bearer "+key}, timeout=25)
    require(res.ok, "canonical_read_failed_"+table)
    return res.json()

def one(table, params):
    rows = get(table, {**params, "limit":2})
    require(len(rows)==1, "exact_identity_missing_"+table)
    return rows[0]

def preflight():
    rows = get("platform_outputs", {"output_number":"in.("+",".join(map(str,OUTPUTS))+")",
      "select":"output_number,airtable_record_id,content_item_airtable_id,content_profile_id,output_status,review_status,render_status,publish_status,do_not_publish,publish_hold_source,auto_publish_enabled,scheduled_post_date,published_at,platform_post_url,final_file_url,render_total_frames,selected_assets,render_clip_list,updated_at,error_messages","limit":7})
    require(len(rows)==6 and {r["output_number"]:r["airtable_record_id"] for r in rows}==OUTPUTS,"exact_outputs_missing")
    for r in rows:
        e=r.get("error_messages") or {}
        require(r["content_item_airtable_id"]==PARENT and r["content_profile_id"]==PROFILE
          and r["output_status"]=="Ready for Review" and r["render_status"]=="Rendered"
          and r["review_status"] in (None,"Review Sent") and not r["publish_status"]
          and r["do_not_publish"] is True and r["publish_hold_source"]=="issue_2970_preapproval_media_qa"
          and r["auto_publish_enabled"] is not True and not r["published_at"] and not r["platform_post_url"]
          and not e.get("SM_Factory_Supabase_Approval_Receipt") and not e.get("Publish_Locked_By")
          and not e.get("Platform_Post_ID") and not e.get("Studio_Render_Review_Hold_Active")
          and r["final_file_url"]==ORIGINAL and r["render_total_frames"]==1257,"held_output_revision_changed")
        if r["output_number"]>=11170:
            require((r.get("selected_assets") or {}).get("target_total_frames")==300
              and len(r.get("render_clip_list") or [])==1
              and r["render_clip_list"][0]["durationFrames"]==300,"story_source_contract_changed")
    p=one("content_items",{"airtable_record_id":"eq."+PARENT,"select":"id,content_number,content_profile_id,voiceover_status,extras,updated_at"})
    e=p.get("extras") or {}
    require(p["content_number"]==2306 and p["content_profile_id"]==PROFILE and p["voiceover_status"]=="Generated"
        and e.get("Include_Voiceover")=="Yes" and e.get("Include_Background_Music")=="Yes"
        and VOICE_DRIVE in str(e.get("Voiceover_URL") or ""),"parent_narration_changed")
    req=one("production_requests",{"airtable_record_id":"eq."+REQUEST,"select":"production_request_id,publish_status,production_notes,updated_at"})
    d=req.get("publish_status") or {}
    require(req["production_request_id"]=="PR-20261124223827-86MDAT" and d.get("Voiceover_Mode")=="Yes"
        and d.get("Background_Music_Mode")=="Yes" and SCRIPT in req["production_notes"],"request_intent_changed")
    profile=one("content_profiles",{"id":"eq."+PROFILE,"select":"platform_setup"})
    setup=profile["platform_setup"]
    require(MUSIC in setup.get("Autonomous_Music_Pool",[]) and setup.get("Default_Narration_Voice_ID"),"profile_music_or_voice_unavailable")
    a=one("media_assets",{"airtable_record_id":"eq."+MUSIC,"select":"asset_name,asset_role,media_class,asset_status,active,do_not_use,google_drive_file_id,google_drive_url,metadata"})
    m=a.get("metadata") or {}
    require(a["asset_role"]=="Music" and a["media_class"]=="Audio" and a["asset_status"]=="Available"
        and a["active"] is True and not a["do_not_use"] and a["google_drive_file_id"]==MUSIC_DRIVE
        and m.get("rights_status")=="Owned" and m.get("classification_status")=="Classified"
        and m.get("drive_access_status")=="Public" and not m.get("exclusion_reasons"),"music_rights_or_identity_changed")
    return rows,p,req,setup,a

def signature(snapshot):
    rows,p,req,setup,a=snapshot
    return ([tuple((r["output_number"],r["updated_at"])) for r in sorted(rows,key=lambda r:r["output_number"])],
        p["updated_at"],req["updated_at"],setup["Default_Narration_Voice_ID"],a["google_drive_file_id"])

def checked_stem(data, name, min_duration, max_duration):
    from audio.voiceover_duration import probe_audio_duration_bytes
    from audio.speech_activity import probe_max_volume_db
    require(1000<len(data)<30_000_000,"stem_size_invalid_"+name)
    duration=probe_audio_duration_bytes(data)
    peak=probe_max_volume_db(data)
    require(min_duration<=duration<=max_duration and peak is not None and peak>=-18,"stem_audio_invalid_"+name)
    return {"seconds":round(duration,3),"peak_db":peak,"sha256":hashlib.sha256(data).hexdigest()}

def stage(r2, data, name):
    digest=hashlib.sha256(data).hexdigest()
    key="studio/previews/repairs/issue2970/2306/"+name+"-"+digest[:24]+".mp3"
    r2.put_object(key,data,"audio/mpeg")
    url=CDN+key
    resp=requests.get(url,timeout=40,headers={"Cache-Control":"no-cache"})
    require(resp.ok and hashlib.sha256(resp.content).hexdigest()==digest,"staged_audio_hash_mismatch")
    return url

def main():
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    # Ops shell may export PORT as an empty string; match the established
    # protected repair bootstrap without changing the runner service config.
    if not os.getenv("PORT", "").strip():
        os.environ["PORT"] = "3350"
    sys.path.insert(0,str(BASE))
    require(os.getenv("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    from studio_produce.workload_governor import enabled,resource_slot,recovery_read_only_active,circuit_open
    from integrations.google_drive import GoogleDriveClient
    from integrations.r2_upload import R2UploadClient
    from p2.elevenlabs_client import synthesize_voiceover_by_id
    from p2.normalizer_client import normalize_voiceover
    from p2.constants import PIPELINE_SETTING_NORMALIZER_URL
    from item4.settings import pipeline_settings
    from airtable.client import AirtableClient
    require(enabled() and not recovery_read_only_active() and not circuit_open(),"governor_unavailable")
    h=requests.get("http://127.0.0.1:3350/health",timeout=15).json()
    require(h.get("ok") is True and h.get("studio_write_source")=="supabase"
        and h.get("studio_runner_output_read_source")=="supabase" and h.get("supabase_pipeline_writes") is True,
        "canonical_runner_unavailable")
    with resource_slot("recovery_media_stage",key="issue2970-2306",limit=1,wait_seconds=0):
        before=preflight()
        rows,parent,req,setup,asset=before
        drive=GoogleDriveClient(); r2=R2UploadClient()
        full,mime=drive.download_file(VOICE_DRIVE)
        require(str(mime).startswith("audio/"),"full_vo_mime_invalid")
        vo=checked_stem(full,"full_narration",41.7,42.0)
        music,mime=drive.download_file(MUSIC_DRIVE)
        require(str(mime).startswith("audio/"),"music_mime_invalid")
        bg=checked_stem(music,"owned_music",42.0,360.0)
        # One short, complete sentence using the profile's configured voice.
        # Single bounded attempt; on failure preserve holds and do not loop paid TTS.
        raw=synthesize_voiceover_by_id(SCRIPT,voice_id=setup["Default_Narration_Voice_ID"])
        # Normalization endpoint is resolved through the existing pipeline settings.
        settings=pipeline_settings(AirtableClient())
        normalizer_url=settings.get(PIPELINE_SETTING_NORMALIZER_URL)
        _,short=normalize_voiceover(raw,filename="issue2970-2306-story.mp3",normalizer_base_url=normalizer_url)
        story=checked_stem(short,"story_narration",2.0,9.8)
        require(signature(before)==signature(preflight()),"canonical_revision_changed")
        story["url"]=stage(r2,short,"story-narration")
        bg["url"]=stage(r2,music,"owned-music")
        vo["url"]=stage(r2,full,"full-narration")
        require(signature(before)==signature(preflight()),"canonical_revision_changed_after_stage")
        print("ISSUE2970_AUDIO_STAGE="+json.dumps({"verified":True,"outputs":sorted(OUTPUTS),
          "content":2306,"versions":{str(r["output_number"]):r["updated_at"] for r in rows},
          "music_asset":MUSIC,"music_name":asset["asset_name"],"music_rights":"Owned",
          "full_voiceover":vo,"story_voiceover":story,"music":bg,"story_target_frames":300,
          "source_writes":0,"provider_writes":0,"factory_approvals":0,"hold_preserved":True},separators=(",",":")),flush=True)

if __name__=="__main__":
    main()
