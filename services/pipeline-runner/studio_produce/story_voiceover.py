"""Bounded, independently timed narration for generated companion Stories."""
from __future__ import annotations

import hashlib
import json
import re

import requests

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from audio.speech_activity import probe_max_volume_db
from audio.voiceover_duration import probe_audio_duration_bytes, probe_audio_duration_url
from render.fields import field, field_str, first_linked_id, parse_json_field

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
    if duration is None or not 2<=duration<=cap-0.1 or peak is None or peak<-18:
        raise StoryVoiceoverError("Story narration must be audible and finish within its own timeline")
    return round(duration,3)

def exact_story_snapshot(output, parent_id):
    if (first_linked_id(field(output, "Content_Item")) != parent_id
            or not needs_story_voiceover(output)
            or field_str(output, "Remotion_Job_ID") or field_str(output, "Final_File_URL")):
        raise StoryVoiceoverError("Story revision or render ownership changed")
    return tuple(field_str(output, name) for name in (
        "Output_Filename", "Voiceover_URL", "Studio_Effective_Voiceover_Mode",
        "Studio_Effective_Background_Music_Mode", "Render_Total_Frames",
        "Selected_Assets_JSON", "Render_Clip_List_JSON",
    ))


def matching_story_claims(client, parent, output_id, digest, url):
    # Read all siblings under the existing exact parent-scoped loader, while
    # holding the Windows governor resource slot. Never infer an absent attempt
    # from a partial or ambiguous sibling set.
    from studio_produce.context import load_outputs
    rows = load_outputs(client, "", parent)
    ids = [row.get("id") for row in rows]
    if (not rows or len(rows) >= 50 or len(set(ids)) != len(ids) or output_id not in ids
            or any(not row.get("id") or first_linked_id(field(row, "Content_Item")) != parent["id"]
                   for row in rows)):
        raise StoryVoiceoverError("Exact Story sibling claim set unavailable")
    claims = []
    for row in rows:
        receipt = parse_json_field(field(row, RECEIPT)) or {}
        if not isinstance(receipt, dict):
            raise StoryVoiceoverError("Story sibling narration receipt malformed")
        if receipt.get("fingerprint") != digest:
            continue
        if receipt.get("url") != url or receipt.get("state") not in {"generating", "prepared", "verified", "failed"}:
            raise StoryVoiceoverError("Story sibling narration claim identity invalid")
        claims.append(receipt)
    return claims


def verified_cached_voice(data, claims, cap):
    # A matching key alone is not a byte-level proof. A prepared/verified
    # receipt written before upload binds the cached bytes to the paid attempt.
    sha = hashlib.sha256(data).hexdigest()
    known = {claim["sha256"] for claim in claims if claim.get("sha256")}
    if known != {sha}:
        raise StoryVoiceoverError("Story narration cache has no unambiguous checksum receipt")
    return checked_voice(data, cap)


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
        if measured is not None and 2<=measured<=cap-0.1:
            return output
        raise StoryVoiceoverError("Story-specific narration does not fit; rework the source")
    from p2.elevenlabs_client import resolve_content_voice_id,synthesize_voiceover_by_id
    from p2.normalizer_client import normalize_voiceover
    from p2.constants import PIPELINE_SETTING_NORMALIZER_URL
    from item4.settings import pipeline_settings
    from integrations.r2_upload import R2UploadClient
    from studio_produce.workload_governor import resource_slot, enabled

    if not enabled():
        raise StoryVoiceoverError("Story narration requires the durable runner governor")
    voice_id=resolve_content_voice_id(parent)
    text=story_text(field_str(parent,"Voiceover_Script"))
    digest=fingerprint(parent["id"],voice_id,text,cap)
    key=f"studio/previews/story-voiceover/{parent['id']}/{digest}.mp3"
    url="https://media.chicagoshining.com/"+key
    snapshot=exact_story_snapshot(output,parent["id"])
    with resource_slot("story_voiceover",key=parent["id"],limit=1,wait_seconds=0):
        current=client.get_record(PLATFORM_OUTPUTS_TABLE,output["id"])
        live_parent=client.get_record(CONTENT_ITEMS_TABLE,parent["id"])
        if (exact_story_snapshot(current,parent["id"])!=snapshot or story_seconds(current)!=cap
                or fingerprint(parent["id"],resolve_content_voice_id(live_parent),
                    story_text(field_str(live_parent,"Voiceover_Script")),cap)!=digest):
            raise StoryVoiceoverError("Story or parent revision changed before narration preparation")
        claims=matching_story_claims(client,live_parent,current["id"],digest,url)
        response=requests.get(url,timeout=(5,20),headers={"Cache-Control":"no-cache"})
        if response.status_code==200:
            data=response.content
            measured=verified_cached_voice(data,claims,cap)
        elif response.status_code==404:
            if claims:
                raise StoryVoiceoverError("Story narration attempt already recorded on a sibling; reconcile before retrying paid generation")
            claim={"fingerprint":digest,"state":"generating","url":url}
            client.update_record(PLATFORM_OUTPUTS_TABLE,current["id"],{RECEIPT:json.dumps(claim)},typecast=True)
            persisted=client.get_record(PLATFORM_OUTPUTS_TABLE,current["id"])
            if (parse_json_field(field(persisted,RECEIPT))!=claim
                    or exact_story_snapshot(persisted,parent["id"])!=snapshot):
                raise StoryVoiceoverError("Story narration claim not durably recorded")
            try:
                raw=synthesize_voiceover_by_id(text,voice_id=voice_id)
                settings=pipeline_settings(client)
                _,data=normalize_voiceover(raw,filename="story-"+digest[:16]+".mp3",
                    normalizer_base_url=settings.get(PIPELINE_SETTING_NORMALIZER_URL))
                measured=checked_voice(data,cap)
                claim={**claim,"state":"prepared","sha256":hashlib.sha256(data).hexdigest()}
                client.update_record(PLATFORM_OUTPUTS_TABLE,current["id"],{RECEIPT:json.dumps(claim)},typecast=True)
                persisted=client.get_record(PLATFORM_OUTPUTS_TABLE,current["id"])
                if parse_json_field(field(persisted,RECEIPT))!=claim:
                    raise StoryVoiceoverError("Story narration checksum receipt not durably recorded")
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
        live_parent=client.get_record(CONTENT_ITEMS_TABLE,parent["id"])
        if fingerprint(parent["id"],resolve_content_voice_id(live_parent),
                story_text(field_str(live_parent,"Voiceover_Script")),cap)!=digest:
            raise StoryVoiceoverError("Parent script or voice changed before narration binding")
        if exact_story_snapshot(fresh,parent["id"])!=snapshot or story_seconds(fresh)!=cap:
            raise StoryVoiceoverError("Story changed before narration binding")
        patch={"Voiceover_URL":url,"Voiceover_Duration_Seconds":measured,
               "Studio_Effective_Voiceover_Duration_Seconds":measured,"Voiceover_Render_Volume":1,
               "Voiceover_Tail_Seconds":0,"Studio_Effective_Voiceover_Tail_Seconds":0,
               RECEIPT:json.dumps({"fingerprint":digest,"state":"verified","url":url,"text":text,
                    "seconds":measured,"sha256":hashlib.sha256(data).hexdigest()},separators=(",",":"))}
        client.update_record(PLATFORM_OUTPUTS_TABLE,fresh["id"],patch,typecast=True)
        return {**fresh,"fields":{**fresh["fields"],**patch}}
