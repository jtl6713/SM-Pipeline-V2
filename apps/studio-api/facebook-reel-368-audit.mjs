import { verifyFacebookReelByVideoId } from "./facebook-reel-remote-verification.mjs";
/**
 * QA-1050: bounded, fail-closed, read-only verification inventory for Meta 368 Reels.
 * This does not query an incomplete Graph listing as negative publication proof.
 * Only the existing provider-ID verifier can positively establish publication.
 */
export const REEL_368_OUTPUTS = Object.freeze([2457, 2762, 4018]);
export const REEL_368_LEDGER = "Quality Agent Recovery Ledger";
export function reel368Decision(row, nowMs = Date.now()) {
  const f = row?.fields || {};
  const outputId = Number(f.Output_ID || 0);
  if (!REEL_368_OUTPUTS.includes(outputId) || f.Platform !== "Facebook"
      || f.Platform_Output_Type !== "Facebook Reel"
      || f.Publish_Error_Stage !== "FBS3_RATE_LIMIT") return null;
  const due = Date.parse(f.Publish_Next_Retry_At || "");
  const held = f.Do_Not_Publish === true && f.Publish_Retry_Eligible !== true;
  const evidence = f.Platform_Post_ID || f.Platform_Media_ID || f.FB_Slideshow_Meta_Video_ID || "";
  return {
    output_id: outputId, record_id: row.id,
    outcome: Number.isFinite(due) && due > nowMs ? "cooldown_waiting"
      : evidence ? "pending_exact_provider_verification" : "pending_verification",
    next_check_at: new Date(Math.max(nowMs + 30 * 60000, Number.isFinite(due) ? due : 0)).toISOString(),
    safety_blocked: true,
    hold_integrity: held ? "intact" : "missing_or_invalid",
    action_required: Number.isFinite(due) && due > nowMs ? null : evidence
      ? "Read-only Graph GET of the exact stored video ID; only an exact positive publication match permits reconciliation."
      : "Escalate no-identity Reel to an operator; provider absence cannot be proven and no fresh Graph create is authorized.",
    evidence_source: evidence ? "airtable_saved_remote_identity_unverified" : "airtable_dispatch_without_remote_identity",
    // Even positive proof requires reconciliation; no state here authorizes Graph creation.
    graph_create_authorized: false,
  };
}
const quote = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
export async function auditReel368Holds(env, { airtableFetch, nowMs = Date.now(), metaCredentialsForRow, metaFetch } = {}) {
  if (typeof airtableFetch !== "function") throw new Error("QA-1050 Airtable unavailable");
  const bucket = new Date(Math.floor(nowMs / 1800000) * 1800000).toISOString();
  const out = [];
  for (const outputId of REEL_368_OUTPUTS) {
    const list = await airtableFetch(env, "Platform Outputs", "?filterByFormula=" + encodeURIComponent("{Output_ID}=" + outputId) + "&maxRecords=2");
    const rows = list?.records || [];
    if (rows.length !== 1) { out.push({ output_id: outputId, outcome: "record_unavailable", graph_create_authorized: false }); continue; }
    let verdict = reel368Decision(rows[0], nowMs);
    if (!verdict) { out.push({ output_id: outputId, outcome: "no_longer_rate_limited", graph_create_authorized: false }); continue; }
    // Authorized exact-ID Meta GET is strictly read-only. Provider uncertainty leaves the hold untouched.
    if (verdict.outcome === "pending_exact_provider_verification" && typeof metaCredentialsForRow === "function") {
      let probe = { verdict: "unknown", reason: "meta_credentials_unavailable" };
      try {
        const credentials = await metaCredentialsForRow(rows[0]);
        const id = String(rows[0].fields.FB_Slideshow_Meta_Video_ID || rows[0].fields.Platform_Media_ID || rows[0].fields.Platform_Post_ID || "");
        probe = await verifyFacebookReelByVideoId({ videoId: id, token: credentials?.token,
          version: credentials?.version || "v25.0", ...(metaFetch ? {fetcher:metaFetch} : {}) });
      } catch { probe = { verdict: "unknown", reason: "meta_read_unavailable" }; }
      verdict = { ...verdict, provider_verdict: probe.verdict,
        provider_reason: probe.reason || null, verified_remote_id: probe.verdict === "remote_identity_confirmed" ? probe.video_id : null,
        outcome: probe.verdict === "remote_identity_confirmed" ? "remote_identity_confirmed_pending_reconciliation" : "pending_exact_provider_verification",
        evidence_source: probe.verdict === "remote_identity_confirmed" ? "meta_graph_exact_reel_video_id" : verdict.evidence_source };
    }
    // Audit only, never release a hold. One event key per output per half-hour;
    // reruns in the same bucket perform a lookup before append.
    const key = "QA-368-CHECK:" + rows[0].id + ":" + bucket;
    const found = await airtableFetch(env, REEL_368_LEDGER, "?filterByFormula=" + encodeURIComponent('{Event_Key}="' + quote(key) + '"') + "&maxRecords=1");
    if (!Array.isArray(found?.records)) throw new Error("QA-1050 ledger lookup incomplete");
    if (!found.records.length) {
      await airtableFetch(env, REEL_368_LEDGER, "", { method: "PATCH", body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ["Event_Key"] }, records: [{ fields: {
        Event_Key: key, Output_Record_ID: rows[0].id, Output_ID: outputId,
        Platform: "Facebook", Output_Type: "Facebook Reel",
        Outcome: verdict.outcome, Evidence_Source: verdict.evidence_source,
        Verified_At: new Date(nowMs).toISOString(), Actor: "studio-quality-agent",
        Details_JSON: JSON.stringify({ ...verdict, observed_at: new Date(nowMs).toISOString(),
          evidence_confidence: "unverified",
          no_meta_graph_create: true }),
      } }] }) });
    }
    out.push(verdict);
  }
  return out;
}
