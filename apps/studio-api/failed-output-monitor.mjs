/** Complete, read-only failed-output census used by Desk and Factory Quality Agent. */
export const FAILED_OUTPUT_FORMULA = 'AND({Test_Run_ID}=BLANK(),NOT(AND({Output_Status}="Cancelled",{Review_Status}="Skipped",{Do_Not_Publish}=1)),OR(AND({Platform}="Facebook",{Publish_Error_Stage}="META_SECURITY_CHALLENGE",{Published_At}=BLANK()),AND({Platform}="Facebook",{Publish_Error_Stage}="FACEBOOK_CHECKPOINT_REQUIRED",{Published_At}=BLANK()),AND({Publish_Error_Stage}="FACEBOOK_STORY_RATE_LIMIT_368",{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),{Platform_Post_URL}=BLANK(),{Do_Not_Publish}=0),{Output_Status}="Failed",{Render_Status}="Failed",{Publish_Status}="Failed",AND({Publish_Error_Message}!="",{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published"),AND({IG_Carousel_Error_Message}!="",{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published"),AND({IG_Carousel_Status}="Children Processing",{IG_Carousel_Parent_Response_JSON}!="",{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published"),AND({Manual_Fallback_Required}=1,{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published")))';

export async function scanOutstandingFailedOutputs(fetchPage, { pageSize = 100, filterFormula = FAILED_OUTPUT_FORMULA, requireUnique = false } = {}) {
  const records = [];
  const seenRecords = new Set();
  const visitedOffsets = new Set();
  let offset = null;
  do {
    const page = await fetchPage({ limit: Math.min(100, Math.max(1, pageSize)), offset, filterFormula });
    if (!page || !Array.isArray(page.records)) throw new Error("Failed-output scan returned an invalid page");
    for (const row of page.records) {
      if (row?.id && seenRecords.has(row.id) && requireUnique) {
        throw new Error("Repeated record identity in strict Airtable census");
      }
      if (row?.id && !seenRecords.has(row.id)) {
        seenRecords.add(row.id);
        records.push(row);
      }
    }
    offset = page.offset || null;
    if (offset && visitedOffsets.has(offset)) throw new Error("Failed-output scan repeated its pagination cursor");
    if (offset) visitedOffsets.add(offset);
  } while (offset);
  return records;
}

const text = (row, key) => String(row?.fields?.[key] ?? row?.[key] ?? "").trim();
const truthy = (row, key) => row?.fields?.[key] === true || row?.[key] === true;
function firstLinkedId(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "object" ? String(first?.id || first?.name || "") : String(first || "");
  }
  if (value && typeof value === "object") {
    const nested = Object.values(value.valuesByLinkedRecordId || {}).flat();
    return String(nested[0]?.id || nested[0]?.name || value.linkedRecordIds?.[0] || "");
  }
  return String(value || "");
}

/** Enforce publication idempotency, cooldowns and bounded automatic retries. */
export function failedOutputRetryGate(record, { nowMs = Date.now(), maxAttempts = 3 } = {}) {
  if (text(record, "Published_At") || text(record, "Platform_Post_ID") || text(record, "Platform_Post_URL")) return "publication_evidence";
  if (truthy(record, "Do_Not_Publish")) return "publication_held";
  const retryMs = Date.parse(text(record, "Publish_Next_Retry_At"));
  if (Number.isFinite(retryMs) && retryMs > nowMs) return "cooldown";
  if (Number(text(record, "Publish_Attempt_Count")) >= maxAttempts ||
      Number(text(record, "Studio_Publish_Dispatch_Count")) >= maxAttempts) return "retry_limit";
  const lockMs = Date.parse(text(record, "Publish_Locked_At"));
  if (text(record, "Publish_Locked_By") && Number.isFinite(lockMs) &&
      nowMs - lockMs < 15 * 60 * 1000) return "publish_locked";
  return null;
}

/** Operator-driven Facebook rate-limit reset: never bypass publishing safety guards. */
export function facebookRateLimitResetReason(record, { nowMs = Date.now(), maxAttempts = 3 } = {}) {
  if (text(record, "Platform").toLowerCase() !== "facebook") return "not_facebook";
  const error = text(record, "Publish_Error_Message");
  if (!/facebook rate limit|1390008|\b368\b/i.test(error)) return "not_rate_limited";
  if (text(record, "Publish_Status") !== "Failed" && text(record, "Output_Status") !== "Failed") return "not_failed";
  if (text(record, "Review_Status") !== "Approved") return "approval_not_confirmed";
  if (text(record, "Published_At") || text(record, "Platform_Post_ID")
      || text(record, "Platform_Post_URL") || text(record, "Facebook_Post_ID")
      || text(record, "FB_Post_ID") || text(record, "FB_Video_ID")
      || /published/i.test(text(record, "FB_Publish_Status"))
      || /published/i.test(text(record, "FB_Slideshow_Status"))) return "publication_evidence";
  if (truthy(record, "Do_Not_Publish")) return "publication_held";
  if (Number(text(record, "Publish_Attempt_Count")) >= maxAttempts
      || Number(text(record, "Studio_Publish_Dispatch_Count")) >= maxAttempts) return "retry_limit";
  const lockedAt = Date.parse(text(record, "Publish_Locked_At"));
  if (text(record, "Publish_Locked_By") && (!Number.isFinite(lockedAt) || nowMs - lockedAt < 15 * 60 * 1000))
    return "publish_locked";
  if (text(record, "Render_Status") === "Failed") return "render_failed";
  if (!text(record, "Final_File_ID") && !text(record, "Final_File_URL")
      && !text(record, "Final_Video_URL") && !text(record, "Rendered_Video_URL"))
    return "finished_media_missing";
  return null;
}


/**
 * A narrow, operator-approved scheduling-only transition for Facebook Reel
 * Graph 368 holds. Reserving a date NEVER lifts the hard publication hold.
 * Retired Stories, general holds, previously posted rows and retry-exhausted
 * outputs are not eligible.
 */
export function facebookSpamHeldRescheduleReason(record) {
  if (text(record,"Platform")!=="Facebook" ||
      !/Facebook Reel/i.test(text(record,"Platform_Output_Type")||text(record,"Studio_Output_Type"))) return "not_active_facebook_reel";
  if (text(record,"Publish_Error_Stage")!=="FBS3_RATE_LIMIT") return "not_spam_rate_limit";
  if (!truthy(record,"Do_Not_Publish")) return "not_protective_hold";
  const notes=text(record,"Studio_Output_Notes");
  if (!/QA-1050 HARD NO-GRAPH-CREATE HOLD/.test(notes)) return "unknown_hold_provenance";
  if (/SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION/.test(notes)) return "already_rescheduled_pending_verification";
  if (text(record,"Output_Status")!=="Approved for Publishing" ||
      text(record,"Review_Status")!=="Approved" || text(record,"Publish_Status")!=="Failed") return "not_approved_failed";
  if (text(record,"Test_Run_ID")) return "test_output";
  const withoutHold={...record,fields:{...(record.fields||{}),Do_Not_Publish:false}};
  return facebookRateLimitResetReason(withoutHold);
}

/**
 * QA-FB-STORY-368-RETRY-PENDING: the native Facebook Story Graph path can
 * leave an approved, future-scheduled output parked with only Publish_Error_Stage
 * and Studio_Publish_Dispatch_Note. Old FBS3-only rearm cannot see this state.
 * Pure, fail-closed gate for rearming the existing scheduled publisher. This
 * does NOT authorize immediate or duplicate publication.
 */
export function facebookStoryRateLimitRearmReason(record, { nowMs = Date.now(), maxAttempts = 3 } = {}) {
  if (text(record, "Platform") !== "Facebook" || text(record, "Platform_Output_Type") !== "Facebook Story") return "not_facebook_story";
  if (text(record, "Publish_Error_Stage") !== "FACEBOOK_STORY_RATE_LIMIT_368") return "not_story_rate_limit";
  if (text(record, "Review_Status") !== "Approved" || text(record, "Output_Status") !== "Approved for Publishing") return "approval_not_confirmed";
  if (!["Ready to Schedule", "Ready to Publish", "Failed"].includes(text(record, "Publish_Status"))) return "unexpected_publish_state";
  if (text(record, "Test_Run_ID") || truthy(record, "Do_Not_Publish")) return "publication_held";
  if (["Published", "Posted"].includes(text(record, "FB_Publish_Status"))
      || text(record, "Published_At") || text(record, "Platform_Post_ID")
      || text(record, "Platform_Post_URL") || text(record, "Manual_Published_URL")
      || text(record, "Platform_Media_ID")) return "publication_evidence";
  const nextRetry = Date.parse(text(record, "Publish_Next_Retry_At"));
  if (!Number.isFinite(nextRetry)) return "missing_retry_time";
  // Exhausted dispatches are evidence-blocked even before the cooldown expires.
  // A future retry timestamp must NEVER suggest that they can be rearmed.
  if (Number(text(record, "Publish_Attempt_Count")) >= maxAttempts
      || Number(text(record, "Studio_Publish_Dispatch_Count")) >= maxAttempts) return "retry_limit";
  if (nextRetry > nowMs) return "cooldown";
  const scheduleAt = Date.parse(text(record, "Scheduled_Post_Date"));
  if (!Number.isFinite(scheduleAt)) return "missing_scheduled_date";
  if (!/^https:\/\/media\.chicagoshining\.com\//i.test(text(record, "Publish_Asset_URL"))) return "missing_public_story_asset";
  if (text(record, "Publish_Locked_By") || text(record, "Publish_Locked_At")) return "publish_locked";
  return null;
}

export function describeFailedOutput(record, nowMs = Date.now()) {
  const outputId = text(record, "Output_ID");
  const output = text(record, "Output_Status");
  const render = text(record, "Render_Status");
  const publish = text(record, "Publish_Status");
  const error = text(record, "Publish_Error_Message") || text(record, "Remotion_Error_Message")
    || text(record, "Final_File_Error_Message") || text(record, "IG_Carousel_Error_Message")
    || text(record, "FB_Slideshow_Error_Message") || text(record, "YouTube_Error_Message");
  const publishedEvidence = Boolean(text(record, "Published_At") || text(record, "Platform_Post_ID") || text(record, "Platform_Post_URL"));
  const igError = text(record, "IG_Carousel_Error_Message");
  const igParentResponse = text(record, "IG_Carousel_Parent_Response_JSON");
  const igStatus = text(record, "IG_Carousel_Status");
  const igAttempts = Number(text(record, "IG_Carousel_Retry_Count")) || 0;
  const expected = Number(text(record, "Image_Count")) || Number(text(record, "IG_Carousel_Child_Count")) || 0;
  const linked = Array.isArray(record?.fields?.["Carousel Slides"]) ? record.fields["Carousel Slides"].length : 0;
  const isIgCarousel = text(record, "Platform").toLowerCase() === "instagram"
    && /carousel/i.test(text(record, "Platform_Output_Type") || text(record, "Studio_Output_Type"));
  const retryAt = text(record, "Publish_Next_Retry_At");
  const retryMs = Date.parse(retryAt);
  const attempts = Math.max(Number(text(record, "Publish_Attempt_Count")) || 0, Number(text(record, "Studio_Publish_Dispatch_Count")) || 0);
  let signature = null;
  let recovery = "needs_attention";
  let reason = error || "Failure has no diagnostic message. Inspect the output and last pipeline activity.";
  let action = "Inspect the failure and repair its source before retrying.";
  if (publishedEvidence) {
    recovery = "reconcile";
    reason = "Platform publication evidence already exists; never republish this output.";
    action = "Verify platform post, then reconcile its status using the existing live-publish healer.";
  } else if (truthy(record, "Do_Not_Publish")) {
    recovery = "held";
    reason = "Publication is explicitly disabled for this output.";
    action = "Review the publication hold; do not retry automatically.";
  } else if (Number.isFinite(retryMs) && retryMs > nowMs) {
    recovery = "cooldown";
    action = "Wait until the recorded next-retry time; do not bypass the cooldown.";
  } else if (attempts >= 3) {
    recovery = "exhausted";
    action = "Investigate the last attempts; retry limit reached. Do not restart blindly.";
  } else if (publish === "Failed" && /unauthorized|authentication failure|\\b40[13]\\b/i.test(error) && text(record, "Platform") === "TikTok") {
    recovery = "needs_attention";
    action = "Repair TikTok city-auth credentials before a single controlled retry.";
  } else if (render === "Failed") {
    recovery = "healer_eligible";
    action = "Existing render-healing watchdog may requeue after its error and cooldown checks.";
  } else if (publish === "Failed" && truthy(record, "Auto_Publish_Enabled")) {
    recovery = "healer_eligible";
    action = "Existing publish-status healer may retry within its attempt and duplicate-post guards.";
  } else if (output === "Failed") {
    action = "Output_Status is Failed; inspect render/publish stage and use the matching repair path.";
  } else if (error) {
    recovery = "diagnostic";
    action = "Inspect the remaining error and current stage; do not reset a progressing output.";
  }
  if (!publishedEvidence && /AP1C slide-set mismatch/i.test(error)) {
    recovery = "needs_attention";
    action = "Reconcile the actual carousel slides with the configured expected count, repair the slide set, and retry AP1C; never publish an incomplete carousel.";
  } else if (!publishedEvidence && /only photo or video can be accepted as media type/i.test(error)) {
    recovery = "needs_attention";
    action = "Replace the unsupported carousel slide media with a valid photo or video, then retry child creation; do not blindly retry HTTP 400.";
  } else if (!publishedEvidence && /parent container terminal state|AP3P.*poll timeout/i.test(error)) {
    recovery = "healer_eligible";
    action = "Allow the existing AP3C parent-container recreation path to run within its retry guards; verify the replacement parent before publication.";
  } else if (!publishedEvidence && /facebook rate limit|1390008|\\b368\\b/i.test(error)) {
    recovery = "cooldown";
    action = "After cooldown, reserve a later MAE Facebook slot. Keep publication held until read-only Meta duplicate-exclusion and safe rearm; never repost blindly.";
  }
  // An operator-approved future date does not by itself release a Meta hold.
  // Distinguish a reserved but still held Reel from a newly failed attempt.
  const heldRescheduled = !publishedEvidence
    && text(record,"Platform")==="Facebook"
    && /Facebook Reel/i.test(text(record,"Platform_Output_Type")||text(record,"Studio_Output_Type"))
    && text(record,"Publish_Error_Stage")==="FBS3_RATE_LIMIT"
    && truthy(record,"Do_Not_Publish")
    && /QA-1050 HARD NO-GRAPH-CREATE HOLD/.test(text(record,"Studio_Output_Notes"))
    && /SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION/.test(text(record,"Studio_Output_Notes"))
    && output==="Approved for Publishing" && publish==="Failed"
    && Number.isFinite(Date.parse(text(record,"Scheduled_Post_Date")));
  if(heldRescheduled) {
    signature="QA-FB-368-RESCHEDULED-HELD";
    recovery="verification_pending";
    reason="Meta anti-spam failure has a reserved future slot ("+text(record,"Scheduled_Post_Date")+"), but publishing is still held.";
    action="Verify the original Meta dispatch before that slot and separately authorize safe rearm after excluding a duplicate. Preserve the hold, attempts and error evidence until then.";
  }
  if (["FACEBOOK_STORY_RATE_LIMIT_368", "FACEBOOK_STORY_REMOTE_VERIFICATION_PENDING"].includes(text(record, "Publish_Error_Stage"))
      && text(record, "Platform") === "Facebook" && text(record, "Platform_Output_Type") === "Facebook Story"
      && !publishedEvidence) {
    signature = "QA-FB-STORY-368-RETRY-PENDING";
    const remotePending = text(record, "Publish_Error_Stage") === "FACEBOOK_STORY_REMOTE_VERIFICATION_PENDING";
    const blocked = remotePending ? "remote_verification_pending" : facebookStoryRateLimitRearmReason(record, { nowMs });
    recovery = blocked === null ? "healer_eligible" : blocked === "cooldown" ? "cooldown"
      : ["retry_limit", "remote_verification_pending"].includes(blocked) ? "verification_pending" : "needs_attention";
    reason = text(record, "Studio_Publish_Dispatch_Note") || "Facebook Graph 368 stopped the Story; approval and scheduled time are retained.";
    action = blocked === "cooldown" ? "Wait for Facebook's saved retry time; Quality Agent may rearm only after all publication-evidence and attempt guards pass."
      : blocked === null ? "Quality Agent can rearm the approved Story and let the existing publisher send only at its original scheduled time."
      : ["retry_limit", "remote_verification_pending"].includes(blocked)
        ? "Quality Agent checks Meta Page Story evidence read-only. Do not repost or reset counters without trustworthy remote verification."
        : "Do not repost blindly. Repair gate: " + blocked + "; verify Facebook and retry eligibility first.";
  }
  // FB0 source verification also diagnoses held outputs with no Publish_Error_Message
  // (e.g. output 7040/7060). No user/manual action is needed for exact 2N
  // duplicates: native FB0 will verify source IDs and repair ordered links.
  if (!publishedEvidence && text(record, "Platform").toLowerCase() === "facebook"
      && text(record, "Publish_Error_Stage") === "FB0_ASSETS"
      && text(record, "FB_Publish_Status") === "Manual Fallback Required"
      && expected > 0 && linked === expected * 2) {
    signature = "QA-FB0-DOUBLE-SLIDE-SETS";
    recovery = "healer_eligible";
    reason = "FB0 doubled the approved 4:5 slide set: " + linked + " linked rows for "
      + expected + " selected source images; manual fallback was incorrectly assigned.";
    action = "Quality Agent: verify each of the 2N rows against the immutable ordered "
      + "Render_Clip_List_JSON (same Drive source per pair, one output link, "
      + "exact stamped public URL). FB0 can repair duplicates automatically: "
      + "rebind each canonical public URL, unlink only redundant slide records, "
      + "clear manual fallback and resume the native Facebook photo stages. "
      + "If any source mapping differs, retain the hold and escalate Needs Eyes.";
  }
  // Source-of-truth media and Graph state take precedence over generic failed
  // badges. Never reset Instagram children/parents from an Airtable counter.
  if (!publishedEvidence && isIgCarousel) {
    const doubled = expected > 0 && linked === expected * 2;
    if (/AP1C slide-set mismatch|QA-IG-AP1C-DUPLICATE-SLIDE-SETS/i.test(igError) && (
        doubled || /final view (\d+), public-ready (\\d+), expected (\\d+)/i.test(igError)
      )) {
      signature = "QA-IG-AP1C-DUPLICATE-SLIDE-SETS";
      recovery = "needs_attention";
      reason = igError;
      action = "Quarantine AP1C. Compare every linked slide against the immutable ordered selected-asset manifest; detach only provably noncanonical links (never delete source media). If mapping is ambiguous, escalate Needs Eyes. Once exactly N distinct approved public URLs remain, resume AP1C under a fenced revision lease.";
    } else if (/AP3C parent creation failed.*HTTP 5\d\d|QA-IG-AP3C-AMBIGUOUS-PARENT/i.test(igError)) {
      signature = "QA-IG-AP3C-AMBIGUOUS-PARENT";
      recovery = "needs_attention";
      reason = igError;
      action = "Suspend parent creation; inspect Graph trace and reconcile any remotely created parent. Reuse verified existing parent, or allow one fenced retry only after its absence is established. Never publish before scheduled time.";
    } else if (igStatus === "Children Processing" && /2207020|Expired Media/i.test(igParentResponse)) {
      signature = "QA-IG-EXPIRED-CHILD-STATE-DRIFT";
      recovery = "needs_attention";
      reason = "Meta response reported expired media while Airtable retains earlier FINISHED child statuses and a stale ready count.";
      action = "Poll every saved child container ID against Meta. Reconcile ready count only if all remain valid; otherwise recreate only the expired child media from the approved public images and verify all children before parent creation.";
    } else if (igAttempts >= 5 && igError) {
      signature = "QA-IG-RETRY-STORM";
      recovery = "exhausted";
      reason = igError;
      action = "Quarantine this carousel stage after bounded retries and escalate its exact failure signature; do not repeatedly create Meta containers.";
    }
  }
  return {
    signature,
    record_id: record.id, output_id: outputId || null,
    title: text(record, "Output_Title") || text(record, "Title_Text") || text(record, "Studio_Effective_Requested_Title") || null,
    platform: text(record, "Platform") || null, output_type: text(record, "Studio_Output_Type") || text(record, "Platform_Output_Type") || null,
    profile_id: firstLinkedId(record?.fields?.Content_Profile) || null,
    output_status: output || null, render_status: render || null, publish_status: publish || null,
    error: reason, action, recovery, retry_at: retryAt || null, attempt_count: attempts,
    can_return_to_approved: facebookRateLimitResetReason(record, { nowMs }) === null,
    can_reschedule_spam_held: facebookSpamHeldRescheduleReason(record) === null,
    return_to_approved_blocked: facebookRateLimitResetReason(record, { nowMs }),
    spam_held_reschedule_blocked: facebookSpamHeldRescheduleReason(record),
  };
}
