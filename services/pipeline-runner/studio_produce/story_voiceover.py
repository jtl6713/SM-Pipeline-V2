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



STORY_MISSING_SENTENCE = "Studio Story narration integrity guard: Story needs a complete concise narration sentence"


STORY_STORAGE_GUARD = "Studio Story narration integrity guard: Story narration storage existence not safely resolved"


STORY_CACHE_ERRORS = {
    "Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt",
    "Studio Story narration integrity guard: Story narration attempt already recorded on a sibling; reconcile before retrying paid generation",
}


# Exact parked cohort with confirmed original R2 checksums (audit 45616089704).
# These holds remain set throughout rendering and final human review.
HELD_CACHE_RECOVERY = {
    "recoheiAMq2vG48V3": "rec9qS53G7HDoyCL5",
    "reccgtEdV1EKo4Hlp": "rec9qS53G7HDoyCL5",
    "rec0suYTujG4dje1R": "rec3fNJ6QgaL7EMBn",
    "recmx1yk1C8iZBDM1": "rec3fNJ6QgaL7EMBn",
    "recp6KQO7fJMvSzI2": "rec1IvSP9aGeOQRfd",
    "recZYUkGnBDBJrsDf": "rec1IvSP9aGeOQRfd",
    "recjqFCCxBroLyoQJ": "reccVyNLdmJJeI8hG",
    "recjhiYhg1ECvZUHo": "reccVyNLdmJJeI8hG",
    "rec72bKqmIjLMs1gI": "recG0b34XYwYWggTp",
    "recRI9JfNjjhLLo2m": "recG0b34XYwYWggTp",
}


def story_sentence_recovery_candidate(output, parent, *, cached_only=False):
    """Only an unapproved, unheld, unstamped Story with newly valid input.

    Failed/ambiguous paid attempts may enter only the checksum-verified cache
    recovery path, never a new generation. This predicate performs no writes.
    """
    if (not parent or not parent.get("id")
            or field_str(output, "Output_Status") != "In Production"
            or field_str(output, "Render_Status") != "Blocked"
            or (field_str(output, "Remotion_Error_Message") not in (
                {STORY_MISSING_SENTENCE, STORY_STORAGE_GUARD} if not cached_only else STORY_CACHE_ERRORS))
            or field_str(output, "Review_Status") not in {"", "Pending Review", "Review Sent"}
            or (field(output, "Do_Not_Publish") not in (None, False)
                and not (cached_only and field(output, "Do_Not_Publish") is True
                         and HELD_CACHE_RECOVERY.get(output.get("id")) == parent.get("id")
                         and field(output, "Auto_Publish_Enabled") is False))
            or field(output, "Auto_Publish_Enabled") not in (None, False)
            or (not cached_only and field_str(output, RECEIPT))
            or any(field_str(output, name) for name in (
                "Production_Approved_At", "Published_At", "Studio_Scheduled_At",
                "YouTube_Scheduled_Publish_At", "Platform_Post_ID", "Platform_Post_URL",
                "Platform_Media_ID", "Platform_Publish_Response", "Publish_Started_At",
                "Last_Publish_Attempt_At", "Studio_Publish_Dispatch_At",
                "Publish_Locked_At", "IG_Story_Container_ID", "IG_Story_Post_ID",
            ))
            or any(field_str(output, name) not in {"", "0"} for name in (
                "Publish_Attempt_Count", "Studio_Publish_Dispatch_Count",
            ))
            or not field_str(output, "Composition_ID")
            or not field_str(output, "Render_Clip_List_JSON")):
        return False
    try:
        exact_story_snapshot(output, parent["id"])
        story_seconds(output)
        story_text(field_str(parent, "Voiceover_Script"))
    except StoryVoiceoverError:
        return False
    return True


def storage_guard_clear(client, output, parent):
    """Read-only recovery proof. No synthesis, write, or speculative upload."""
    from integrations.r2_upload import R2UploadClient
    from item4.settings import pipeline_settings
    from p2.elevenlabs_client import resolve_content_voice_id
    from studio_produce.workload_governor import AdmissionDeferred, enabled, resource_slot
    if not enabled():
        return False
    try:
        cap = story_seconds(output)
        voice = resolve_content_voice_id(parent)
        digest = fingerprint(parent["id"], voice, story_text(field_str(parent, "Voiceover_Script")), cap)
        key = f"studio/previews/story-voiceover/{parent['id']}/{digest}.mp3"
        url = "https://media.chicagoshining.com/" + key
        with resource_slot("story_voiceover", key=parent["id"], limit=1, wait_seconds=0):
            current = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
            live_parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
            if (not story_sentence_recovery_candidate(current, live_parent)
                    or field_str(current, "Remotion_Error_Message") != STORY_STORAGE_GUARD
                    or exact_story_snapshot(current, parent["id"]) != exact_story_snapshot(output, parent["id"])
                    or fingerprint(parent["id"], resolve_content_voice_id(live_parent),
                        story_text(field_str(live_parent, "Voiceover_Script")), story_seconds(current)) != digest):
                return False
            claims = matching_story_claims(client, live_parent, current["id"], digest, url)
            storage = R2UploadClient(pipeline_settings(client))
            # Once the first sibling recovers, its verified cache can safely
            # unblock the other sibling. A claim without a unique checksum,
            # an unreceipted object or unreadable audio remains blocked.
            if claims:
                known = {claim["sha256"] for claim in claims if claim.get("sha256")}
                if len(known) != 1:
                    return False
                data = storage.read_story_audio(key, next(iter(known)))
                verified_cached_voice(data, claims, cap)
                return True
            return storage.story_audio_exists(key) is False
    except (StoryVoiceoverError, AdmissionDeferred, OSError, RuntimeError, ValueError, requests.RequestException):
        return False


def rearm_story_sentence_guard(client, output, parent):
    """Allow a corrected script back into normal R4, never waive its guard."""
    cached_only = field_str(output, "Remotion_Error_Message") in STORY_CACHE_ERRORS
    if not story_sentence_recovery_candidate(output, parent, cached_only=cached_only):
        return output
    current = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
    live_parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
    if (not story_sentence_recovery_candidate(current, live_parent, cached_only=cached_only)
            or exact_story_snapshot(current, parent["id"]) != exact_story_snapshot(output, parent["id"])
            or story_text(field_str(live_parent, "Voiceover_Script")) != story_text(field_str(parent, "Voiceover_Script"))):
        return current
    if field_str(current, "Remotion_Error_Message") == STORY_STORAGE_GUARD:
        if not storage_guard_clear(client, current, live_parent):
            return current
        # Re-read after the storage probe. R4 still repeats the exact claim
        # and storage checks under its own governor slot before any generation.
        latest = client.get_record(PLATFORM_OUTPUTS_TABLE, current["id"])
        latest_parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
        if (not story_sentence_recovery_candidate(latest, latest_parent)
                or field_str(latest, "Remotion_Error_Message") != STORY_STORAGE_GUARD
                or exact_story_snapshot(latest, parent["id"]) != exact_story_snapshot(current, parent["id"])
                or story_text(field_str(latest_parent, "Voiceover_Script")) != story_text(field_str(live_parent, "Voiceover_Script"))):
            return latest
        current = latest
    if cached_only:
        # No paid synthesis or speculative re-upload. Only an exact current
        # fingerprint with a persisted checksum and valid audible bytes can
        # be attached. A missing or changed object stays blocked.
        from studio_produce.workload_governor import AdmissionDeferred
        try:
            recovered = ensure_story_voiceover(client, current, live_parent, allow_generate=False)
        except (StoryVoiceoverError, AdmissionDeferred, requests.RequestException):
            return current
        current = client.get_record(PLATFORM_OUTPUTS_TABLE, current["id"])
        if (not story_sentence_recovery_candidate(current, live_parent, cached_only=True)
                or exact_story_snapshot(current, parent["id"]) != exact_story_snapshot(recovered, parent["id"])
                or (parse_json_field(field(current, RECEIPT)) or {}).get("state") != "verified"):
            return current
    # R4 still validates timing, revision, narration fit, source integrity,
    # actual render ownership and sibling paid-attempt receipts.
    client.update_record(PLATFORM_OUTPUTS_TABLE, current["id"],
                         {"Render_Status": "Ready for Render"}, typecast=True)
    return client.get_record(PLATFORM_OUTPUTS_TABLE, current["id"])


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


def ensure_story_voiceover(client,output,parent, *, allow_generate=True):
    """Return updated in-memory exact output. No parent mutation; no approval."""
    if not needs_story_voiceover(output):
        return output
    if not parent or not parent.get("id"):
        raise StoryVoiceoverError("Story narration parent unavailable")
    cap=story_seconds(output)
    existing=field_str(output,"Voiceover_URL")
    parent_url=field_str(parent,"Voiceover_URL")
    receipt=parse_json_field(field(output,RECEIPT)) or {}
    if allow_generate and existing and existing!=parent_url and not receipt:
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
        known = {claim["sha256"] for claim in claims if claim.get("sha256")}
        from studio_produce.story_history_recovery import HISTORY_RECOVERY, download_audited_history
        history = HISTORY_RECOVERY.get(parent["id"])
        provenance = {}
        if claims:
            if not known and history and current["id"] in history["outputs"]:
                # Only explicitly audited exact pairs, their original failed
                # receipt and independently verified provider bytes. Default
                # remains held for the earlier incident; Echo Park is unheld.
                expected_hold = history.get("held", True)
                if (digest != history["fingerprint"] or len(claims)!=1
                        or claims[0].get("state")!="failed"
                        or field(current,"Do_Not_Publish") is not expected_hold
                        or not story_sentence_recovery_candidate(current,live_parent,cached_only=True)):
                    raise StoryVoiceoverError("Story history recovery identity changed")
                try:
                    settings = pipeline_settings(client)
                    storage = R2UploadClient(settings)
                    if storage.story_audio_exists(key):
                        raise StoryVoiceoverError("Unexpected existing Story audio without receipt checksum")
                    raw = download_audited_history(history,text,voice_id)
                    _,data=normalize_voiceover(raw,filename="story-history-"+digest[:16]+".mp3",
                        normalizer_base_url=settings.get(PIPELINE_SETTING_NORMALIZER_URL))
                    measured=checked_voice(data,cap)
                    latest=client.get_record(PLATFORM_OUTPUTS_TABLE,current["id"])
                    latest_parent=client.get_record(CONTENT_ITEMS_TABLE,parent["id"])
                    if (not story_sentence_recovery_candidate(latest,latest_parent,cached_only=True)
                            or field(latest,"Do_Not_Publish") is not expected_hold
                            or exact_story_snapshot(latest,parent["id"])!=snapshot
                            or fingerprint(parent["id"],resolve_content_voice_id(latest_parent),
                                story_text(field_str(latest_parent,"Voiceover_Script")),cap)!=digest
                            or matching_story_claims(client,latest_parent,latest["id"],digest,url)!=claims):
                        raise StoryVoiceoverError("Story history recovery changed before write")
                    provenance={"history_original_sha256":history["sha256"],
                                "history_created_at":history["created_at"]}
                    prepared={"fingerprint":digest,"state":"prepared","url":url,
                              "sha256":hashlib.sha256(data).hexdigest(),**provenance}
                    client.update_record(PLATFORM_OUTPUTS_TABLE,latest["id"],{RECEIPT:json.dumps(prepared)},typecast=True)
                    if parse_json_field(field(client.get_record(PLATFORM_OUTPUTS_TABLE,latest["id"]),RECEIPT))!=prepared:
                        raise StoryVoiceoverError("Story history checksum receipt not durable")
                    if not storage.story_audio_exists(key):
                        storage.put_object(key,data,"audio/mpeg")
                    if storage.read_story_audio(key,prepared["sha256"])!=data:
                        raise StoryVoiceoverError("Recovered Story history storage readback failed")
                except (OSError, RuntimeError, ValueError, requests.RequestException) as exc:
                    raise StoryVoiceoverError("Exact Story history recovery failed; no new synthesis") from exc
            else:
                if len(known) != 1:
                    raise StoryVoiceoverError("Story narration attempt already recorded on a sibling; reconcile before retrying paid generation")
                try:
                    storage = R2UploadClient(pipeline_settings(client))
                    data = storage.read_story_audio(key, next(iter(known)))
                    measured = verified_cached_voice(data, claims, cap)
                    if history and any(c.get("history_original_sha256")==history["sha256"] for c in claims):
                        provenance={"history_original_sha256":history["sha256"],
                                    "history_created_at":history["created_at"]}
                except (OSError, RuntimeError, ValueError, requests.RequestException) as exc:
                    raise StoryVoiceoverError("Story narration cache unavailable; refuse duplicate paid attempt") from exc
        else:
            if not allow_generate or (history and current["id"] in history["outputs"]):
                raise StoryVoiceoverError("Existing Story narration cache unavailable; no paid regeneration")
            try:
                settings = pipeline_settings(client)
                storage = R2UploadClient(settings)
                if storage.story_audio_exists(key):
                    raise StoryVoiceoverError("Story audio already exists without a verified receipt")
            except (OSError, RuntimeError, ValueError, requests.RequestException) as exc:
                raise StoryVoiceoverError("Story narration storage existence not safely resolved") from exc
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
                storage.put_object(key,data,"audio/mpeg")
                if storage.read_story_audio(key,claim["sha256"]) != data:
                    raise StoryVoiceoverError("Story narration upload readback not confirmed")
            except Exception as exc:
                client.update_record(PLATFORM_OUTPUTS_TABLE,current["id"],{
                    RECEIPT:json.dumps({**claim,"state":"failed"})},typecast=True)
                raise StoryVoiceoverError("Story narration preparation failed; reconcile its exact attempt") from exc
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
                    "seconds":measured,"sha256":hashlib.sha256(data).hexdigest(),**provenance},separators=(",",":"))}
        client.update_record(PLATFORM_OUTPUTS_TABLE,fresh["id"],patch,typecast=True)
        return {**fresh,"fields":{**fresh["fields"],**patch}}


def private_story_render_url(output, parent):
    """Build only the exact verified source URL for same-host Remotion."""
    if not needs_story_voiceover(output):
        return None
    receipt = parse_json_field(field(output, RECEIPT)) or {}
    if not receipt:
        return None  # explicitly supplied Story voiceover
    if not isinstance(receipt, dict) or receipt.get("state") != "verified":
        raise StoryVoiceoverError("Story narration receipt is not verified")
    digest, sha = receipt.get("fingerprint"), receipt.get("sha256")
    parent_id = (parent or {}).get("id", "")
    if not (re.fullmatch(r"rec[A-Za-z0-9]{14}", parent_id)
            and isinstance(digest, str) and re.fullmatch(r"[a-f0-9]{64}", digest)
            and isinstance(sha, str) and re.fullmatch(r"[a-f0-9]{64}", sha)):
        raise StoryVoiceoverError("Story narration receipt identity invalid")
    url = f"https://media.chicagoshining.com/studio/previews/story-voiceover/{parent_id}/{digest}.mp3"
    if receipt.get("url") != url or field_str(output, "Voiceover_URL") != url:
        raise StoryVoiceoverError("Story narration receipt/source mismatch")
    return f"http://127.0.0.1:3350/internal/story-audio/{parent_id}/{digest}/{sha}.mp3"
