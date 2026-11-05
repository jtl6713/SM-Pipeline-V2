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
    || str(row, "Review_Status") !== "Approved"
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

  const postId = str(row, "Platform_Post_ID");
  const containerId = str(row, "Platform_Media_ID");
  // A post receipt with Output_Status=Published but Publish_Status=Publishing
  // is a status mismatch to verify, not evidence of completed publication.
  const outputStatus = str(row, "Output_Status");
  if (outputStatus !== "Approved for Publishing"
    && !(outputStatus === "Published" && postId)) return null;

  const owner = str(row, "Publish_Locked_By");
  const held = owner === "AP1-IG";
  const exactGuardRefusal = str(row, "Output_Notes").includes(
    "QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation");
  // The previously released false-lock attempts are invisible to the old
  // lock-only scanner. A blank owner is NOT safe-to-retry evidence.
  const releasedLegacy = !owner
    && !str(row, "Publish_Locked_At")
    && !str(row, "Publish_Started_At")
    && (exactGuardRefusal || postId || containerId);
  if (!held && !releasedLegacy) return null;

  const attemptMs = at(row.fields?.Last_Publish_Attempt_At);
  const lockMs = held ? at(row.fields?.Publish_Locked_At) : NaN;
  if (!Number.isFinite(attemptMs) || (held && !Number.isFinite(lockMs))
    || nowMs - (held ? Math.max(lockMs, attemptMs) : attemptMs)
       < Math.max(thresholdMs, 60000)) return null;

  const retryMs = at(row.fields?.Publish_Next_Retry_At);
  if (Number.isFinite(retryMs) && retryMs > nowMs) return null;
  return {
    signature: QA_IG_STALE_UPLOAD_SIGNATURE,
    record_id: row.id, output_id: Number(row.fields?.Output_ID || 0),
    profile_id: Array.isArray(row.fields?.Content_Profile) && row.fields.Content_Profile.length === 1
      ? row.fields.Content_Profile[0] : null,
    age_seconds: Math.floor((nowMs - (held ? Math.max(lockMs, attemptMs) : attemptMs)) / 1000),
    lock_state: held ? "ap1_ig_held" : "released_legacy",
    exact_guard_refusal_recorded: exactGuardRefusal,
    output_status: outputStatus,
    lock_at: held ? row.fields.Publish_Locked_At : null,
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
  // Keep the Airtable-side filter bounded. Released historical attempts are
  // searchable only with an exact refusal marker or existing remote identity.
  const cutoff = new Date(nowMs - Math.max(thresholdMs, 60000)).toISOString();
  return 'AND({Platform}="Instagram",{Platform_Output_Type}="Instagram Reel",'
    + '{Publish_Status}="Publishing",'
    + 'OR(AND({Publish_Locked_By}="AP1-IG",{Publish_Locked_At}!=BLANK(),'
    + 'IS_BEFORE({Publish_Locked_At},"' + cutoff + '")),'
    + 'AND({Publish_Locked_By}=BLANK(),{Publish_Locked_At}=BLANK(),'
    + '{Publish_Started_At}=BLANK(),{Last_Publish_Attempt_At}!=BLANK(),'
    + 'IS_BEFORE({Last_Publish_Attempt_At},"' + cutoff + '"),'
    + 'OR(FIND("QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation",'
    + '{Output_Notes}&"")>0,{Platform_Post_ID}!=BLANK(),'
    + '{Platform_Media_ID}!=BLANK()))))';
}

export async function auditStaleInstagramReels(env, {
  airtableFetch, verifyProvider, verifyContainer, inspectLease, recoverSafe,
  nowMs = Date.now(), limit = 12,
} = {}) {
  if (typeof airtableFetch !== "function") throw new Error("QA stale Reel Airtable dependency missing");
  const bounded = Math.min(30, Math.max(1, Number(limit) || 12));
  let queryNowMs = nowMs;
  // Rotate through the full stale set: without an R2 cursor the first eight
  // old incidents would hide every later lock indefinitely.
  const cursorKey = "studio/state/qa-ig-stale-upload/v2/cursor.json";
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
      || recheck.lock_state !== decision.lock_state
      || recheck.output_status !== decision.output_status
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
    let leaseInspection = {available:false,reason:"lease_not_connected"};
    if (typeof inspectLease === "function") {
      try { leaseInspection = await inspectLease(current); }
      catch { leaseInspection = {available:false,reason:"lease_inspection_failed"}; }
    }
    const liveLease = leaseInspection?.available ? leaseInspection.state : null;
    // An old Airtable lock is NOT proof of death. The cross-runtime R2
    // heartbeat and irreversible-intent flag are the only positive proof.
    const heartbeatMs = Date.parse(String(liveLease?.heartbeat_at || ""));
    const leaseSafePreGraph = recheck.lock_state === "ap1_ig_held"
      && !recheck.post_id_saved && !recheck.container_id_saved
      && ["pre_remote","fenced"].includes(liveLease?.phase)
      && liveLease.irreversible_possible === false
      && Number.isFinite(heartbeatMs)
      && nowMs - heartbeatMs >= QA_IG_STALE_UPLOAD_THRESHOLD_MS
      && nowMs >= Number(liveLease.expires_ms)
      && Number.isSafeInteger(liveLease.generation);
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
      : leaseSafePreGraph ? (liveLease?.phase==="fenced" ? "fenced_pregraph_mae_retry_candidate" : "expired_pregraph_lease_recovery_candidate")
      : liveLease?.phase === "remote_intent" ? "graph_intent_ambiguous_needs_eyes"
      : recheck.lock_state === "released_legacy" ? "released_legacy_needs_eyes"
      : "stale_lock_needs_eyes";
    const evidence = {
      ...recheck, outcome,
      provider_evidence: String(provider?.evidence || "unverified").slice(0, 160),
      provider_public_verified: confirmed,
      provider_ownership_verified: confirmed,
      container_identity_verified: containerConfirmed,
      container_status: containerConfirmed ? containerStatus.slice(0,30) : null,
      container_evidence: String(container?.evidence || container?.reason || "not_checked").slice(0,140),
      lease_phase: liveLease?.phase || null,
      lease_generation: Number.isSafeInteger(liveLease?.generation) ? liveLease.generation : null,
      lease_expired: Boolean(liveLease && nowMs >= Number(liveLease.expires_ms)),
      lease_heartbeat_stale: Boolean(Number.isFinite(heartbeatMs) &&
        nowMs-heartbeatMs>=QA_IG_STALE_UPLOAD_THRESHOLD_MS),
      irreversible_possible: liveLease?.irreversible_possible === true,
      pregraph_proof: leaseSafePreGraph,
      observed_at: new Date(nowMs).toISOString(),
      next_action: confirmed ? "use_existing_publication_receipt_reconciler"
        : containerStatus === "PUBLISHED" ? "verify_exact_public_post_receipt_no_publish"
        : containerConfirmed && resumableContainer
          ? "fence_previous_runner_then_resume_saved_container_only"
        : leaseSafePreGraph ? "CAS_fence_then_atomic_MAE_reschedule"
        : recheck.lock_state === "released_legacy"
          ? "needs_eyes_released_legacy_no_retroactive_graph_proof"
          : "needs_eyes_ambiguous_remote_or_unverified_lease",
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
    // The audit finding and its durable readback MUST precede any fence.
    // RecoverSafe never issues a Graph request; only exact CAS-fenced,
    // never-remote-attempts can be moved by the atomic MAE lane.
    if (leaseSafePreGraph && typeof recoverSafe === "function") {
      try {
        const recovery = await recoverSafe(current, {
          lease_generation:liveLease.generation,
          lease_attempt_id:liveLease.attempt_id,
          observed_at:evidence.observed_at,
        });
        if (recovery?.committed === true &&
            recovery?.output_id === observed.id &&
            recovery?.generation === liveLease.generation &&
            Number.isFinite(Date.parse(recovery.scheduled_at))) {
          const outcomeKey = "QA-IG-STALE-RECOVERY:" + observed.id + ":" + liveLease.generation;
          const recoveredFields = {
            Event_Key:outcomeKey,Output_Record_ID:observed.id,
            Output_ID:decision.output_id,Platform:"Instagram",
            Output_Type:"Instagram Reel",Outcome:"fenced_pregraph_mae_rescheduled",
            Evidence_Source:"cas_fenced_pre_remote_runner_lease_atomic_mae",
            Verified_At:new Date(nowMs).toISOString(),Actor:"studio-quality-agent",
            Details_JSON:JSON.stringify({
              signature:QA_IG_STALE_UPLOAD_SIGNATURE,
              output_id:decision.output_id,output_record_id:observed.id,
              previous_lock_at:recheck.lock_at,
              lease_generation:liveLease.generation,
              scheduled_at:recovery.scheduled_at,
              reservation_id:recovery.reservation_id||null,
              graph_creates:0,provider_identity_saved:false,
              outcome:"fenced_pregraph_mae_rescheduled",
            }),
          };
          const outcomeSaved = await airtableFetch(env,QA_IG_STALE_UPLOAD_LEDGER,"",{
            method:"PATCH",body:JSON.stringify({performUpsert:{
              fieldsToMergeOn:["Event_Key"]},typecast:true,
              records:[{fields:recoveredFields}]}),
          });
          const outcomeId=outcomeSaved?.records?.[0]?.id;
          if(!/^rec[A-Za-z0-9]{14}$/.test(String(outcomeId||"")))
            throw new Error("QA IG recovery outcome not durably stored");
          const auditReadback=await airtableFetch(env,QA_IG_STALE_UPLOAD_LEDGER,outcomeId);
          if(auditReadback?.fields?.Event_Key!==outcomeKey ||
             auditReadback?.fields?.Outcome!=="fenced_pregraph_mae_rescheduled")
            throw new Error("QA IG recovery outcome audit readback failed");
          evidence.recovery_committed=true;
          evidence.recovered_scheduled_at=recovery.scheduled_at;
        } else throw new Error("QA IG recovery returned unverified reservation");
      } catch (error) {
        evidence.recovery_error=String(error?.message||"safe_recovery_failed").slice(0,180);
        evidence.recovery_committed=false; // Do not claim a partial commit.
      }
    }
    results.push(evidence);
  }
  if (env.STUDIO_MEDIA?.put) {
    await env.STUDIO_MEDIA.put(cursorKey, JSON.stringify({
      schema: "qa.ig-stale-upload-cursor.2",
      offset: typeof found.offset === "string" && found.offset.length <= 1024
        ? found.offset : null,
      cutoff_ms: typeof found.offset === "string" ? queryNowMs : null,
      checked_at_ms: nowMs, candidate_count: found.records.length,
      audited_count: results.length,
    }), {httpMetadata:{contentType:"application/json"}});
  }
  return results;
}
