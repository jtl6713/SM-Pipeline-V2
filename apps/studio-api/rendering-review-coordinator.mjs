/**
 * Rendering Review Phase 0 integration boundary — no production route calls it.
 *
 * All operations are injected so isolated tests can exercise authorization,
 * locking, authoritative hold ordering and failure recovery without Airtable
 * writes. Implement production adapters only after the *publishing* owner is
 * also fenced by the same durable hold and per-output dispatch lock.
 */
import { reviewEligibility, enrollReview, applyReviewEvent } from "./rendering-review-policy.mjs";

function err(code, message, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}
const id = v => String(v ?? "").trim();
function requireOperations(operations, names) {
  for (const key of names) if (typeof operations?.[key] !== "function")
    err("INTEGRATION_MISSING", "Rendering Review requires " + key, 503);
}
function authoritativeHoldMatches(hold, outputId, sessionId, expectedHoldId = null) {
  return hold?.verified === true && id(hold.output_id) === outputId &&
    id(hold.owner) === sessionId && Boolean(id(hold.id)) && hold.active === true &&
    (expectedHoldId === null || id(hold.id) === id(expectedHoldId));
}
function sessionMatches(s, sessionId, requestId) {
  return s?.id === sessionId && s.enrollment_request_id === requestId;
}

/**
 * Claims a durable review hold *before* clearing stale schedule or saving
 * session. On any ambiguous failure, NEVER clear the hold here; an audited
 * reconciler will have to examine the orphaned hold. No simulated "success".
 *
 * Expected production operations:
 *  - authorizeReview: authenticated server permission, not a client boolean
 *  - withOutputLock: same per-output mutex used by approval + dispatch
 *  - readOutput: freshly authoritative output row (not Supabase mirror/cache)
 *  - loadSession: indexed lookup by exact platform output ID
 *  - claimHold/readHold: durable, owner-scoped atomic hold + readback
 *  - clearStaleSchedule: atomic approved/scheduled revocation under hold;
 *    do not clear unrelated holds or publish receipts
 *  - createSessionIfAbsent: authoritative unique output key
 *  - readSession: independent persisted readback
 */
export async function enrollManualReviewCommand({
  output_id, session_id, original_attempt_id, idempotency_key, policy, operations,
  initial_note, actor_id,
}) {
  requireOperations(operations, [
    "authorizeReview", "withOutputLock", "readOutput", "loadSession",
    "assertScheduleRevocationReady", "claimHold", "readHold",
    "clearStaleSchedule", "createSessionIfAbsent", "readSession",
  ]);
  const outputId=id(output_id), sessionId=id(session_id), requestId=id(idempotency_key);
  if (!/^rec[A-Za-z0-9]{14}$/.test(outputId))
    err("INVALID_OUTPUT_ID", "Exact Airtable Platform Output record ID required", 400);
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(sessionId) ||
      !/^[A-Za-z0-9_-]{8,120}$/.test(id(original_attempt_id)) ||
      !/^[A-Za-z0-9_-]{8,120}$/.test(requestId))
    err("INVALID_REQUEST", "Server-generated session, attempt, and request identifiers required", 400);
  // A Factory-origin review cannot be established with empty or unverified feedback.
  if(initial_note!==undefined && (!text(initial_note) || text(initial_note).length>3000 ||
      !/^rec[A-Za-z0-9]{14}$/.test(id(actor_id))))
    err("FACTORY_FEEDBACK_REQUIRED", "Factory review requires comments and a verified reviewer", 400);
  if (!policy?.enabled) err("FEATURE_DISABLED", "Rendering Review admission is disabled", 403);
  // Never accept a client-supplied "is_admin"/"authorized" assertion.
  if (await operations.authorizeReview(outputId) !== true)
    err("NOT_AUTHORIZED", "You are not authorized to enroll this output", 403);

  return operations.withOutputLock(outputId, async () => {
    const prior=await operations.loadSession(outputId);
    if (prior) {
      if (sessionMatches(prior,sessionId,requestId)) {
        if(initial_note!==undefined && (prior.factory_entry?.source!=="factory" ||
           prior.messages?.[0]?.content!==text(initial_note)))
          err("FACTORY_FEEDBACK_CONFLICT","Replayed review request does not match saved comments",409);
        // An idempotent success may only be replayed when the durable hold
        // is still present. A missing hold is not a valid existing enrollment.
        const held=await operations.readHold(outputId);
        if (prior.review_hold?.active && !authoritativeHoldMatches(held,outputId,sessionId,prior.review_hold.id))
          err("HOLD_LOST", "Previous enrollment's publication hold is no longer authoritative");
        return {session:prior,replay:true};
      }
      err("ALREADY_ENROLLED", "This output already has a different review session");
    }
    const output=await operations.readOutput(outputId);
    if (!output || id(output.id)!==outputId)
      err("OUTPUT_NOT_FOUND", "Authoritative Platform Output not found", 404);
    const eligibility=reviewEligibility(output,policy);
    if (!eligibility.allowed)
      err(eligibility.reason, "Current output cannot enter the Chicago manual pilot");

    // A selected Reel may already occupy an MAE slot. Before creating ANY
    // potentially orphaned publication hold, verify that the protected
    // scheduler can vacate this exact output under the same ownership context.
    // This is a read-only readiness check, not a promise that the later
    // revocation succeeded. The actual revocation still requires readback.
    const revocationReady=await operations.assertScheduleRevocationReady({
      output_id:outputId,profile_id:output.profile_id,platform:output.platform,
      output_type:output.output_type,review_owner:sessionId,
      scheduled_post_date:output.scheduled_post_date || null,
      studio_scheduled_at:output.studio_scheduled_at || null,
      youtube_scheduled_publish_at:output.youtube_scheduled_publish_at || null,
      approved_attempt_id:output.approved_attempt_id || null,
    });
    if(revocationReady!==true)
      err("SCHEDULE_REVOCATION_UNAVAILABLE",
        "Protected schedule revocation is not ready; no review hold was created",503);

    // First write: hold ownership. If the next operation crashes, the hold
    // remains, blocking publishing until audited recovery.
    await operations.claimHold({output_id:outputId,session_id:sessionId,request_id:requestId});
    const hold=await operations.readHold(outputId);
    if (!authoritativeHoldMatches(hold,outputId,sessionId))
      err("HOLD_NOT_VERIFIED", "Review hold did not pass independent authoritative readback");

    // This is not permission to clear any unrelated hold. Revoke the stale
    // schedule/approval without restoring old timestamps at cancellation.
    await operations.clearStaleSchedule({
      output_id:outputId,review_hold_id:hold.id,review_owner:sessionId,
    });
    const liveOutput=await operations.readOutput(outputId);
    if (!liveOutput || liveOutput.id !== outputId ||
        liveOutput.publish_started_at || liveOutput.publish_locked_at ||
        liveOutput.publish_locked_by ||
        liveOutput.post_id || liveOutput.platform_post_id || liveOutput.published_at ||
        liveOutput.platform_post_url ||
        /^(published|publishing|dispatched)$/i.test(String(liveOutput.output_status||"")) ||
        /^(published|publishing|dispatched)$/i.test(String(liveOutput.publish_status||"")))
      err("DISPATCH_RACE", "Output began dispatch; keep hold for manual reconciliation");
    if (liveOutput.scheduled_post_date || liveOutput.studio_scheduled_at ||
        liveOutput.youtube_scheduled_publish_at || liveOutput.approved_attempt_id)
      err("SCHEDULE_REVOCATION_UNVERIFIED", "Old schedule/approval was not independently cleared");

    // The same output must still have the same completed artifact and profile.
    // Do not enroll or describe a previous render as the current preview if
    // a concurrent producer revision or media replacement changed it.
    if (id(liveOutput.profile_id)!==id(output.profile_id) ||
        id(liveOutput.output_type)!==id(output.output_type) ||
        id(liveOutput.platform)!==id(output.platform) ||
        id(liveOutput.final_file_id || liveOutput.final_file_url)!==
          id(output.final_file_id || output.final_file_url) ||
        String(liveOutput.render_status||"").toLowerCase()!=="rendered")
      err("RENDER_CHANGED_DURING_ENROLLMENT",
        "Output changed during hold placement; keep the hold for reconciliation");

    const session=enrollReview(output,{...hold,verified:true},policy,{
      session_id:sessionId,original_attempt_id,
    });
    if(initial_note!==undefined){
      // Persist the reviewer's mandatory Factory comments in the initial
      // session write: never create a conversational review with no feedback.
      const at=new Date().toISOString();
      session.messages.push({
        id:"rrfactoryinitial_"+requestId,role:"user",content:text(initial_note),
        at,attempt_id:session.current_attempt_id,timestamp_seconds:null,
      });
      session.state="discussing";
      session.factory_entry={source:"factory",submitted_by:id(actor_id),submitted_at:at};
    }
    session.enrollment_request_id=requestId;
    await operations.createSessionIfAbsent(session);
    const saved=await operations.readSession(outputId);
    if (!saved || !sessionMatches(saved,sessionId,requestId) ||
        saved.version!==session.version || !saved.review_hold?.active)
      err("SESSION_SAVE_UNVERIFIED", "Review session did not pass authoritative readback");

    const stillHeld=await operations.readHold(outputId);
    if (!authoritativeHoldMatches(stillHeld,outputId,sessionId,hold.id))
      err("HOLD_LOST", "Publication hold was lost during enrollment");
    return {session:saved,replay:false};
  });
}

/**
 * Transactional state-event coordinator. Persist under exact output lock;
 * record intent before any external render job. A separate durable outbox
 * consumer and reconciler must pick up queued sessions, never HTTP callback.
 */
export async function mutateReviewSessionCommand({
  output_id, event, operations,
}) {
  requireOperations(operations, [
    "authorizeReview", "authorizeEvent", "withOutputLock", "loadSession", "saveSessionIfVersion",
    "readSession", "readHold",
  ]);
  const outputId=id(output_id);
  if (!/^rec[A-Za-z0-9]{14}$/.test(outputId))
    err("INVALID_OUTPUT_ID", "Exact Platform Output record ID required", 400);
  if (await operations.authorizeReview(outputId) !== true)
    err("NOT_AUTHORIZED", "Not authorized to change this review", 403);
  // The generic state-event path must not bypass the real scheduler or its
  // independent hold-release readback. Those need separate orchestrated paths.
  if (event?.type === "RELEASE_REVIEW_HOLD" ||
      (event?.type === "APPROVE_ATTEMPT" && event?.pilot_creative_only !== true))
    err("ORCHESTRATION_REQUIRED", "Publishing approval and hold release require scheduler integration", 409);
  // Server adapter validates actual identity, action permission, event
  // provenance and hashes; producer/callback roles cannot be client-asserted.
  if (await operations.authorizeEvent(outputId,event) !== true)
    err("UNTRUSTED_EVENT", "This event lacks authenticated provenance", 403);
  return operations.withOutputLock(outputId, async () => {
    const s=await operations.loadSession(outputId);
    if (!s) err("REVIEW_NOT_FOUND", "No Rendering Review session exists",404);
    // Exact owner and hold readback on every mutation, not merely at enroll.
    const hold=await operations.readHold(outputId);
    if (s.review_hold.active && !authoritativeHoldMatches(hold,outputId,s.id,s.review_hold.id))
      err("HOLD_NOT_VERIFIED", "Cannot change a session without its authoritative hold");
    // Creative acceptance is never permission to resume publishing. Recheck
    // the original output under the SAME approval mutex immediately before
    // recording acceptance, and retain the durable review hold afterwards.
    if(event?.type==="APPROVE_ATTEMPT"&&event.pilot_creative_only===true){
      if(typeof operations.readOutput!=="function")
        err("APPROVAL_OUTPUT_READ_REQUIRED","Authoritative output readback required",503);
      const original=await operations.readOutput(outputId);
      if(original?.id!==outputId||original.profile_id!==s.profile_id||
         original.platform!=="Instagram"||original.output_type!=="Instagram Reel"||
         original.do_not_publish!==true||original.review_hold_active!==true||
         original.publish_started_at||original.publish_locked_at||
         original.publish_locked_by||original.platform_post_id||
         original.platform_media_id||original.published_at)
        err("REVIEW_PUBLICATION_FENCE_LOST","Review approval cannot override publication hold");
    }
    const result=applyReviewEvent(s,event);
    if (result.replay) return result;
    if (result.session.state==="queued" && !result.session.review_hold.active)
      err("REVIEW_HOLD_REQUIRED", "Cannot start a revision without an active hold");
    const saved=await operations.saveSessionIfVersion({
      output_id:outputId,expected_version:s.version,next:result.session,
    });
    if (saved !== true) err("STALE_SESSION","Atomic session version check failed");
    const verified=await operations.readSession(outputId);
    if (!verified || verified.version!==result.session.version ||
        verified.current_attempt_id!==result.session.current_attempt_id ||
        JSON.stringify(verified)!==JSON.stringify(result.session))
      err("SESSION_SAVE_UNVERIFIED","Persisted event could not be verified");
    const stillHeld=await operations.readHold(outputId);
    if (s.review_hold.active && !authoritativeHoldMatches(stillHeld,outputId,s.id,s.review_hold.id))
      err("HOLD_LOST","Publication hold changed during event persistence");
    return {...result,session:verified};
  });
}
