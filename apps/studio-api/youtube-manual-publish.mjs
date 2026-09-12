/** Detect / park YouTube publish rows that need manual action instead of Failed. */

export const YOUTUBE_QUOTA_OR_WRAPPED_403_RE =
  /quotaExceeded|dailyLimitExceeded|uploadLimitExceeded|rateLimitExceeded|userRateLimitExceeded|youtube\.quota|quota.?exceeded|exceeded your.{0,80}?quota|queries per day|videos\.(?:list|insert|update|delete)\s+failed\s+403|\bfailed 403\b/i;

export const YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Do_Not_Publish}=0,{Publish_Status}!="Manual Publish Required",{Publish_Status}!="Published",OR(FIND("YTS2_POLL",UPPER({Publish_Error_Stage}&""))>0,FIND("YTS1",UPPER({Publish_Error_Stage}&""))>0,FIND("YTP1",UPPER({Publish_Error_Stage}&""))>0),OR(FIND("quota",LOWER({YouTube_Error_Message}&""))>0,FIND("failed 403",LOWER({YouTube_Error_Message}&""))>0,FIND("quota",LOWER({Publish_Error_Message}&""))>0))';

function fieldText(fields, name) {
  return String(fields?.[name] || "").trim();
}

export function youtubeErrorBlob(fields = {}) {
  return [
    fieldText(fields, "Publish_Error_Stage"),
    fieldText(fields, "Publish_Error_Message"),
    fieldText(fields, "YouTube_Error_Message"),
  ].join("\n");
}

export function youtubeLooksLikeQuotaOrWrapped403(fields = {}) {
  return YOUTUBE_QUOTA_OR_WRAPPED_403_RE.test(youtubeErrorBlob(fields));
}

/** True when Studio should show Manual Action Required, not Failed. */
export function youtubeManualActionRequired(fields = {}) {
  const publish = fieldText(fields, "Publish_Status").toLowerCase();
  if (publish.includes("manual publish required")) return true;
  if (fields.Manual_Fallback_Required === true || fields.Manual_Fallback_Required === 1) return true;
  if (fieldText(fields, "Manual_Completion_Status").toLowerCase() === "required") return true;
  // Undeployed Windows YTS2 still writes YTS2_POLL + quota/403 while leaving
  // Publish_Status=Publishing. Treat that as manual action, not a red Failed.
  if (fieldText(fields, "Platform").toLowerCase() === "youtube" && youtubeLooksLikeQuotaOrWrapped403(fields)) {
    return true;
  }
  return false;
}

/**
 * Next America/Los_Angeles midnight as UTC ISO-8601.
 * Matches services/pipeline-runner/yt/common.py::next_pacific_midnight_iso.
 */
export function nextPacificMidnightIso(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partsOf = (date) => {
    const parts = fmt.formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get("year"), month: get("month"), day: get("day") };
  };
  const today = partsOf(now);
  // Walk forward hour-by-hour until the LA calendar day flips, then snap to that UTC instant's midnight.
  let cursor = new Date(now.getTime());
  let guard = 0;
  while (guard < 48) {
    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    const next = partsOf(cursor);
    if (next.year !== today.year || next.month !== today.month || next.day !== today.day) {
      // cursor is somewhere on the next LA calendar day. Binary-search back to LA 00:00.
      let lo = cursor.getTime() - 60 * 60 * 1000;
      let hi = cursor.getTime();
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        const midParts = partsOf(new Date(mid));
        if (midParts.year === next.year && midParts.month === next.month && midParts.day === next.day) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return new Date(hi).toISOString().replace(/\.\d{3}Z$/, ".000Z");
    }
    guard += 1;
  }
  // Fallback: assume PDT (UTC-7).
  const rough = Date.UTC(today.year, today.month - 1, today.day + 1, 7, 0, 0);
  return new Date(rough).toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function manualPublishRequiredFields({
  errorStage = "YTS2_QUOTA",
  publishMessage = "YouTube API quota exhausted. Manual publish required until the next automatic retry after Pacific midnight.",
  youtubeMessage = "",
  youtubeStage = "YT2",
  uploadStatus = "Uploaded",
  nextRetryAt = nextPacificMidnightIso(),
} = {}) {
  return {
    YouTube_Stage: youtubeStage,
    Publish_Status: "Manual Publish Required",
    Publish_Locked_At: null,
    Publish_Locked_By: "",
    Publish_Error_Stage: errorStage,
    Publish_Error_Message: publishMessage,
    Publish_Next_Retry_At: nextRetryAt,
    YouTube_Error_Message: youtubeMessage || publishMessage,
    YouTube_Upload_Status: uploadStatus,
    Publish_Retry_Eligible: true,
    Manual_Fallback_Required: true,
    Manual_Completion_Status: "Required",
  };
}
