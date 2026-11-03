/**
 * QA-IG-STALE-UPLOAD: bounded half-hour scanner for abandoned AP1-IG Reel locks.
 * This stage makes NO publishing calls and never clears a lock or moves a schedule.
 * A stale Airtable timestamp does not prove a Graph create failed, nor does a
 * missing saved ID establish absence of an Instagram post.
 */
export const QA_IG_STALE_UPLOAD_SIGNATURE = "QA-IG-STALE-UPLOAD";
export const QA_IG_STALE_UPLOAD_THRESHOLD_MS = 30 * 60 * 1000;
export const QA_IG_STALE_UPLOAD_LEDGER = "Quality Agent Recovery Ledger";
const str = (row, key) => String(row?.fields?.[key] ?? "").trim();
const at = (value) => {
  const millis = Date.parse(String(value ?? ""));
  return Number.isFinite(millis) ? millis : NaN;
};
const quoted = (value) => String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');

export function classifyStaleInstagramReel(row, {
  nowMs = Date.now(), thresholdMs = QA_IG_STALE_UPLOAD_THRESHOLD_MS,
} = {}) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(row?.id ?? ""))
    || str(row, "Platform") !== "Instagram"
    || str(row, "Platform_Output_Type") !== "Instagram Reel"
    || str(row, "Publish_Status") !== "Publishing"
    || str(row, "Publish_Locked_By") !== "AP1-IG"
    || str(row, "Review_Status") !== "Approved"
    || str(row, "Output_Status") !== "Approved for Publishing"
    || row.fields?.Auto_Publish_Enabled !== true
    || str(row, "Publish_Method") !== "Automated"
    || row.fields?.Do_Not_Publish === true
    || str(row, "Test_Run_ID")
    || str(row, "Replace_Transaction_ID")
    || str(row, "Published_At")
    || str(row, "Studio_Render_Review_Session_ID")
    || str(row, "Studio_Render_Review_Hold_ID")
    || str(row, "Studio_Render_Review_Hold_Owner")
    || str(row, "Studio_Review_Hold_ID")
    || str(row, "Studio_Review_Hold_Owner")
    || row.fields?.Studio_Render_Review_Hold_Active === true)
    return null;
  const lockMs = at(row.fields?.Publish_Locked_At);
  const attemptMs = at(row.fields?.Last_Publish_Attempt_At);
  if (!Number.isFinite(lockMs) || !Number.isFinite(attemptMs)
    || nowMs - Math.max(lockMs, attemptMs) < Math.max(thresholdMs, 60000))
    return null;
  const retryMs = at(row.fields?.Publish_Next_Retry_At);
  if (Number.isFinite(retryMs) && retryMs > nowMs) return null;
  const postId = str(row, "Platform_Post_ID");
  const containerId = str(row, "Platform_Media_ID");
  return {
    signature: QA_IG_STALE_UPLOAD_SIGNATURE,
    record_id: row.id, output_id: Number(row.fields?.Output_ID || 0),
    profile_id: Array.isArray(row.fields?.Content_Profile) && row.fields.Content_Profile.length === 1
      ? row.fields.Content_Profile[0] : null,
    age_seconds: Math.floor((nowMs - Math.max(lockMs, attemptMs)) / 1000),
    lock_at: row.fields.Publish_Locked_At,
    last_attempt_at: row.fields.Last_Publish_Attempt_At,
    post_id_saved: Boolean(postId),
    container_id_saved: Boolean(containerId),
    action: postId ? "verify_existing_post" : containerId
      ? "poll_saved_container_and_verify_post" : "indeterminate_create_receipt",
    runner_lease_verified: false,
    auto_repair_authorized: false,
    creates: 0,
  };
}

export function staleInstagramReelFormula(nowMs = Date.now(), thresholdMs = QA_IG_STALE_UPLOAD_THRESHOLD_MS) {
  // Formula-side limit avoids repeated large-table full scans on maintenance cron.
  const cutoff = new Date(nowMs - Math.max(thresholdMs, 60000)).toISOString();
  return 'AND({Platform}="Instagram",{Platform_Output_Type}="Instagram Reel",'
    + '{Publish_Status}="Publishing",{Publish_Locked_By}="AP1-IG",'
    + '{Publish_Locked_At}!=BLANK(),'
    + 'IS_BEFORE({Publish_Locked_At},"' + cutoff + '"))';
}

export async function auditStaleInstagramReels(env, {
  airtableFetch, verifyProvider, nowMs = Date.now(), limit = 12,
} = {}) {
  if (typeof airtableFetch !== "function") throw new Error("QA stale Reel Airtable dependency missing");
  const bounded = Math.min(30, Math.max(1, Number(limit) || 12));
  const formula = staleInstagramReelFormula(nowMs);
  const params = "?filterByFormula=" + encodeURIComponent(formula)
    + "&pageSize=" + bounded + "&maxRecords=" + bounded;
  const found = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs", params);
  if (!Array.isArray(found?.records))
    throw new Error("QA stale Reel Airtable scan incomplete; no success assumed");
  const bucket = new Date(Math.floor(nowMs / 1800000) * 1800000).toISOString();
  const results = [];
  for (const observed of found.records) {
    const decision = classifyStaleInstagramReel(observed, { nowMs });
    if (!decision) continue;
    // The first list response is a *candidate*, not mutation authorization.
    const current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs", observed.id);
    const recheck = classifyStaleInstagramReel(current, { nowMs });
    if (!recheck || current?.id !== observed.id
      || recheck.lock_at !== decision.lock_at
      || recheck.last_attempt_at !== decision.last_attempt_at
      || recheck.action !== decision.action) continue;
    let provider = { verified_public: false, ownership_verified: false,
      evidence: "provider_read_not_applicable_without_saved_post_id" };
    if (recheck.post_id_saved) {
      try {
        provider = typeof verifyProvider === "function"
          ? await verifyProvider(current)
          : { verified_public: false, ownership_verified: false,
              evidence: "provider_verifier_not_connected" };
      } catch {
        provider = { verified_public: false, ownership_verified: false,
          evidence: "provider_read_failed" };
      }
    }
    const confirmed = provider?.verified_public === true
      && provider?.ownership_verified === true
      && String(provider?.remote_id || "") === str(current, "Platform_Post_ID");
    const outcome = confirmed ? "published_identity_verified_pending_reconciliation"
      : "stale_lock_needs_eyes";
    const evidence = {
      ...recheck, outcome,
      provider_evidence: String(provider?.evidence || "unverified").slice(0, 160),
      provider_public_verified: confirmed,
      provider_ownership_verified: confirmed,
      observed_at: new Date(nowMs).toISOString(),
      next_action: confirmed ? "use_existing_publication_receipt_reconciler"
        : "verify_runner_lease_and_remote_identity_before_fenced_MAE_reschedule",
      release_lock: false, schedule_changed: false, graph_create_authorized: false,
    };
    const eventKey = "QA-IG-STALE-UPLOAD:" + observed.id + ":" + bucket;
    // One idempotent upsert per output and half-hour; this is an audit FINDING,
    // never a fabricated recovery/success event.
    const payload = { performUpsert: { fieldsToMergeOn: ["Event_Key"] }, typecast: true,
      records: [{ fields: {
        Event_Key: eventKey, Output_Record_ID: observed.id, Output_ID: decision.output_id,
        Platform: "Instagram", Output_Type: "Instagram Reel",
        Outcome: outcome, Evidence_Source: confirmed
          ? "authenticated_account_scoped_graph_exact_post_id" : "airtable_stale_publish_lock",
        Verified_At: new Date(nowMs).toISOString(), Actor: "studio-quality-agent",
        Details_JSON: JSON.stringify(evidence),
      } }] };
    const saved = await airtableFetch(env, QA_IG_STALE_UPLOAD_LEDGER, "", {
      method: "PATCH", body: JSON.stringify(payload),
    });
    if (!Array.isArray(saved?.records) || saved.records.length !== 1)
      throw new Error("QA stale Reel evidence write incomplete");
    const persistedId = saved.records[0]?.id;
    if (!/^rec[A-Za-z0-9]{14}$/.test(String(persistedId || "")))
      throw new Error("QA stale Reel ledger record ID unverified");
    const persisted = await airtableFetch(env, QA_IG_STALE_UPLOAD_LEDGER, persistedId);
    if (persisted?.id !== persistedId
      || persisted.fields?.Event_Key !== eventKey
      || persisted.fields?.Outcome !== outcome
      || Number(persisted.fields?.Output_ID) !== decision.output_id)
      throw new Error("QA stale Reel ledger readback mismatch");
    results.push(evidence);
  }
  return results;
}
