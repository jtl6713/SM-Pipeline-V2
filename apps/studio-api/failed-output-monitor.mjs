/** Complete, read-only failed-output census used by Desk and Factory Quality Agent. */
export const FAILED_OUTPUT_FORMULA = 'AND({Test_Run_ID}=BLANK(),OR({Output_Status}="Failed",{Render_Status}="Failed",{Publish_Status}="Failed",AND({Publish_Error_Message}!="",{Published_At}=BLANK()),AND({IG_Carousel_Error_Message}!="",{Published_At}=BLANK())))';

export async function scanOutstandingFailedOutputs(fetchPage, { pageSize = 100 } = {}) {
  const records = [];
  const seenRecords = new Set();
  const visitedOffsets = new Set();
  let offset = null;
  do {
    const page = await fetchPage({ limit: Math.min(100, Math.max(1, pageSize)), offset, filterFormula: FAILED_OUTPUT_FORMULA });
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
const firstLinkedId = (value) => Array.isArray(value) ? String(value[0] || "") : String(value || "");

export function describeFailedOutput(record, nowMs = Date.now()) {
  const outputId = text(record, "Output_ID");
  const output = text(record, "Output_Status");
  const render = text(record, "Render_Status");
  const publish = text(record, "Publish_Status");
  const error = text(record, "Publish_Error_Message") || text(record, "Remotion_Error_Message")
    || text(record, "Final_File_Error_Message") || text(record, "IG_Carousel_Error_Message")
    || text(record, "FB_Slideshow_Error_Message") || text(record, "YouTube_Error_Message");
  const publishedEvidence = Boolean(text(record, "Published_At") || text(record, "Platform_Post_ID") || text(record, "Platform_Post_URL"));
  const retryAt = text(record, "Publish_Next_Retry_At");
  const retryMs = Date.parse(retryAt);
  const attempts = Math.max(Number(text(record, "Publish_Attempt_Count")) || 0, Number(text(record, "Studio_Publish_Dispatch_Count")) || 0);
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
  return {
    record_id: record.id, output_id: outputId || null, title: text(record, "Output_Title") || null,
    platform: text(record, "Platform") || null, output_type: text(record, "Studio_Output_Type") || text(record, "Platform_Output_Type") || null,
    profile_id: firstLinkedId(record?.fields?.Content_Profile) || null,
    output_status: output || null, render_status: render || null, publish_status: publish || null,
    error: reason, action, recovery, retry_at: retryAt || null, attempt_count: attempts,
  };
}
