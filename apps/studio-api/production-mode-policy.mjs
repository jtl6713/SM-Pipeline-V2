/**
 * #3094 staged Production routing contract. Pure policy; no DB, queue or
 * publishing writes. Wire only after canonical mode persistence/readback
 * and legacy reconciliation have been implemented.
 */
export const PRODUCTION_MODES = Object.freeze({
  AUTOMATIC: "automatic", MANUAL: "manual",
});
const { AUTOMATIC, MANUAL } = PRODUCTION_MODES;
const valid = mode => mode === AUTOMATIC || mode === MANUAL;
const dedicated = kind => kind === "scripted-short" || kind === "finished-video";

/** kind is established by the authenticated server entrypoint, not a client field. */
export function newProductionMode({ kind, requestedMode } = {}) {
  if (dedicated(kind)) {
    if (requestedMode != null && requestedMode !== AUTOMATIC) {
      throw new Error("Dedicated workflows require automatic Production");
    }
    return AUTOMATIC;
  }
  if (kind !== "idea") throw new Error("Unknown Production entrypoint");
  if (requestedMode == null) return AUTOMATIC;
  if (!valid(requestedMode)) throw new Error("Invalid Production mode");
  return requestedMode;
}

/**
 * Canonical persisted modes only. No default on reads: a legacy null must not
 * silently become permission to auto-promote. A linked request must agree
 * with its owning Idea; conflicts require reconciliation outside Production.
 * A dedicated origin can never gain manual editor authority.
 */
export function productionRouting({
  kind, ideaMode, requestMode, linkedRequest = false, ownershipVerified = false,
} = {}) {
  let mode = null;
  let reason = "legacy_or_unverified_mode";
  if (ownershipVerified && dedicated(kind)) {
    if (requestMode === AUTOMATIC && linkedRequest === true
        && (ideaMode == null || ideaMode === AUTOMATIC)) {
      mode = AUTOMATIC; reason = "dedicated_automatic";
    } else reason = "dedicated_mode_needs_reconciliation";
  } else if (ownershipVerified && kind === "idea" && valid(ideaMode)) {
    if (!linkedRequest || requestMode === ideaMode) {
      mode = ideaMode; reason = "canonical_idea_mode";
    } else reason = "idea_request_mode_conflict";
  }
  return Object.freeze({
    mode, reason,
    showInProduction: mode === MANUAL,
    eligibleForAutomaticProduction: mode === AUTOMATIC,
    eligibleForManualProductionReview: mode === MANUAL,
    // Mode is not job admission, approval, or authorization.
    operationallyVisible: true,
    factoryApprovalRequired: true,
    schedulingAuthorized: false,
    publishingAuthorized: false,
  });
}
