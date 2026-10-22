/**
 * Autonomous verification recovery census. Pure classification and aggregation;
 * never grants permission to create a new Meta post or reset attempt counters.
 * A recovered Story is counted only with a published post ID and the persisted
 * QA rearm audit marker, not because a retry was queued or a counter changed.
 */
import { facebookStoryRateLimitRearmReason } from "./failed-output-monitor.mjs";

export const VERIFICATION_REARM_MARKER =
  "QA-FB-STORY-368-RETRY-PENDING: cooldown elapsed; rearmed original schedule";
export const VERIFICATION_REMOTE_MARKER = "QA-FB-STORY-REMOTE-PUBLISHED";
export const VERIFICATION_RECOVERED_DAYS = 7;
export const VERIFICATION_RECOVERED_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Platform_Output_Type}="Facebook Story",{Published_At}!=BLANK(),{Platform_Post_ID}!=BLANK(),IS_AFTER({Published_At},DATEADD(NOW(),-7,"days")),OR(FIND("QA-FB-STORY-368-RETRY-PENDING: cooldown elapsed; rearmed original schedule",{Studio_Publish_Dispatch_Note}&"")>0,FIND("QA-FB-STORY-REMOTE-PUBLISHED",{Studio_Publish_Dispatch_Note}&"")>0))';

const field = (row, key) => row?.fields?.[key] ?? row?.[key];
const value = (row, key) => String(field(row, key) ?? "").trim();
const truthy = (row, key) => field(row, key) === true || field(row, key) === 1;
const HUMAN_CHALLENGE = /(?:security\s+checkpoint|security\s+challenge|two[ -]?factor\s+(?:authentication|verification)|\b2fa\b|verify your identity|identity verification required|enter (?:the |your )?(?:verification|security|confirmation) code|interactive (?:login|reauthorization) required)/i;

export function verificationRecoveryStatus(row, nowMs = Date.now()) {
  const error = [
    value(row, "Publish_Error_Message"), value(row, "Publish_Error_Stage"),
    value(row, "Studio_Publish_Dispatch_Note"),
  ].join(" ");
  if (truthy(row, "Manual_Fallback_Required") && HUMAN_CHALLENGE.test(error)) {
    return { status: "human_action_required", reason: "confirmed_interactive_account_challenge",
      action: "Complete the platform's account-security or reauthorization challenge, then let the Quality Agent recheck." };
  }
  if (value(row, "Platform") === "Facebook" &&
      value(row, "Platform_Output_Type") === "Facebook Story" &&
      value(row, "Publish_Error_Stage") === "FACEBOOK_STORY_RATE_LIMIT_368") {
    const block = facebookStoryRateLimitRearmReason(row, { nowMs });
    if (block === "cooldown") {
      return { status: "awaiting_cooldown", reason: block, action: "Recheck automatically after the saved retry time." };
    }
    if (block === "retry_limit" || block === "publication_evidence") {
      return { status: "investigating", reason: block,
        action: "Reconcile authoritative Facebook publication evidence; do not create another Story or reset attempt counters." };
    }
    return { status: "investigating", reason: block || "guarded_rearm_eligible",
      action: "Apply the existing safe rearm guards at the normal Worker cadence; do not post immediately." };
  }
  const retryAt = Date.parse(value(row, "Publish_Next_Retry_At"));
  if (Number.isFinite(retryAt) && retryAt > nowMs) {
    return { status: "awaiting_cooldown", reason: "cooldown", action: "Recheck at the recorded retry time." };
  }
  return { status: "investigating", reason: "diagnostic_required",
    action: "Use the existing Quality Agent signature-specific diagnosis; never retry an ambiguous platform create." };
}

function uniqueRows(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const id = value(row, "Output_ID") || row?.id;
    if (!id || seen.has(String(id))) return false;
    seen.add(String(id));
    return true;
  });
}

export function buildVerificationRecoveryReport({ outstanding = [], publishedRecoveryEvidence = [], nowMs = Date.now() } = {}) {
  const statuses = { recovered_automatically: 0, awaiting_cooldown: 0,
    investigating: 0, human_action_required: 0 };
  const items = uniqueRows(outstanding).map((row) => {
    const classification = verificationRecoveryStatus(row, nowMs);
    statuses[classification.status] += 1;
    return { record_id: row?.id || null, output_id: value(row, "Output_ID") || null,
      platform: value(row, "Platform") || null, ...classification };
  });
  const recovered = uniqueRows(publishedRecoveryEvidence).filter((row) =>
    value(row, "Platform") === "Facebook" &&
    value(row, "Platform_Output_Type") === "Facebook Story" &&
    Boolean(value(row, "Published_At") && value(row, "Platform_Post_ID")) &&
    (value(row, "Studio_Publish_Dispatch_Note").includes(VERIFICATION_REARM_MARKER) || value(row, "Studio_Publish_Dispatch_Note").includes(VERIFICATION_REMOTE_MARKER)) &&
    nowMs - Date.parse(value(row, "Published_At")) <= VERIFICATION_RECOVERED_DAYS * 86400000 &&
    Date.parse(value(row, "Published_At")) <= nowMs
  );
  statuses.recovered_automatically = recovered.length;
  return { status: "ok", as_of: new Date(nowMs).toISOString(),
    recovered_window_days: VERIFICATION_RECOVERED_DAYS,
    recovered_definition: "Verified published Facebook Stories retaining the QA rearm audit marker and a platform post ID; excludes merely rearmed posts.",
    counts: statuses, outstanding_count: items.length, items };
}

/**
 * Positive-only verification from Meta's Page /stories edge. A missing row,
 * expired Story, incomplete cursor or archived status is NEVER no-create proof.
 * Multiple matches fail closed rather than arbitrarily selecting a post.
 */
export function verifiedFacebookStoryMatch(stories, mediaId) {
  const needle = String(mediaId || "").trim();
  if (!/^[0-9]+$/.test(needle)) return null;
  const matches = (Array.isArray(stories) ? stories : []).filter((story) =>
    String(story?.media_id || "").trim() === needle &&
    String(story?.status || "").toUpperCase() === "PUBLISHED" &&
    /^[0-9_]+$/.test(String(story?.post_id || "").trim()));
  if (matches.length !== 1) return null;
  const story = matches[0];
  return { post_id: String(story.post_id), media_id: needle,
    published_at: Number.isFinite(Date.parse(String(story.creation_time || "")))
      ? new Date(story.creation_time).toISOString() : null,
    url: /^https:\/\/(?:www\.)?facebook\.com\//i.test(String(story.url || ""))
      ? String(story.url) : "https://www.facebook.com/stories/" + story.post_id };
}
