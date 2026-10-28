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
function authoritativeHoldMatches(hold, outputId, sessionId) {
  return hold?.verified === true && id(hold.output_id) === outputId &&
    id(hold.owner) === sessionId && Boolean(id(hold.id)) && hold.active === true;
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
}) {
  requireOperations(operations, [
    "authorizeReview", "withOutputLock", "readOutput", "loadSession",
    "claimHold", "readHold", "clearStaleSchedule", "createSessionIfAbsent",
    "readSession",
  ]);
  const outputId=id(output_id), sessionId=id(session_id), requestId=id(idempotency_key);
  if (!/^rec[A-Za-z0-9]{14}$/.test(outputId))
    err("INVALID_OUTPUT_ID", "Exact Airtable Platform Output record ID required", 400);
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(sessionId) ||
      !/^[A-Za-z0-9_-]{8,120}$/.test(id(original_attempt_id)) ||
      !/^[A-Za-z0-9_-]{8,120}$/.test(requestId))
    err("INVALID_REQUEST", "Server-generated session, attempt, and request identifiers required", 400);
  if (!policy?.enabled) err("FEATURE_DISABLED", "Rendering Review admission is disabled", 403);
  // Never accept a client-supplied "is_admin"/"authorized" assertion.
  if (await operations.authorizeReview(outputId) !== true)
    err("NOT_AUTHORIZED", "You are not authorized to enroll this output", 403);

  return operations.withOutputLock(outputId, async () => {
    const prior=await operations.loadSession(outputId);
    if (prior) {
      if (sessionMatches(prior,sessionId,requestId))
        return {session:prior,replay:true};
      err("ALREADY_ENROLLED", "This output already has a different review session");
    }
    const output=await operations.readOutput(outputId);
    if (!output || id(output.id)!==outputId)
      err("OUTPUT_NOT_FOUND", "Authoritative Platform Output not found", 404);
    const eligibility=reviewEligibility(output,policy);
    if (!eligibility.allowed)
      err(eligibility.reason, "Current output cannot enter the Chicago manual pilot");

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
        liveOutput.post_id || liveOutput.published_at ||
        liveOutput.platform_post_url ||
        /^(published|publishing|dispatched)$/i.test(String(liveOutput.output_status||"")) ||
        /^(published|publishing|dispatched)$/i.test(String(liveOutput.publish_status||"")))
      err("DISPATCH_RACE", "Output began dispatch; keep hold for manual reconciliation");
    if (liveOutput.scheduled_post_date || liveOutput.studio_scheduled_at ||
        liveOutput.youtube_scheduled_publish_at || liveOutput.approved_attempt_id)
      err("SCHEDULE_REVOCATION_UNVERIFIED", "Old schedule/approval was not independently cleared");

    const session=enrollReview(output,{...hold,verified:true},policy,{
      session_id:sessionId,original_attempt_id,
    });
    session.enrollment_request_id=requestId;
    await operations.createSessionIfAbsent(session);
    const saved=await operations.readSession(outputId);
    if (!saved || !sessionMatches(saved,sessionId,requestId) ||
        saved.version!==session.version || !saved.review_hold?.active)
      err("SESSION_SAVE_UNVERIFIED", "Review session did not pass authoritative readback");

    const stillHeld=await operations.readHold(outputId);
    if (!authoritativeHoldMatches(stillHeld,outputId,sessionId))
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
    "authorizeReview", "withOutputLock", "loadSession", "saveSessionIfVersion",
    "readSession", "readHold",
  ]);
  const outputId=id(output_id);
  if (!/^rec[A-Za-z0-9]{14}$/.test(outputId))
    err("INVALID_OUTPUT_ID", "Exact Platform Output record ID required", 400);
  if (await operations.authorizeReview(outputId) !== true)
    err("NOT_AUTHORIZED", "Not authorized to change this review", 403);
  return operations.withOutputLock(outputId, async () => {
    const s=await operations.loadSession(outputId);
    if (!s) err("REVIEW_NOT_FOUND", "No Rendering Review session exists",404);
    // Exact owner and hold readback on every mutation, not merely at enroll.
    const hold=await operations.readHold(outputId);
    if (s.review_hold.active && !authoritativeHoldMatches(hold,outputId,s.id))
      err("HOLD_NOT_VERIFIED", "Cannot change a session without its authoritative hold");
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
        verified.current_attempt_id!==result.session.current_attempt_id)
      err("SESSION_SAVE_UNVERIFIED","Persisted event could not be verified");
    return {...result,session:verified};
  });
}
