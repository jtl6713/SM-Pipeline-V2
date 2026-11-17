/**
 * Pure, deny-by-default proof for resuming a partially committed Studio approval.
 *
 * A confirmed I4 Idea and its single parent Content Item are the authority.
 * Never infer an owner from title, profile, similar assets, or a stale job.
 */
const validId = (id) => /^rec[A-Za-z0-9]{14}$/.test(String(id || ""));
const ids = (xs) => (Array.isArray(xs) ? xs : [])
  .map(x => String(x?.id || x || "").trim()).filter(validId);
export const SUBMITTED_RECOVERY_GRACE_MS = 10 * 60 * 1000;

export function submittedApprovalAge(submittedAt, nowMs = Date.now()) {
  const ms = Date.parse(String(submittedAt || ""));
  return Number.isFinite(ms) && nowMs >= ms ? nowMs - ms : null;
}

export function verifySubmittedPromotionOwnership({
  requestId, requestStatus, requestIdeaIds, requestParentIds, submittedAt,
  ideaId, ideaContentIds, ideaPromotedContentId, ideaRequestIds,
  parentId, parentRequestIds, nowMs = Date.now(), minAgeMs = SUBMITTED_RECOVERY_GRACE_MS,
}) {
  const fail = (reason) => ({ safe: false, reason, parentId: null, repairLink: false });
  if (!validId(requestId) || requestStatus !== "Submitted") return fail("not_submitted");
  const age = submittedApprovalAge(submittedAt, nowMs);
  if (age === null) return fail("missing_submission_timestamp");
  if (age < minAgeMs) return fail("within_grace_period");
  const linkedIdeas = ids(requestIdeaIds);
  if (linkedIdeas.length !== 1 || linkedIdeas[0] !== ideaId) return fail("ambiguous_request_idea");
  const candidateParents = ids(ideaContentIds);
  const promoted = String(ideaPromotedContentId || "").trim();
  if (candidateParents.length > 1 || (candidateParents.length === 0 && !validId(promoted)))
    return fail("unconfirmed_or_ambiguous_i4_parent");
  if (candidateParents.length === 1 && promoted && promoted !== candidateParents[0])
    return fail("conflicting_i4_parent");
  if ((candidateParents[0] || promoted) !== parentId) return fail("unexpected_content_record");
  const owners = ids(parentRequestIds);
  if (owners.length !== 1 || owners[0] !== requestId) return fail("ambiguous_parent_owner");
  const inverseRequests = ids(ideaRequestIds);
  if (inverseRequests.length && !inverseRequests.includes(requestId)) return fail("idea_request_mismatch");
  const requestParents = ids(requestParentIds);
  if (requestParents.length > 1 || (requestParents.length === 1 && requestParents[0] !== parentId))
    return fail("conflicting_request_parent");
  return { safe: true, reason: "confirmed", parentId, repairLink: requestParents.length === 0 };
}

/**
 * Keep a repeatedly failing older Submitted request from monopolizing cron.
 * Try never-attempted requests first (newest first), then least recently
 * attempted. This changes only which *existing* request can be recovered;
 * ownership proof, one-attempt-per-tick, and no-I3-replay still apply.
 */
export function orderSubmittedRecoveryRequests(records, field) {
  const timestamp = (row, name) => {
    const parsed = Date.parse(String(field(row, name) || ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  return [...(Array.isArray(records) ? records : [])].sort((a, b) => {
    const aAttempt = timestamp(a, "Studio_Approval_Recovery_Last_Attempt_At");
    const bAttempt = timestamp(b, "Studio_Approval_Recovery_Last_Attempt_At");
    if (aAttempt === null && bAttempt !== null) return -1;
    if (bAttempt === null && aAttempt !== null) return 1;
    if (aAttempt !== null && bAttempt !== null && aAttempt !== bAttempt) return aAttempt - bAttempt;
    return (timestamp(b, "Submitted_At") || 0) - (timestamp(a, "Submitted_At") || 0);
  });
}

/**
 * Supabase migration recovery for a uniquely owned autonomous I4 result whose
 * Submitted_At and/or parent reciprocal link failed to persist. The ordinary
 * Submitted proof above deliberately remains strict for all manual approvals.
 *
 * Never infer ownership from the title, assets, profile, or guessed timestamps.
 * The Idea must explicitly name only this request and only this I4 Content
 * Item, while the Content Item must point back to that exact Idea. A parent
 * owned by anyone else is not eligible. This proof permits repairing missing
 * reciprocal links; it does not approve content or re-run I3/I4 generation.
 */
export function verifySubmittedAutonomousOrphan({
  requestId, requestStatus, requestIdeaIds, requestParentIds,
  submittedAt, requestCreatedAt, requestNotes,
  ideaId, ideaStatus, ideaContentIds, ideaPromotedContentId, ideaRequestIds,
  parentId, parentRequestIds, parentIdeaIds,
  nowMs = Date.now(), minAgeMs = SUBMITTED_RECOVERY_GRACE_MS,
}) {
  const fail = reason => ({ safe: false, reason, parentId: null, repairLink: false, repairParentOwner: false });
  if (!validId(requestId) || requestStatus !== "Submitted") return fail("not_submitted");
  if (!/(?:^|\\n)origin=autonomous(?:\\n|$)/i.test(String(requestNotes || "")))
    return fail("not_autonomous_origin");
  if (ideaStatus !== "Promoted") return fail("idea_not_promoted");
  // An explicit, current Submitted_At wins; a missing timestamp is only
  // accepted after this same autonomous request's durable creation age.
  const age = submittedApprovalAge(submittedAt || requestCreatedAt, nowMs);
  if (age === null) return fail("missing_verified_age");
  if (age < minAgeMs) return fail("within_grace_period");
  const linkedIdeas = ids(requestIdeaIds);
  if (linkedIdeas.length !== 1 || linkedIdeas[0] !== ideaId) return fail("ambiguous_request_idea");
  const inverseRequests = ids(ideaRequestIds);
  if (inverseRequests.length !== 1 || inverseRequests[0] !== requestId)
    return fail("nonexclusive_idea_request");
  const candidateParents = ids(ideaContentIds);
  if (candidateParents.length !== 1 || candidateParents[0] !== parentId
      || ideaPromotedContentId !== parentId) return fail("unconfirmed_i4_parent");
  const sourceIdeas = ids(parentIdeaIds);
  if (sourceIdeas.length !== 1 || sourceIdeas[0] !== ideaId)
    return fail("parent_source_idea_mismatch");
  const owners = ids(parentRequestIds);
  if (owners.length > 1 || (owners.length === 1 && owners[0] !== requestId))
    return fail("parent_already_owned");
  const requestParents = ids(requestParentIds);
  if (requestParents.length > 1 || (requestParents.length === 1 && requestParents[0] !== parentId))
    return fail("conflicting_request_parent");
  return {
    safe: true, reason: "uniquely_confirmed_autonomous_i4",
    parentId, repairLink: requestParents.length === 0, repairParentOwner: owners.length === 0,
  };
}
