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


/** Authenticated, read-only GET of the exact saved Instagram container. */
export async function verifySavedInstagramContainer(row, {
  settings = {}, expectedAccountId, fetcher = fetch,
} = {}) {
  const id = str(row, "Platform_Media_ID");
  const account = String(expectedAccountId ?? "").trim();
  const token = String(settings.META_GRAPH_API_ACCESS_TOKEN || "").trim();
  const version = /^v\d{1,2}\.\d$/.test(String(settings.META_GRAPH_API_VERSION || ""))
    ? settings.META_GRAPH_API_VERSION : "v26.0";
  const deny = reason => ({ verified: false, reason, read_only: true });
  if (!/^\d{6,35}$/.test(id) || !/^\d{6,35}$/.test(account)
    || !token || str(row, "Platform") !== "Instagram")
    return deny("saved_container_or_scoped_credentials_missing");
  let response, data;
  try {
    const url = "https://graph.facebook.com/" + version + "/" + id + "?fields=id,status_code";
    response = await fetcher(url, { method: "GET", redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: {Authorization: "Bearer " + token, Accept: "application/json"} });
    if (response?.ok !== true || (response.status >= 300 && response.status < 400))
      return deny("authenticated_container_get_rejected");
    data = await response.json();
  } catch { return deny("authenticated_container_get_unavailable"); }
  const status = String(data?.status_code || "").toUpperCase();
  if (String(data?.id || "") !== id
    || !["IN_PROGRESS", "FINISHED", "ERROR", "EXPIRED", "PUBLISHED"].includes(status))
    return deny("container_identity_or_status_unverified");
  return {verified: true, container_id: id, status,
    evidence: "authenticated_graph_get_exact_saved_container", read_only: true,
    public_post_verified: false, new_containers: 0};
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
  airtableFetch, verifyProvider, verifyContainer, nowMs = Date.now(), limit = 12,
} = {}) {
  if (typeof airtableFetch !== "function") throw new Error("QA stale Reel Airtable dependency missing");
  const bounded = Math.min(30, Math.max(1, Number(limit) || 12));
  let queryNowMs = nowMs;
  // Rotate through the full stale set: without an R2 cursor the first eight
  // old incidents would hide every later lock indefinitely.
  const cursorKey = "studio/state/qa-ig-stale-upload/v1/cursor.json";
  let cursor = "";
  if (env.STUDIO_MEDIA?.get) {
    try {
      const prior = await env.STUDIO_MEDIA.get(cursorKey);
      const state = prior ? JSON.parse(await prior.text()) : {};
      if (typeof state.offset === "string" && state.offset.length <= 1024
        && Number.isFinite(Number(state.cutoff_ms))
        && nowMs - Number(state.cutoff_ms) < 24 * 60 * 60 * 1000
        && nowMs - Number(state.checked_at_ms) < 24 * 60 * 60 * 1000) {
        cursor = state.offset;
        queryNowMs = Number(state.cutoff_ms); // Stable formula across pages.
      }
    } catch { cursor = ""; }
  }
  const readPage = async offset => {
    const params = "?filterByFormula=" + encodeURIComponent(staleInstagramReelFormula(queryNowMs))
      + "&pageSize=" + bounded
      + (offset ? "&offset=" + encodeURIComponent(offset) : "");
    return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs", params);
  };
  let found;
  try { found = await readPage(cursor); }
  catch (error) {
    if (!cursor) throw error;
    queryNowMs = nowMs;
    found = await readPage(""); // Expired pagination token; restart safely.
  }
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
    let container = { verified: false, reason: "no_saved_container" };
    if (!recheck.post_id_saved && recheck.container_id_saved) {
      try {
        container = typeof verifyContainer === "function"
          ? await verifyContainer(current)
          : { verified: false, reason: "container_verifier_not_connected" };
      } catch { container = {verified: false, reason: "container_read_unavailable"}; }
    }
    const confirmed = provider?.verified_public === true
      && provider?.ownership_verified === true
      && String(provider?.remote_id || "") === str(current, "Platform_Post_ID");
    const containerConfirmed = container?.verified === true
      && container?.container_id === str(current, "Platform_Media_ID");
    const containerStatus = containerConfirmed ? String(container.status).toUpperCase() : "";
    const resumableContainer = ["IN_PROGRESS", "FINISHED"].includes(containerStatus);
    const outcome = confirmed ? "published_identity_verified_pending_reconciliation"
      : containerConfirmed && containerStatus === "PUBLISHED"
        ? "container_reports_published_receipt_unverified"
      : containerConfirmed && resumableContainer
        ? "saved_container_verified_pending_fenced_resume"
      : "stale_lock_needs_eyes";
    const evidence = {
      ...recheck, outcome,
      provider_evidence: String(provider?.evidence || "unverified").slice(0, 160),
      provider_public_verified: confirmed,
      provider_ownership_verified: confirmed,
      container_identity_verified: containerConfirmed,
      container_status: containerConfirmed ? containerStatus.slice(0,30) : null,
      container_evidence: String(container?.evidence || container?.reason || "not_checked").slice(0,140),
      observed_at: new Date(nowMs).toISOString(),
      next_action: confirmed ? "use_existing_publication_receipt_reconciler"
        : containerStatus === "PUBLISHED" ? "verify_exact_public_post_receipt_no_publish"
        : containerConfirmed && resumableContainer
          ? "fence_previous_runner_then_resume_saved_container_only"
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
          ? "authenticated_account_scoped_graph_exact_post_id"
          : containerConfirmed ? "authenticated_graph_get_exact_saved_container"
          : "airtable_stale_publish_lock",
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
  if (env.STUDIO_MEDIA?.put) {
    await env.STUDIO_MEDIA.put(cursorKey, JSON.stringify({
      schema: "qa.ig-stale-upload-cursor.1",
      offset: typeof found.offset === "string" && found.offset.length <= 1024
        ? found.offset : null,
      cutoff_ms: typeof found.offset === "string" ? queryNowMs : null,
      checked_at_ms: nowMs, candidate_count: found.records.length,
      audited_count: results.length,
    }), {httpMetadata:{contentType:"application/json"}});
  }
  return results;
}
