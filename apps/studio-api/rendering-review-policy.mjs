/**
 * Rendering Review Phase 0: pure, deny-by-default lifecycle and dispatch policy.
 *
 * This module DOES NOT establish a provider/Studio hold, modify Airtable,
 * enqueue a render, or approve a post. The caller must first acquire and
 * verify an authoritative hold, then persist the returned session using a
 * serialized, version-checked coordinator. Do not activate the UI or enroll
 * live outputs until every publishing path consults a durable session gate.
 */
export const CHICAGO_PROFILE_ID = "recT2rbKX3MF7cVFU";
export const REVIEW_SCHEMA = "studio.render-review.1";
export const REVIEW_PILOT = Object.freeze({
  enabled: false,
  profile_ids: Object.freeze([CHICAGO_PROFILE_ID]),
  output_types: Object.freeze(["Instagram Reel"]),
  manual_admission: true,
  sample_percent: 0,
  quality_auto_admission: false,
  scheduled_auto_admission: false,
  max_sampled_open: 5,
});
export const REVIEW_STATES = Object.freeze([
  "ready_for_review", "discussing", "awaiting_assets", "plan_ready",
  "queued", "rendering", "validating", "revision_failed",
  "approved", "cancelled",
]);
const inProgress = new Set(["queued", "rendering", "validating"]);
const text = value => String(value ?? "").trim();
const lower = value => text(value).toLowerCase();
const fail = (code, message, status = 409) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
};
const validId = v => /^[A-Za-z0-9_-]{8,120}$/.test(text(v));
const copy = x => JSON.parse(JSON.stringify(x));
const hasReceipt = v => Boolean(v?.post_id || v?.platform_post_id || v?.published_at || v?.platform_post_url);
const isPublished = o => hasReceipt(o) || /^(published|publishing|dispatched)$/i.test(text(o?.output_status)) ||
  /^(published|publishing|dispatched)$/i.test(text(o?.publish_status));
const isDispatching = o => Boolean(o?.publish_started_at || o?.publish_locked_at ||
  o?.publish_locked_by || o?.platform_media_id || o?.dispatch_lease_active ||
  o?.irreversible_dispatch_started);
const humanIntent = v => v === "explicit_button" || v === "explicit_go_ahead";
const current = s => s.attempts.find(a => a.id === s.current_attempt_id);
// Conversation is not a rejection of a completed V2. Keep it reviewable until
// an actual edit plan/commit supersedes it; V1 feedback still starts discussion.
const currentV2ReadyForReview = s =>
  s.state === "ready_for_review" &&
  s.review_hold?.active === true &&
  current(s)?.number > 1 &&
  current(s)?.status === "ready_for_review" &&
  Boolean(text(current(s)?.artifact_id));
const eligible = (o, p) =>
  p.profile_ids.includes(text(o?.profile_id)) &&
  p.output_types.includes(text(o?.output_type)) &&
  lower(o?.platform) === "instagram";

export function reviewEligibility(output, policy = REVIEW_PILOT, admission = "manual") {
  if (!policy?.enabled) return { allowed: false, reason: "FEATURE_DISABLED" };
  if (!eligible(output, policy)) return { allowed: false, reason: "OUTSIDE_PILOT_SCOPE" };
  if (admission !== "manual" || !policy.manual_admission)
    return { allowed: false, reason: "AUTOMATIC_ENROLLMENT_DISABLED" };
  if (isPublished(output) || isDispatching(output))
    return { allowed: false, reason: "DISPATCH_ALREADY_STARTED" };
  if (lower(output?.render_status) !== "rendered" || !text(output?.final_file_id || output?.final_file_url))
    return { allowed: false, reason: "NO_COMPLETED_RENDER" };
  if (output?.review_session_exists) return { allowed: false, reason: "ALREADY_ENROLLED" };
  return { allowed: true, reason: null };
}

/** Requires caller-verified hold receipt, not a requested/pending hold. */
export function enrollReview(output, hold, policy, { session_id, original_attempt_id } = {}) {
  const check = reviewEligibility(output, policy);
  if (!check.allowed) fail(check.reason, "Output is not eligible for manual Rendering Review");
  if (!validId(session_id) || !validId(original_attempt_id))
    fail("INVALID_IDENTITY", "Session and original attempt IDs are required", 400);
  if (hold?.verified !== true || !validId(hold?.id) ||
      text(hold.output_id) !== text(output.id) ||
      text(hold.owner) !== text(session_id))
    fail("HOLD_NOT_VERIFIED", "Authoritative review hold must be verified before enrollment");
  const artifact = text(output.final_file_id || output.final_file_url);
  return {
    schema: REVIEW_SCHEMA, id: session_id, output_id: text(output.id),
    profile_id: text(output.profile_id), output_type: text(output.output_type),
    state: "ready_for_review", version: 1,
    review_hold: { id: hold.id, owner: session_id, active: true },
    original_approval: output.approved_attempt_id || null,
    original_do_not_publish: output.do_not_publish === true,
    current_attempt_id: original_attempt_id, latest_attempt_number: 1,
    latest_plan_version: 0,
    approved_attempt_id: null, plan: null, pending_authorization: null,
    active_job: null, messages: [], processed: {}, history: [],
    attempts: [{ id: original_attempt_id, number: 1, parent_id: null,
      status: "ready_for_review", artifact_id: artifact, plan_version: null,
      job_id: null, cleanup_state: "not_applicable" }],
  };
}

function checkSession(session) {
  if (!session || session.schema !== REVIEW_SCHEMA ||
      !REVIEW_STATES.includes(session.state) || !session.review_hold)
    fail("INVALID_SESSION", "Review session is missing or malformed", 400);
}
function requirePlanReady(s, planVersion, planHash) {
  const p = s.plan;
  if (!p || p.version !== planVersion || p.hash !== planHash)
    fail("STALE_PLAN", "The revision plan changed; inspect the latest plan");
  if (!p.frozen || p.missing_assets?.length)
    fail("DEPENDENCIES_UNRESOLVED", "Validate the frozen plan and its required assets");
}
function markHistory(s, e) {
  s.history.push({ type: e.type, key: e.idempotency_key, at: text(e.at), version: s.version });
}

/**
 * All events require expected_version + idempotency_key + canonical fingerprint.
 * Caller performs authentication and serializes read/modify/persist. The event
 * result is an intended state change, NEVER a permission to run side effects.
 */
export function applyReviewEvent(session, event) {
  checkSession(session);
  const key = text(event?.idempotency_key);
  const fingerprint = text(event?.fingerprint);
  if (!validId(key) || !validId(fingerprint))
    fail("INVALID_REQUEST_ID", "Idempotency key and request fingerprint required", 400);
  const prior = session.processed[key];
  if (prior) {
    if (prior !== fingerprint) fail("IDEMPOTENCY_CONFLICT", "Request ID used for different content");
    return { session: copy(session), replay: true, ignored: false };
  }
  if (!Number.isSafeInteger(event.expected_version) || event.expected_version !== session.version)
    fail("STALE_SESSION", "Session changed; reload the latest state before retrying");
  const s = copy(session);
  const kind = text(event.type);
  let ignored = false;

  if (kind === "MESSAGE") {
    if (s.state === "cancelled" || s.state === "approved")
      fail("SESSION_CLOSED", "This review is no longer open");
    // A separately authorized in-flight note is for the NEXT revision only.
    // Never let a stale request alter a finished job or a new frozen plan.
    if (event.in_flight_only === true &&
        (!inProgress.has(s.state) || !s.review_hold.active || !s.active_job?.id))
      fail("IN_FLIGHT_FEEDBACK_NOT_ALLOWED", "This render has advanced. Refresh before commenting",409);
    if (event.conversation_only === true &&
        (inProgress.has(s.state) || !s.review_hold.active ||
         !["ready_for_review","discussing","awaiting_assets","plan_ready","revision_failed"].includes(s.state)))
      fail("DISCUSSION_FEEDBACK_NOT_ALLOWED", "Review changed; refresh before saving further feedback",409);
    if (!["user", "producer"].includes(event.role) ||
        !text(event.content) || text(event.content).length > 3000 ||
        !validId(event.message_id))
      fail("INVALID_MESSAGE", "Valid actor, message ID and content required", 400);
    s.messages.push({ id: event.message_id, role: event.role,
      content: text(event.content), at: text(event.at), attempt_id: s.current_attempt_id,
      timestamp_seconds: Number.isFinite(event.timestamp_seconds) &&
        event.timestamp_seconds >= 0 ? event.timestamp_seconds : null });
    if(event.role==="user"){
      if(s.producer_candidate)s.producer_candidate.stale=true;
      // A revised user instruction invalidates the prior frozen plan and any
      // conditional authorization, but cannot change an in-flight job.
      if(["awaiting_assets","plan_ready"].includes(s.state)){
        if(s.plan)s.plan.frozen=false;
        s.pending_authorization=null;
        s.state="discussing";
      }
    }
    if (s.state === "ready_for_review" && !currentV2ReadyForReview(s)) s.state = "discussing";
    // Messages during rendering are feedback for the NEXT attempt, never job mutation.
  } else if (kind === "PRODUCER_CANDIDATE") {
    // This event is authorized ONLY by the trusted Worker after its model
    // service response was checked. It persists user direction + genuine
    // model reasoning in ONE version-fenced event, not a render authorization.
    if (!["ready_for_review","discussing","awaiting_assets","plan_ready","revision_failed"].includes(s.state)
        || s.review_hold.active !== true)
      fail("PRODUCER_NOT_EDITABLE", "A live held review is required for Producer discussion");
    const candidate=event.candidate;
    const candidateText=JSON.stringify(candidate);
    if (!candidate || Array.isArray(candidate) || typeof candidate!=="object" ||
        !candidateText || candidateText.length>40000 ||
        !/^[a-f0-9]{64}$/.test(text(event.candidate_hash)) ||
        !/^[a-f0-9]{64}$/.test(text(event.evidence_hash)) ||
        !validId(event.user_message_id) || !validId(event.producer_message_id) ||
        !text(event.direction) || text(event.direction).length>3000 ||
        !text(event.summary) || text(event.summary).length>3000 ||
        !text(candidate.explanation) || !text(candidate.narration) ||
        !Array.isArray(candidate.changes) || !Array.isArray(candidate.timeline) ||
        !Array.isArray(candidate.requirements) || !Array.isArray(candidate.acceptance_checks))
      fail("INVALID_PRODUCER_CANDIDATE", "A bounded, validated candidate and two messages are required",400);
    if (s.messages.some(m=>m.id===event.user_message_id||m.id===event.producer_message_id))
      fail("DUPLICATE_PRODUCER_MESSAGE", "Review message identity must not be reused");
    s.messages.push({id:event.user_message_id,role:"user",content:text(event.direction),
      at:text(event.at),attempt_id:s.current_attempt_id,timestamp_seconds:null});
    s.messages.push({id:event.producer_message_id,role:"producer",content:text(event.summary),
      at:text(event.at),attempt_id:s.current_attempt_id,timestamp_seconds:null});
    s.producer_candidate={
      hash:event.candidate_hash,evidence_hash:event.evidence_hash,
      source_attempt_id:s.current_attempt_id,request_key:key,
      candidate:copy(candidate),created_at:text(event.at),
      requires_fact_validation:true,ready_to_commit:false,stale:false,
    };
    // A new model candidate cannot inherit any previous frozen plan or
    // conditional 'render when uploaded' authorization.
    s.plan=null;
    s.pending_authorization=null;
    // A later chat or suggestion must not hide a completed, current V2 or
    // prevent its human review/creative acceptance. New plan events may still
    // replace that state through the normal protected flow.
    if (!currentV2ReadyForReview(s)) s.state="discussing";
  } else if (kind === "PROPOSE_PLAN") {
    if(s.producer_candidate?.stale)
      fail("STALE_PRODUCER_CANDIDATE","Refresh the Producer proposal after new creative feedback");
    if (!["ready_for_review", "discussing", "awaiting_assets", "plan_ready", "revision_failed"].includes(s.state))
      fail("PLAN_NOT_EDITABLE", "Cannot replace a plan while rendering");
    if (!validId(event.plan_hash) || !Number.isSafeInteger(event.plan_version) ||
        event.plan_version !== s.latest_plan_version + 1 ||
        !Array.isArray(event.missing_assets) ||
        event.missing_assets.some(id => !validId(id)))
      fail("INVALID_PLAN", "A newer validated plan version and dependency list are required", 400);
    const manifest=event.immutable_manifest;
    if(manifest!==undefined &&
       (!manifest || typeof manifest!=="object" || Array.isArray(manifest) ||
        JSON.stringify(manifest).length>50000 ||
        manifest.source_attempt_id!==s.current_attempt_id ||
        manifest.output_id!==s.output_id ||
        manifest.profile_id!==s.profile_id ||
        manifest.allow_public_publish!==false ||
        manifest.allow_platform_upload!==false ||
        manifest.auto_approve!==false ||
        s.producer_candidate?.hash!==manifest.candidate_hash))
      fail("PLAN_SOURCE_UNVERIFIED","Frozen plan identity and publication denial must match",400);
    s.plan = { version: event.plan_version, hash: event.plan_hash, frozen: event.frozen === true,
      missing_assets: [...new Set(event.missing_assets)], source_attempt_id: s.current_attempt_id,
      acceptance_checks: Array.isArray(event.acceptance_checks) ? event.acceptance_checks : [],
      ...(manifest!==undefined?{immutable_manifest:copy(manifest)}:{}) };
    s.latest_plan_version = event.plan_version;
    s.pending_authorization = null; // materially changed plan revokes conditional intent
    s.state = s.plan.missing_assets.length ? "awaiting_assets" : s.plan.frozen ? "plan_ready" : "discussing";
  } else if (kind === "ASSET_VALIDATED") {
    if (s.state !== "awaiting_assets" || !s.plan || !s.plan.frozen)
      fail("NO_MISSING_ASSET_PLAN", "There is no frozen plan awaiting assets");
    if (s.plan.hash !== event.plan_hash || s.plan.version !== event.plan_version)
      fail("STALE_PLAN", "Assets belong to a superseded plan");
    const id = text(event.requirement_id);
    if (!s.plan.missing_assets.includes(id) || event.validation_passed !== true)
      fail("ASSET_NOT_VALIDATED", "Required asset was not validated");
    s.plan.missing_assets = s.plan.missing_assets.filter(x => x !== id);
    s.state = s.plan.missing_assets.length ? "awaiting_assets" : "plan_ready";
    // Conditional authorization is a separate durable decision. Caller may
    // commit it exactly once only after this state is persisted.
  } else if (kind === "AUTHORIZE_AFTER_ASSETS") {
    if (s.state !== "awaiting_assets" || !humanIntent(event.intent))
      fail("NO_CONDITIONAL_AUTH", "Explicit intent is needed for an awaiting-assets plan");
    if (s.plan?.hash !== event.plan_hash || s.plan?.version !== event.plan_version || !s.plan.frozen)
      fail("STALE_PLAN", "Conditional authorization must bind the frozen plan");
    s.pending_authorization = { plan_hash: s.plan.hash, plan_version: s.plan.version,
      source_attempt_id: s.current_attempt_id };
  } else if (kind === "COMMIT_PLAN") {
    if(s.producer_candidate?.stale)
      fail("STALE_PRODUCER_CANDIDATE","Refresh the plan after creative feedback");
    if (s.state !== "plan_ready" || !s.review_hold.active)
      fail("REVIEW_NOT_READY", "Review hold and a ready plan are required");
    requirePlanReady(s, event.plan_version, event.plan_hash);
    const conditional = s.pending_authorization?.plan_hash === s.plan.hash &&
      s.pending_authorization?.plan_version === s.plan.version &&
      s.pending_authorization?.source_attempt_id === s.current_attempt_id;
    if (!humanIntent(event.intent) && !(event.intent === "authorized_after_assets" && conditional))
      fail("COMMIT_NOT_AUTHORIZED", "Explicit authorization is required for this plan");
    if (!validId(event.attempt_id) || !validId(event.job_id) ||
        s.attempts.some(a => a.id === event.attempt_id))
      fail("INVALID_JOB_ID", "New attempt and unique job identities are required", 400);
    const parent_id = s.current_attempt_id;
    const number = s.latest_attempt_number + 1;
    s.attempts.push({ id: event.attempt_id, number, parent_id, status: "queued",
      artifact_id: null, plan_version: s.plan.version, job_id: event.job_id, job_history: [event.job_id],
      cleanup_state: "pending" });
    s.current_attempt_id = event.attempt_id;
    s.latest_attempt_number = number;
    s.approved_attempt_id = null;
    s.active_job = { id: event.job_id, attempt_id: event.attempt_id, plan_hash: s.plan.hash };
    s.pending_authorization = null;
    s.state = "queued";
  } else if (kind === "RETRY_ATTEMPT") {
    if (s.state !== "revision_failed" || !s.review_hold.active || !s.plan?.frozen ||
        s.plan.hash !== event.plan_hash || s.plan.version !== event.plan_version ||
        event.attempt_id !== s.current_attempt_id ||
        !validId(event.job_id) || s.attempts.some(a => (a.job_history || [a.job_id]).includes(event.job_id)))
      fail("RETRY_NOT_ALLOWED", "Retry requires the same failed attempt, unchanged plan and a new job ID");
    const attempt = current(s);
    if (!attempt || attempt.status !== "revision_failed" || attempt.artifact_id)
      fail("RETRY_NOT_ALLOWED", "Only failed attempts without a promoted artifact can retry");
    attempt.job_history = [...(attempt.job_history || [attempt.job_id]), event.job_id];
    attempt.job_id = event.job_id;
    attempt.status = "queued";
    s.active_job = { id: event.job_id, attempt_id: attempt.id, plan_hash: s.plan.hash };
    s.state = "queued";
  } else if (["RENDER_STARTED", "RENDER_VALIDATING", "RENDER_READY", "RENDER_FAILED"].includes(kind)) {
    if (!s.active_job || s.active_job.id !== event.job_id ||
        s.active_job.attempt_id !== event.attempt_id || !inProgress.has(s.state)) {
      // Stale authenticated callbacks must be acknowledged without promotion.
      ignored = true;
    } else {
      const attempt = current(s);
      if (!attempt || attempt.id !== event.attempt_id)
        fail("ATTEMPT_MISMATCH", "Active attempt is inconsistent");
      if (kind === "RENDER_STARTED") {
        if (s.state !== "queued") ignored = true;
        else s.state = attempt.status = "rendering";
      } else if (kind === "RENDER_VALIDATING") {
        if (s.state !== "rendering") ignored = true;
        else s.state = attempt.status = "validating";
      } else if (kind === "RENDER_READY") {
        if (s.state !== "validating" || event.validation_passed !== true ||
            event.plan_hash !== s.active_job.plan_hash || !validId(event.artifact_id))
          fail("RENDER_NOT_VALIDATED", "A validated immutable artifact is required");
        attempt.artifact_id = event.artifact_id;
        attempt.status = "ready_for_review";
        s.state = "ready_for_review";
        s.active_job = null;
        s.plan = null;
      } else {
        attempt.status = "revision_failed";
        s.state = "revision_failed";
        s.active_job = null;
      }
    }
  } else if (kind === "APPROVE_ATTEMPT") {
    if (s.state !== "ready_for_review" || !s.review_hold.active ||
        event.pilot_creative_only !== true ||
        event.attempt_id !== s.current_attempt_id ||
        event.artifact_id !== current(s)?.artifact_id ||
        event.unrelated_hold_active === true)
      fail("STALE_OR_HELD_APPROVAL", "Only the current validated attempt may be approved");
    // A narrow creative acceptance does not schedule or publish. The authenticated
    // orchestrator must retain the durable hold until a separate scheduler-authorized release.
    s.approved_attempt_id = s.current_attempt_id;
    s.state = "approved";
  } else if (kind === "FACTORY_ACCEPT_HELD_CREATIVE") {
    // Human Factory acceptance is NOT approval for publishing. An unverified
    // watermark cannot prevent a reviewer from accepting the creative cut.
    // Keep the owned publication hold, original delivery status, and media.
    const attempt=current(s);
    if(s.state!=="approved"||s.review_hold.active!==true||
       s.current_attempt_id!==s.approved_attempt_id||
       !attempt||attempt.number<2||attempt.status!=="ready_for_review"||
       event.attempt_id!==attempt.id||event.artifact_id!==attempt.artifact_id||
       event.hold_id!==s.review_hold.id||event.hold_owner!==s.id||
       s.active_job||s.factory_review?.status==="accepted_pending_qa")
      fail("FACTORY_HELD_CREATIVE_NOT_ELIGIBLE",
        "Only the current creatively approved and publication-held V2 may receive a Factory creative decision");
    s.factory_review={status:"accepted_pending_qa",
      attempt_id:attempt.id,artifact_id:attempt.artifact_id,
      at:text(event.at),publishing_authorized:false};
  } else if (kind === "REOPEN_APPROVED_HELD_REDO") {
    // Creative work is independent of delivery QA. In particular, a missing
    // watermark must never prevent the reviewer from asking for another V2/V3.
    // No output hold, publishing authority or render job changes here.
    const attempt=current(s);
    if(s.state!=="approved"||s.review_hold.active!==true||
       s.current_attempt_id!==s.approved_attempt_id||
       !attempt||Number(attempt.number)<2||attempt.status!=="ready_for_review"||
       event.attempt_id!==attempt.id||event.artifact_id!==attempt.artifact_id||
       event.hold_id!==s.review_hold.id||event.hold_owner!==s.id||
       !validId(event.message_id)||!text(event.note)||
       text(event.note).length>3000||
       s.messages.some(m=>m.id===event.message_id)||s.active_job)
      fail("APPROVED_REDO_NOT_ALLOWED",
        "Only the exact approved, held and idle V2 can reopen for creative changes");
    s.messages.push({id:event.message_id,role:"user",content:text(event.note),
      at:text(event.at),attempt_id:attempt.id,timestamp_seconds:null});
    s.approved_attempt_id=null;
    s.factory_review=null;
    s.producer_candidate=null;
    s.plan=null;
    s.pending_authorization=null;
    s.state="discussing";
    // The approved artifact stays in attempt history and remains the selected
    // held review-only file until the reviewer separately starts a new render.
  } else if (kind === "FACTORY_REQUEST_CHANGES") {
    // The Factory writer has already re-established and read back the exact
    // output hold while holding the shared per-output approval lease.
    const attempt=current(s);
    if(s.state!=="approved"||s.review_hold.active!==false||
       s.current_attempt_id!==s.approved_attempt_id ||
       s.factory_handoff?.status!=="ready_for_factory_approval"||
       s.factory_handoff?.attempt_id!==attempt?.id||
       s.factory_handoff?.artifact_id!==attempt?.artifact_id||
       event.attempt_id!==attempt?.id||event.artifact_id!==attempt?.artifact_id||
       event.hold_id!==s.review_hold.id||event.hold_owner!==s.id||
       !validId(event.message_id)||!text(event.note)||
       text(event.note).length>3000||
       s.messages.some(m=>m.id===event.message_id))
      fail("FACTORY_RETURN_NOT_ALLOWED","Factory request cannot bypass an approved revision or active render hold");
    s.messages.push({id:event.message_id,role:"user",content:text(event.note),
      at:text(event.at),attempt_id:attempt.id,timestamp_seconds:null});
    s.review_hold.active=true;
    s.approved_attempt_id=null;
    s.factory_review=null;
    s.factory_handoff.status="returned_for_changes";
    s.factory_handoff.returned_at=text(event.at);
    s.producer_candidate=null;
    s.plan=null;
    s.pending_authorization=null;
    s.active_job=null;
    s.state="discussing";
  } else if (kind === "FACTORY_HANDOFF") {
    // Factory is a distinct human approval stage. The orchestrator must first
    // verify the accepted V2 artifact is selected on the original output while
    // its authoritative publication hold remains in force. This state event
    // does not schedule, approve for publishing, or release an Airtable hold.
    const active=current(s);
    const original=s.attempts.find(a=>a.number===1);
    if(s.state!=="approved" || s.review_hold.active!==true ||
       s.original_do_not_publish!==false || !active || !original ||
       Number(active.number)<2 ||
       active.id!==s.approved_attempt_id ||
       event.attempt_id!==active.id ||
       event.artifact_id!==active.artifact_id ||
       event.original_artifact_id!==original.artifact_id ||
       event.hold_id!==s.review_hold.id || event.hold_owner!==s.id ||
       event.factory_receipt_verified!==true)
      fail("FACTORY_HANDOFF_DENIED","Only verified, creatively accepted V2 can be transferred to Factory");
    s.factory_handoff={
      attempt_id:active.id,artifact_id:active.artifact_id,
      original_artifact_id:original.artifact_id,at:text(event.at),
      status:"ready_for_factory_approval",
    };
    if(s.factory_review?.status==="accepted_pending_qa"&&
       s.factory_review.attempt_id===active.id)
      s.factory_review={...s.factory_review,status:"handoff_verified",
        qa_pending:false,verified_at:text(event.at)};
    // The authoritative output hold remains active until a separate verified
    // exact-owner Airtable release AFTER this session update is persisted.
    s.review_hold.active=false;
  } else if (kind === "RELEASE_REVIEW_HOLD") {
    if (s.state !== "approved" || event.scheduler_receipt_verified !== true ||
        event.hold_id !== s.review_hold.id || event.hold_owner !== s.id)
      fail("HOLD_RELEASE_DENIED", "Verified scheduled approval and exact hold ownership required");
    s.review_hold.active = false;
  } else if (kind === "CANCEL") {
    if (s.state === "approved") fail("ALREADY_APPROVED", "An approved review cannot be cancelled");
    if (s.state === "cancelled") ignored = true;
    else {
      if (s.active_job) {
        if (event.job_fenced !== true) fail("ACTIVE_JOB_NOT_FENCED", "Cancel/fence the active job first");
        s.active_job = null;
      }
      s.state = "cancelled";
      // Releasing the hold / restoring a prior attempt is a separate
      // audited operation, never an automatic side effect of cancellation.
    }
  } else {
    fail("UNKNOWN_EVENT", "Unsupported review event", 400);
  }
  s.version += 1;
  s.processed[key] = fingerprint;
  markHistory(s, event);
  return { session: s, replay: false, ignored };
}

/**
 * Additional gate; never substitutes for the legacy publishing checks.
 * Disabling feature admissions MUST NOT allow an existing session to dispatch.
 */
export function reviewDispatchGate(session, output, candidate) {
  if (!session) return { allowed: true, reason: "UNENROLLED_LEGACY_PATH" };
  checkSession(session);
  if (isPublished(output) || isDispatching(output)) return { allowed: false, reason: "OUTPUT_ALREADY_DISPATCHING" };
  if (session.review_hold.active) return { allowed: false, reason: "REVIEW_HOLD_ACTIVE" };
  const attempt = current(session);
  if (session.state !== "approved" || !attempt ||
      session.approved_attempt_id !== session.current_attempt_id ||
      candidate?.attempt_id !== attempt.id || candidate?.artifact_id !== attempt.artifact_id)
    return { allowed: false, reason: "STALE_OR_UNAPPROVED_ATTEMPT" };
  if (output?.unrelated_hold_active) return { allowed: false, reason: "OTHER_HOLD_ACTIVE" };
  return { allowed: true, reason: null };
}

export function cleanupCandidates(files, referenceCounts, protectedAttemptIds = []) {
  if (!Array.isArray(files)) fail("INVALID_FILES", "Expected generated media inventory", 400);
  return files.filter(f => f?.generated === true && validId(f?.owner_attempt_id) &&
    f.canonical_source !== true && f.published_evidence !== true &&
    f.shared !== true && f.owned_by_attempt === true &&
    !protectedAttemptIds.includes(f.owner_attempt_id) &&
    Number(referenceCounts?.[f.id]) === 0).map(f => f.id);
}
