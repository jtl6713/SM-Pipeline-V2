"""Bounded, independently timed narration for generated companion Stories."""
from __future__ import annotations

import hashlib
import json
import re

import requests

from airtable.constants import PLATFORM_OUTPUTS_TABLE
from audio.speech_activity import probe_max_volume_db
from audio.voiceover_duration import probe_audio_duration_bytes, probe_audio_duration_url
from render.fields import field, field_str, parse_json_field

RECEIPT = "Studio_Story_Voiceover_Receipt_JSON"

class StoryVoiceoverError(RuntimeError):
    pass

def is_story(output):
    return any(field_str(output,k).lower()=="story" for k in ("Studio_Output_Type","Output_Type","Format"))

def needs_story_voiceover(output):
    return (is_story(output) and field_str(output,"Output_Filename").startswith("studio-")
            and field_str(output,"Studio_Effective_Voiceover_Mode").lower() in {"yes","true","1"})

def story_text(script, max_words=20):
    # Never truncate a word or a sentence. Prefer the first complete concise
    # sentence, which normally describes the first image of the companion.
    for sentence in re.findall(r"[^.!?]+[.!?]+", str(script or "").strip()):
        s=" ".join(sentence.split())
        if 3<=len(s.split())<=max_words:
            return s
    raise StoryVoiceoverError("Story needs a complete concise narration sentence")

def story_seconds(output):
    manifest=parse_json_field(field(output,"Selected_Assets_JSON")) or {}
    try:
        planned=int(manifest.get("target_total_frames") or field(output,"Render_Total_Frames") or 0)
    except (AttributeError,ValueError,TypeError):
        planned=0
    if not 120<=planned<=450:
        raise StoryVoiceoverError("Story source duration is not independently planned")
    return planned/30

def fingerprint(parent_id,voice_id,text,seconds):
    return hashlib.sha256(json.dumps([parent_id,voice_id,text,seconds],separators=(",",":")).encode()).hexdigest()

def checked_voice(data,cap):
    duration=probe_audio_duration_bytes(data)
    peak=probe_max_volume_db(data)
    if not 2<=duration<=cap-0.05 or peak is None or peak<-18:
        raise StoryVoiceoverError("Story narration must be audible and finish within its own timeline")
    return round(duration,3)

def ensure_story_voiceover(client,output,parent):
    """Return updated in-memory exact output. No parent mutation; no approval."""
    if not needs_story_voiceover(output):
        return output
    if not parent or not parent.get("id"):
        raise StoryVoiceoverError("Story narration parent unavailable")
    cap=story_seconds(output)
    existing=field_str(output,"Voiceover_URL")
    parent_url=field_str(parent,"Voiceover_URL")
    receipt=parse_json_field(field(output,RECEIPT)) or {}
    if existing and existing!=parent_url and not receipt:
        # Preserve explicit per-output VO, including exact incident recovery.
        try:
            measured=probe_audio_duration_url(existing)
        except Exception as exc:
            raise StoryVoiceoverError("Story-specific narration is not readable") from exc
        if 2<=measured<=cap-0.05:
            return output
        raise StoryVoiceoverError("Story-specific narration does not fit; rework the source")
    from p2.elevenlabs_client import resolve_content_voice_id,synthesize_voiceover_by_id
    from p2.normalizer_client import normalize_voiceover
    from p2.constants import PIPELINE_SETTING_NORMALIZER_URL
    from item4.settings import pipeline_settings
    from integrations.r2_upload import R2UploadClient
    from studio_produce.workload_governor import resource_slot

    voice_id=resolve_content_voice_id(parent)
    text=story_text(field_str(parent,"Voiceover_Script"))
    digest=fingerprint(parent["id"],voice_id,text,cap)
    key=f"studio/previews/story-voiceover/{parent['id']}/{digest}.mp3"
    url="https://media.chicagoshining.com/"+key
    with resource_slot("story_voiceover",key=parent["id"],limit=1,wait_seconds=0):
        current=client.get_record(PLATFORM_OUTPUTS_TABLE,output["id"])
        if not needs_story_voiceover(current) or field_str(current,"Remotion_Job_ID") or field_str(current,"Final_File_URL"):
            raise StoryVoiceoverError("Story revision or render ownership changed")
        prior=parse_json_field(field(current,RECEIPT)) or {}
        response=requests.get(url,timeout=(5,20),headers={"Cache-Control":"no-cache"})
        if response.status_code==200:
            data=response.content
            measured=checked_voice(data,cap)
        elif response.status_code==404:
            if isinstance(prior,dict) and prior.get("fingerprint")==digest and prior.get("state") in {"generating","failed","verified"}:
                raise StoryVoiceoverError("Story narration attempt already recorded; reconcile before retrying paid generation")
            claim={"fingerprint":digest,"state":"generating","url":url}
            client.update_record(PLATFORM_OUTPUTS_TABLE,current["id"],{RECEIPT:json.dumps(claim)},typecast=True)
            try:
                raw=synthesize_voiceover_by_id(text,voice_id=voice_id)
                settings=pipeline_settings(client)
                _,data=normalize_voiceover(raw,filename="story-"+digest[:16]+".mp3",
                    normalizer_base_url=settings.get(PIPELINE_SETTING_NORMALIZER_URL))
                measured=checked_voice(data,cap)
                R2UploadClient(settings).put_object(key,data,"audio/mpeg")
                readback=requests.get(url,timeout=(5,30),headers={"Cache-Control":"no-cache"})
                if not readback.ok or hashlib.sha256(readback.content).digest()!=hashlib.sha256(data).digest():
                    raise StoryVoiceoverError("Story narration upload readback not confirmed")
            except Exception as exc:
                client.update_record(PLATFORM_OUTPUTS_TABLE,current["id"],{
                    RECEIPT:json.dumps({**claim,"state":"failed"})},typecast=True)
                raise StoryVoiceoverError("Story narration preparation failed; reconcile its exact attempt") from exc
        else:
            raise StoryVoiceoverError("Story narration cache unavailable; refuse duplicate paid attempt")
        fresh=client.get_record(PLATFORM_OUTPUTS_TABLE,current["id"])
        from airtable.constants import CONTENT_ITEMS_TABLE
        live_parent=client.get_record(CONTENT_ITEMS_TABLE,parent["id"])
        if fingerprint(parent["id"],resolve_content_voice_id(live_parent),
                story_text(field_str(live_parent,"Voiceover_Script")),cap)!=digest:
            raise StoryVoiceoverError("Parent script or voice changed before narration binding")
        if not needs_story_voiceover(fresh) or story_seconds(fresh)!=cap or field_str(fresh,"Remotion_Job_ID") or field_str(fresh,"Final_File_URL"):
            raise StoryVoiceoverError("Story changed before narration binding")
        patch={"Voiceover_URL":url,"Voiceover_Duration_Seconds":measured,
               "Studio_Effective_Voiceover_Duration_Seconds":measured,"Voiceover_Render_Volume":1,
               "Voiceover_Tail_Seconds":0,"Studio_Effective_Voiceover_Tail_Seconds":0,
               RECEIPT:json.dumps({"fingerprint":digest,"state":"verified","url":url,"text":text,
                    "seconds":measured,"sha256":hashlib.sha256(data).hexdigest()},separators=(",",":"))}
        client.update_record(PLATFORM_OUTPUTS_TABLE,fresh["id"],patch,typecast=True)
        return {**fresh,"fields":{**fresh["fields"],**patch}}
