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
