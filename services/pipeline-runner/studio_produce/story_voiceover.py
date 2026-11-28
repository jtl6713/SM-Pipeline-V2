"""Bounded, independently timed narration for generated companion Stories."""
from __future__ import annotations

import hashlib
import json
import logging
import re

import requests

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from audio.speech_activity import probe_max_volume_db
from audio.voiceover_duration import probe_audio_duration_bytes, probe_audio_duration_url
from render.fields import field, field_str, first_linked_id, parse_json_field

RECEIPT = "Studio_Story_Voiceover_Receipt_JSON"
logger = logging.getLogger(__name__)

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
    # A period embedded inside an initialism (U.S., a.m.) is not a
    # sentence boundary. Require whitespace or end of input after punctuation;
    # the previous character-class split returned the incomplete "continental U.".
    for sentence in re.findall(r".+?[.!?]+(?=\s|$)", str(script or "").strip(), flags=re.S):
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


STORY_VERIFIED_CACHE_ERROR = "Studio Story narration integrity guard: Story narration cache unavailable; refuse duplicate paid attempt"


STORY_CACHE_ERRORS = {
    STORY_VERIFIED_CACHE_ERROR,
    "Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt",
    "Studio Story narration integrity guard: Story narration attempt already recorded on a sibling; reconcile before retrying paid generation",
}


# Exact paused Story cache candidates, authenticated inventory 46161305343.
# These two specific outputs must never use paid regeneration, even if a
# receipt disappears during an existing render-stage continuation.
EXACT_3159_CACHED_STORIES = {
    "recLzYh6rylP7ghEy": "rec7Pz6dVvZpnDMjT",
    "recRyS2Gsy8uh10ND": "recm83Z4R3CdpgQrI",
}


def exact_3159_cache_receipt(output, parent_id, receipt):
    if (EXACT_3159_CACHED_STORIES.get(output.get("id")) != parent_id
            or field(output, "Do_Not_Publish") is not True
            or field(output, "Auto_Publish_Enabled") is not False
            or not isinstance(receipt, dict)
            or receipt.get("state") not in {"failed", "verified"}):
        return False
    digest, sha = receipt.get("fingerprint"), receipt.get("sha256")
    return bool(re.fullmatch(r"[a-f0-9]{64}", str(digest or ""))
                and re.fullmatch(r"[a-f0-9]{64}", str(sha or ""))
                and receipt.get("url") == f"https://media.chicagoshining.com/studio/previews/story-voiceover/{parent_id}/{digest}.mp3")


# Exact parked cohort with confirmed original R2 checksums (audit 45616089704).
# These holds remain set throughout rendering and final human review.
HELD_CACHE_RECOVERY = {
    **EXACT_3159_CACHED_STORIES,
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


# Exact eight storage-guard parents: positive-control HEAD audit 46151753193.
# A prior absence is NOT a current storage authorization. Normal R4 repeats
# exact live absence and the durable sibling claim before its first paid call.
HELD_STORAGE_RECOVERY = {
    "recZVRMvmIYwTwKTd": ("rec98yS7Pl7tAAqih", "409cd89bc52e929c6dbd57d0f11d2acfa1673446ccb7ddc03c4d448e4ac7a9b6"),
    "recvUWDcO2Y2L0MK1": ("rec98yS7Pl7tAAqih", "409cd89bc52e929c6dbd57d0f11d2acfa1673446ccb7ddc03c4d448e4ac7a9b6"),
    "recONsGlBKsE8VTdP": ("recbjg7rXQCiA6DzY", "1aae9a3cef8cc1fefb95b70155656760dc993e3252d348f746d94d50dedea852"),
    "recKwClsbFCOJaKbC": ("recbjg7rXQCiA6DzY", "1aae9a3cef8cc1fefb95b70155656760dc993e3252d348f746d94d50dedea852"),
    "receOfwtyngfyCboh": ("rec0gE5IoTuSoqy5E", "cae8fcf0c3e661c0ba84af5bde37630b8ca97b0d6fdf28e5edad6c8352ee9cc7"),
    "recgCPmQEWy5cA5Nw": ("rec0gE5IoTuSoqy5E", "cae8fcf0c3e661c0ba84af5bde37630b8ca97b0d6fdf28e5edad6c8352ee9cc7"),
    "recv8TRI6cYAwF1AF": ("rec1LmWHV6VvfdXp0", "eb8b53dd293d30b2330452d2ee4b4a3ceb71314ab182a9d6668bfb884702acff"),
    "recqIuVlct8IMs56a": ("rec1LmWHV6VvfdXp0", "eb8b53dd293d30b2330452d2ee4b4a3ceb71314ab182a9d6668bfb884702acff"),
    "reczMVFz209yngV1H": ("recKTD3ZnQpNxxvgH", "37166e6ba347f88dd0f88ea6b8c82cd9d4f23e41c3b65ab2f05218c4bc14e4b1"),
    "recCypRwiZF4xHMgE": ("recKTD3ZnQpNxxvgH", "37166e6ba347f88dd0f88ea6b8c82cd9d4f23e41c3b65ab2f05218c4bc14e4b1"),
    "reclCt4yPUBDhPR9Y": ("recQnOwB4Qg9FHIup", "44025e7f5c36ee7be229c8bfc18f8a50c5a05956da5418d6c2ba41a3d0552ccb"),
    "recfrU5PjR5d5VwsR": ("recQnOwB4Qg9FHIup", "44025e7f5c36ee7be229c8bfc18f8a50c5a05956da5418d6c2ba41a3d0552ccb"),
    "recRHAB4dpThNs7TT": ("recrUkXlSXxtwztFU", "9a31e2e854846221b3f4db01c744b95fbb20e144e2285a34a0f531be02f3ae59"),
    "recewgpHg6l7SI344": ("recrUkXlSXxtwztFU", "9a31e2e854846221b3f4db01c744b95fbb20e144e2285a34a0f531be02f3ae59"),
    "recihZZobVTvXDuer": ("recsusqK58K0eP6z3", "1ac49c7889651b2a56fea685f1caf58aad4c6af2bf6ec184ac3586ecb4d8f236"),
    "rec5wWC93FYeXiqRR": ("recsusqK58K0eP6z3", "1ac49c7889651b2a56fea685f1caf58aad4c6af2bf6ec184ac3586ecb4d8f236"),
    "recBOQEGqk0lgF4HF": ("recs0vBdT1jmUIWL0", "7b90b68508c2a93a8744a4b2f63a6386a642e4d8eca56e649a799b9ba9d9100d"),
    "reckFi5S3Ynrxxggl": ("recs0vBdT1jmUIWL0", "7b90b68508c2a93a8744a4b2f63a6386a642e4d8eca56e649a799b9ba9d9100d"),
}


# Exact complete independent opening clause of current parent script; only
# these two unapproved companion Stories receive this shorter narration.
_CONCISE_3159_IDS = {"recZVRMvmIYwTwKTd", "recvUWDcO2Y2L0MK1"}
_CONCISE_3159_SOURCE = "Make the most of a CTA day pass and roam Chicago—bounce between neighborhoods, grab bites, and catch skyline views, all on one ticket 🚇 Save this for your next city day and drop your favorite stop in the comments."
_CONCISE_3159_TEXT = "Make the most of a CTA day pass and roam Chicago."


def story_text_for_output(output, parent):
    source = field_str(parent, "Voiceover_Script")
    if output.get("id") in _CONCISE_3159_IDS:
        if parent.get("id") != "rec98yS7Pl7tAAqih" or source.strip() != _CONCISE_3159_SOURCE:
            raise StoryVoiceoverError("Audited concise Story source revision changed")
        return _CONCISE_3159_TEXT
    return story_text(source)


def storage_recovery_error(output):
    if output.get("id") in _CONCISE_3159_IDS:
        return STORY_MISSING_SENTENCE
    return STORY_STORAGE_GUARD


def held_storage_identity(output, parent):
    return (HELD_STORAGE_RECOVERY.get(output.get("id"), (None, None))[0] == parent.get("id")
            and bool(parent.get("id"))
            and field(output, "Do_Not_Publish") is True
            and field(output, "Auto_Publish_Enabled") is False
            and field_str(output, "Publish_Status") == "Not Ready"
            and field_str(output, "Review_Status") in {"", "Pending Review", "Review Sent"}
            and not any(field_str(output, key) for key in (
                "Scheduled_Post_Date", "Studio_Scheduled_At", "YouTube_Scheduled_Publish_At",
                "Published_At", "Production_Approved_At", "Platform_Post_ID", "Platform_Post_URL",
                "Platform_Media_ID", "Platform_Publish_Response", "Publish_Started_At",
                "Last_Publish_Attempt_At", "Studio_Publish_Dispatch_At", "Publish_Locked_At",
                "IG_Story_Container_ID", "IG_Story_Post_ID"))
            and all(field_str(output, key) in {"", "0"} for key in (
                "Publish_Attempt_Count", "Studio_Publish_Dispatch_Count")))


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
                         and field(output, "Auto_Publish_Enabled") is False)
                and not (not cached_only and field_str(output, "Remotion_Error_Message") == storage_recovery_error(output)
                         and held_storage_identity(output, parent)))
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
    if field_str(output, "Remotion_Error_Message") == STORY_VERIFIED_CACHE_ERROR:
        # This failure is retryable only from its own persisted, verified
        # immutable byte receipt. Never fall through to paid/history recovery.
        receipt = parse_json_field(field(output, RECEIPT)) or {}
        if (not cached_only or not isinstance(receipt, dict)
                or (receipt.get("state") != "verified" and not exact_3159_cache_receipt(output, parent["id"], receipt))
                or not re.fullmatch(r"[a-f0-9]{64}", str(receipt.get("sha256") or ""))
                or not re.fullmatch(r"[a-f0-9]{64}", str(receipt.get("fingerprint") or ""))
                or receipt.get("url") != f"https://media.chicagoshining.com/studio/previews/story-voiceover/{parent['id']}/{receipt.get('fingerprint')}.mp3"):
            return False
    try:
        exact_story_snapshot(output, parent["id"])
        story_seconds(output)
        story_text_for_output(output, parent)
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
        digest = fingerprint(parent["id"], voice, story_text_for_output(output, parent), cap)
        if output.get("id") in HELD_STORAGE_RECOVERY and (
                not held_storage_identity(output, parent)
                or HELD_STORAGE_RECOVERY[output["id"]] != (parent["id"], digest)):
            return False
        key = f"studio/previews/story-voiceover/{parent['id']}/{digest}.mp3"
        url = "https://media.chicagoshining.com/" + key
        with resource_slot("story_voiceover", key=parent["id"], limit=1, wait_seconds=0):
            current = client.get_record(PLATFORM_OUTPUTS_TABLE, output["id"])
            live_parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
            if (not story_sentence_recovery_candidate(current, live_parent)
                    or field_str(current, "Remotion_Error_Message") != storage_recovery_error(current)
                    or exact_story_snapshot(current, parent["id"]) != exact_story_snapshot(output, parent["id"])
                    or fingerprint(parent["id"], resolve_content_voice_id(live_parent),
                        story_text_for_output(current, live_parent), story_seconds(current)) != digest):
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
            or story_text_for_output(current, live_parent) != story_text_for_output(output, parent)):
        return current
    if (field_str(current, "Remotion_Error_Message") == STORY_STORAGE_GUARD
            or (current.get("id") in _CONCISE_3159_IDS
                and field_str(current, "Remotion_Error_Message") == STORY_MISSING_SENTENCE)):
        if not storage_guard_clear(client, current, live_parent):
            return current
        # Re-read after the storage probe. R4 still repeats the exact claim
        # and storage checks under its own governor slot before any generation.
        latest = client.get_record(PLATFORM_OUTPUTS_TABLE, current["id"])
        latest_parent = client.get_record(CONTENT_ITEMS_TABLE, parent["id"])
        if (not story_sentence_recovery_candidate(latest, latest_parent)
                or field_str(latest, "Remotion_Error_Message") != storage_recovery_error(latest)
                or exact_story_snapshot(latest, parent["id"]) != exact_story_snapshot(current, parent["id"])
                or story_text_for_output(latest, latest_parent) != story_text_for_output(current, live_parent)):
            return latest
        current = latest
    if cached_only:
        # No paid synthesis or speculative re-upload. Only an exact current
        # fingerprint with a persisted checksum and valid audible bytes can
        # be attached. A missing or changed object stays blocked.
        from studio_produce.workload_governor import AdmissionDeferred
        try:
            recovered = ensure_story_voiceover(client, current, live_parent, allow_generate=False)
        except (StoryVoiceoverError, AdmissionDeferred, requests.RequestException) as exc:
            # Do not emit provider payloads, URLs or credentials. Surface the
            # bounded safe history stage, rather than a silent rendering 4/6 loop.
            if not isinstance(exc, AdmissionDeferred):
                stage = getattr(exc, "history_stage", "cache_or_identity")
                logger.warning("story_rearm_deferred output=%s stage=%s error_type=%s", current.get("id"), stage, type(exc).__name__)
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
    exact_cache = output.get("id") in EXACT_3159_CACHED_STORIES
    if exact_cache and not exact_3159_cache_receipt(output, parent["id"], receipt):
        raise StoryVoiceoverError("Exact cached Story receipt or hold changed; no new synthesis")
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
    text=story_text_for_output(output,parent)
    digest=fingerprint(parent["id"],voice_id,text,cap)
    key=f"studio/previews/story-voiceover/{parent['id']}/{digest}.mp3"
    url="https://media.chicagoshining.com/"+key
    snapshot=exact_story_snapshot(output,parent["id"])
    with resource_slot("story_voiceover",key=parent["id"],limit=1,wait_seconds=0):
        current=client.get_record(PLATFORM_OUTPUTS_TABLE,output["id"])
        live_parent=client.get_record(CONTENT_ITEMS_TABLE,parent["id"])
        if (exact_story_snapshot(current,parent["id"])!=snapshot or story_seconds(current)!=cap
                or fingerprint(parent["id"],resolve_content_voice_id(live_parent),
                    story_text_for_output(current,live_parent),cap)!=digest):
            raise StoryVoiceoverError("Story or parent revision changed before narration preparation")
        if current.get("id") in HELD_STORAGE_RECOVERY and (
                not held_storage_identity(current, live_parent)
                or HELD_STORAGE_RECOVERY[current["id"]] != (live_parent["id"], digest)):
            raise StoryVoiceoverError("Audited held storage recovery identity changed")
        claims=matching_story_claims(client,live_parent,current["id"],digest,url)
        known = {claim["sha256"] for claim in claims if claim.get("sha256")}
        from studio_produce.story_history_recovery import HISTORY_RECOVERY, download_audited_history, fit_short_audited_history
        history = HISTORY_RECOVERY.get(parent["id"])
        provenance = {}
        if exact_cache:
            own = parse_json_field(field(current, RECEIPT)) or {}
            if (not exact_3159_cache_receipt(current, live_parent["id"], own)
                    or own.get("fingerprint") != digest or own.get("url") != url
                    or known != {own.get("sha256")} or own.get("sha256") != receipt.get("sha256")):
                raise StoryVoiceoverError("Exact cached Story fingerprint or checksum changed; no new synthesis")
        if ((not exact_cache and field_str(current, "Remotion_Error_Message") == STORY_VERIFIED_CACHE_ERROR)
                or (current["id"] == "recoheiAMq2vG48V3" and live_parent["id"] == "rec9qS53G7HDoyCL5"
                    and field(current, "Do_Not_Publish") is True)):
            # Also enforce the exact held probe after rearm, when R4 may
            # clear the original error label before checking narration.
            own = parse_json_field(field(current, RECEIPT)) or {}
            if (not isinstance(own, dict) or own.get("state") != "verified"
                    or own.get("fingerprint") != digest or own.get("url") != url
                    or known != {own.get("sha256")}
                    or not re.fullmatch(r"[a-f0-9]{64}", str(own.get("sha256") or ""))):
                raise StoryVoiceoverError("Story verified cache receipt changed; no regeneration")
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
                history_stage = "storage_preflight"
                try:
                    settings = pipeline_settings(client)
                    storage = R2UploadClient(settings)
                    if storage.story_audio_exists(key):
                        raise StoryVoiceoverError("Unexpected existing Story audio without receipt checksum")
                    history_stage = "original_provider_get"
                    raw = download_audited_history(history,text,voice_id)
                    history_stage = "audited_pitch_preserving_pace"
                    paced = fit_short_audited_history(raw,history)
                    history_stage = "normalize"
                    _,data=normalize_voiceover(paced,filename="story-history-"+digest[:16]+".mp3",
                        normalizer_base_url=settings.get(PIPELINE_SETTING_NORMALIZER_URL))
                    history_stage = "normalized_duration_and_peak"
                    measured=checked_voice(data,cap)
                    history_stage = "revision_readback"
                    latest=client.get_record(PLATFORM_OUTPUTS_TABLE,current["id"])
                    latest_parent=client.get_record(CONTENT_ITEMS_TABLE,parent["id"])
                    if (not story_sentence_recovery_candidate(latest,latest_parent,cached_only=True)
                            or field(latest,"Do_Not_Publish") is not expected_hold
                            or exact_story_snapshot(latest,parent["id"])!=snapshot
                            or fingerprint(parent["id"],resolve_content_voice_id(latest_parent),
                                story_text_for_output(latest,latest_parent),cap)!=digest
                            or matching_story_claims(client,latest_parent,latest["id"],digest,url)!=claims):
                        raise StoryVoiceoverError("Story history recovery changed before write")
                    provenance={"history_original_sha256":history["sha256"],
                                "history_created_at":history["created_at"]}
                    prepared={"fingerprint":digest,"state":"prepared","url":url,
                              "sha256":hashlib.sha256(data).hexdigest(),**provenance}
                    history_stage = "persist_prepared_checksum"
                    client.update_record(PLATFORM_OUTPUTS_TABLE,latest["id"],{RECEIPT:json.dumps(prepared)},typecast=True)
                    if parse_json_field(field(client.get_record(PLATFORM_OUTPUTS_TABLE,latest["id"]),RECEIPT))!=prepared:
                        raise StoryVoiceoverError("Story history checksum receipt not durable")
                    history_stage = "checksum_bound_storage"
                    if not storage.story_audio_exists(key):
                        storage.put_object(key,data,"audio/mpeg")
                    if storage.read_story_audio(key,prepared["sha256"])!=data:
                        raise StoryVoiceoverError("Recovered Story history storage readback failed")
                except (OSError, RuntimeError, ValueError, requests.RequestException, TimeoutError) as exc:
                    error=StoryVoiceoverError("Exact Story history recovery failed; no new synthesis")
                    error.history_stage=history_stage
                    raise error from exc
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
                story_text_for_output(current,live_parent),cap)!=digest:
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
