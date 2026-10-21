/** Complete, read-only failed-output census used by Desk and Factory Quality Agent. */
export const FAILED_OUTPUT_FORMULA = 'AND({Test_Run_ID}=BLANK(),OR({Output_Status}="Failed",{Render_Status}="Failed",{Publish_Status}="Failed",AND({Publish_Error_Message}!="",{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published"),AND({IG_Carousel_Error_Message}!="",{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published"),AND({IG_Carousel_Status}="Children Processing",{IG_Carousel_Parent_Response_JSON}!="",{Published_At}=BLANK(),{Output_Status}!="Published",{Publish_Status}!="Published")))';

export async function scanOutstandingFailedOutputs(fetchPage, { pageSize = 100, filterFormula = FAILED_OUTPUT_FORMULA } = {}) {
  const records = [];
  const seenRecords = new Set();
  const visitedOffsets = new Set();
  let offset = null;
  do {
    const page = await fetchPage({ limit: Math.min(100, Math.max(1, pageSize)), offset, filterFormula });
    if (!page || !Array.isArray(page.records)) throw new Error("Failed-output scan returned an invalid page");
    for (const row of page.records) {
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
    action = "Honor the Facebook publishing cooldown and rate-limit rearm; never force immediate publication.";
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
    record_id: record.id, output_id: outputId || null, title: text(record, "Output_Title") || null,
    platform: text(record, "Platform") || null, output_type: text(record, "Studio_Output_Type") || text(record, "Platform_Output_Type") || null,
    profile_id: firstLinkedId(record?.fields?.Content_Profile) || null,
    output_status: output || null, render_status: render || null, publish_status: publish || null,
    error: reason, action, recovery, retry_at: retryAt || null, attempt_count: attempts,
    can_return_to_approved: facebookRateLimitResetReason(record, { nowMs }) === null,
    return_to_approved_blocked: facebookRateLimitResetReason(record, { nowMs }),
  };
}
