import { recoveredOutcomesFromLedger } from "./qa-recovery-ledger.mjs";
/**
 * QA-AUTOVERIFY-1050: pure, fail-closed verification assessment and census.
 *
 * Meta Story Graph 368 is a rate-limit response, NOT proof that all attempts
 * failed to create a remote Story. In particular an empty Platform_Post_ID is
 * never reliable negative publication evidence. The normal publish guard in
 * failed-output-monitor.mjs remains authoritative for actual rearming.
 */
export const AUTOVERIFY_RECOVERED_MARKER = "QA-AUTOVERIFY-RECOVERED:";
export const AUTOVERIFY_RECOVERED_FORMULA =
  'AND({Test_Run_ID}=BLANK(),FIND("QA-AUTOVERIFY-RECOVERED:",{Studio_Publish_Dispatch_Note}&"")>0)';

const field = (row, name) => row?.fields?.[name] ?? row?.[name] ?? null;
const string = (row, name) => String(field(row, name) ?? "").trim();
const number = (row, name) => Number(field(row, name) || 0) || 0;

export function recoveredAtFromNote(note) {
  const matches = [...String(note || "").matchAll(/QA-AUTOVERIFY-RECOVERED:(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)/g)];
  const stamps = matches.map((match) => Date.parse(match[1])).filter(Number.isFinite);
  return stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
}

/** Only explicit provider/security evidence creates a human-required verdict. */
export function assessAutonomousVerification(record, { nowMs = Date.now() } = {}) {
  const platform = string(record, "Platform");
  const stage = string(record, "Publish_Error_Stage");
  const error = [string(record, "Publish_Error_Message"), string(record, "Studio_Publish_Dispatch_Note")].join(" ");
  const outputId = string(record, "Output_ID") || null;
  const profile = field(record, "Content_Profile");
  const profileId = Array.isArray(profile) ? String(profile[0] || "") : null;
  const base = { record_id: record?.id || null, output_id: outputId,
    profile_id: profileId, platform, output_type: string(record, "Platform_Output_Type"),
    next_check_at: null, action_required: null };
  if (platform !== "Facebook") return null;
  const securityChallenge = /META_SECURITY_CHALLENGE|FACEBOOK_CHECKPOINT_REQUIRED|\bcheckpoint required\b|two.factor authentication required/i.test(stage + " " + error);
  if (securityChallenge) return { ...base, outcome: "human_action_required",
    action_required: "Complete the verified Meta account security checkpoint; then allow Quality Agent to recheck.",
    reason: "Meta security checkpoint requires the page administrator" };
  const rateLimited = stage === "FACEBOOK_STORY_RATE_LIMIT_368" || stage === "FACEBOOK_STORY_REMOTE_VERIFICATION_PENDING"
    || ["FBS3_RATE_LIMIT", "FB_GRAPH_RATE_LIMIT"].includes(stage)
    || /(?:we limit how often you can post|protect the community from spam)/i.test(error);
  if (!rateLimited) return null;
  const published = [
    "Published_At", "Platform_Post_ID", "Platform_Post_URL", "Manual_Published_URL", "Facebook_Post_ID",
    "FB_Post_ID", "FB_Video_ID",
  ].some((key) => Boolean(string(record, key)))
    || ["Published", "Posted"].includes(string(record, "FB_Publish_Status"));
  if (published) return { ...base, outcome: "publication_evidence",
    reason: "Recorded publication evidence: reconcile status, never send a duplicate" };
  if (field(record, "Do_Not_Publish") === true || string(record, "Test_Run_ID"))
    return { ...base, outcome: "safety_blocked", reason: "Publication explicitly held" };
  const retryAt = Date.parse(string(record, "Publish_Next_Retry_At"));
  const attempts = Math.max(number(record, "Publish_Attempt_Count"), number(record, "Studio_Publish_Dispatch_Count"));
  if (stage === "FACEBOOK_STORY_REMOTE_VERIFICATION_PENDING") return { ...base,
    outcome: "pending_verification", safety_blocked: true,
    next_check_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
    reason: string(record, "Platform_Media_ID")
      ? "Meta Page Story exact upload identity is checked read-only; no repeat Graph create."
      : "Legacy Story dispatch lacks saved upload identity; retry remains fenced." };
  // Retry exhaustion takes precedence over cooldown. A countdown may be
  // shown for context but must never imply that these Stories will repost.
  if (attempts >= 3) return { ...base, outcome: "pending_verification",
    safety_blocked: true, cooldown_until: Number.isFinite(retryAt) ? new Date(retryAt).toISOString() : null,
    next_check_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
    reason: "Retry cap reached; exact remote proof is required. Cooldown expiry does not authorize another Graph create." };
  const expired = Number.isFinite(retryAt) && retryAt <= nowMs;
  if (!expired) return { ...base, outcome: "cooldown_waiting",
    next_check_at: Number.isFinite(retryAt) ? new Date(retryAt).toISOString() : null,
    reason: Number.isFinite(retryAt) ? "Graph cooldown has not elapsed" : "No reliable retry window; verification remains pending" };
  return { ...base, outcome: "guarded_rearm",
    reason: "Cooldown elapsed; existing approval, asset, locks and original schedule must pass the PR #1045 gate" };
}

/**
 * Current blockers come from live Platform Outputs; confirmed recoveries come
 * exclusively from durable, append-only Airtable Quality Agent Recovery Ledger
 * events. Dispatch-note markers are no longer counted: they are overwritable.
 */
export function summarizeAutonomousVerification(rows = [], ledgerRows = [], {
  nowMs = Date.now(), periodDays = 7, ledgerScanStatus = "ok",
} = {}) {
  const byId = new Map();
  for (const row of rows) {
    if (!row?.id || byId.has(row.id)) continue;
    const decision = assessAutonomousVerification(row, { nowMs });
    if (decision) byId.set(row.id, decision);
  }
  const counted = { recovered_automatically: 0, human_action_required: 0,
    pending_verification: 0, cooldown_waiting: 0, safety_blocked: 0 };
  const perProfile = {};
  const increment = (name, profile) => {
    counted[name] += 1;
    const key = profile || "unknown";
    if (!perProfile[key]) perProfile[key] = Object.fromEntries(Object.keys(counted).map((field) => [field, 0]));
    perProfile[key][name] += 1;
  };
  for (const decision of byId.values()) {
    if (decision.outcome === "human_action_required") increment("human_action_required", decision.profile_id);
    else if (decision.outcome === "pending_verification") increment("pending_verification", decision.profile_id);
    else if (decision.outcome === "cooldown_waiting") increment("cooldown_waiting", decision.profile_id);
    else if (decision.outcome === "safety_blocked") increment("safety_blocked", decision.profile_id);
    if (decision.safety_blocked) increment("safety_blocked", decision.profile_id);
  }
  const confirmed = ledgerScanStatus === "ok"
    ? recoveredOutcomesFromLedger(ledgerRows, { nowMs, periodDays })
    : [];
  for (const event of confirmed) {
    // An open blocker and a successful recovery cannot both count as resolved.
    if (!byId.has(event.record_id)) increment("recovered_automatically", event.profile_id);
  }
  return {
    status: ledgerScanStatus === "ok" ? "ok" : "partial",
    scanned_at: new Date(nowMs).toISOString(),
    period_start: new Date(nowMs - periodDays * 86400000).toISOString(),
    period_days: periodDays,
    metrics_source: "airtable_quality_agent_recovery_ledger",
    coverage: ledgerScanStatus === "ok"
      ? "Durable confirmed publication reconciliations only; unique outputs, not scans, attempts or overwritten notes."
      : "Recovery ledger unavailable; recovered count is UNKNOWN, not zero.",
    counts: { ...counted, ...(ledgerScanStatus !== "ok" ? { recovered_automatically: null } : {}) },
    per_profile: perProfile,
    recovered_items: confirmed.filter((item) => !byId.has(item.record_id)),
    items: [...byId.values()],
  };
}
