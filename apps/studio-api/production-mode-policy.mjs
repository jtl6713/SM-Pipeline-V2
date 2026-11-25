/**
 * #3094: shared Production routing policy, deliberately independent of
 * Idea acceptance, media readiness, leases, and publishing authorization.
 * Source/mode must be obtained from canonical, authorized server state.
 * No runtime caller may infer manual intent from missing legacy data.
 *
 * This is the policy foundation, not a rollout switch.
 */
export const PRODUCTION_MODES = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL: "manual",
});

export const PRODUCTION_SOURCES = Object.freeze({
  IDEA: "idea",
  SCRIPT_A_SHORT: "script_a_short",
  FINISHED_VIDEO: "finished_video",
});

const { AUTOMATIC, MANUAL } = PRODUCTION_MODES;
const { IDEA, SCRIPT_A_SHORT, FINISHED_VIDEO } = PRODUCTION_SOURCES;
const dedicated = source => source === SCRIPT_A_SHORT || source === FINISHED_VIDEO;
const knownSource = source => source === IDEA || dedicated(source);
const knownMode = mode => mode === AUTOMATIC || mode === MANUAL;

/**
 * Call only at an authorized new-idea boundary. AI and dedicated flows
 * cannot opt into Manual Production. Existing records must not call this
 * function just because their persisted mode is missing.
 */
export function initialProductionMode({ source, requestedMode, humanChoice = false } = {}) {
  if (!knownSource(source)) throw new Error("Unknown Production source");
  if (requestedMode != null && !knownMode(requestedMode)) {
    throw new Error("Invalid Production mode");
  }
  if (requestedMode === MANUAL) {
    if (source !== IDEA || humanChoice !== true) {
      throw new Error("Manual Production requires explicit human Idea opt-in");
    }
    return MANUAL;
  }
  return AUTOMATIC;
}

/**
 * Read-side contract. Unclassified legacy ordinary Ideas stay unresolved
 * until explicitly reconciled; they do not become manual or auto eligible.
 * A dedicated source can never enter the ordinary Production editor even
 * if a stale or corrupt client wrote a manual mode.
 */
export function productionRouting({ source, persistedMode } = {}) {
  const mode = dedicated(source) ? AUTOMATIC :
    source === IDEA && knownMode(persistedMode) ? persistedMode : null;
  const manual = source === IDEA && mode === MANUAL;
  const automatic = knownSource(source) && mode === AUTOMATIC;
  return Object.freeze({
    source: knownSource(source) ? source : null,
    mode,
    ordinary_production_visible: manual,
    ordinary_production_mutation_allowed_by_mode: manual,
    automatic_candidate: automatic,
    needs_legacy_reconciliation: mode === null,
    operational_monitoring_visible: true,
    // A routing decision is NEVER an approval or a provider authorization.
    approval_policy: source === FINISHED_VIDEO
      ? "preserve_existing_finished_video_mode"
      : knownSource(source) ? "human_factory" : "unresolved",
    grants_scheduling_or_publishing_authority: false,
  });
}

/**
 * The caller still must perform all existing eligibility, tenant, and
 * execution-claim checks. This prevents mode from being a substitute for them.
 */
export function canEnterAutomaticProduction({
  source, persistedMode, existingEligibilityPassed = false,
  authorizedOwnerVerified = false, leaseAdmissionGranted = false,
} = {}) {
  return productionRouting({ source, persistedMode }).automatic_candidate
    && existingEligibilityPassed === true
    && authorizedOwnerVerified === true
    && leaseAdmissionGranted === true;
}

/**
 * Pure guard for a future audited compare-and-set mode transition. The
 * booleans must come from canonical server checks, not a browser payload.
 * An actual write must repeat lease/revision fencing atomically.
 */
export function validateProductionModeChange({
  source, persistedMode, requestedMode, humanChoice = false,
  authorizedOwnerVerified = false, safeLeaseBoundary = false,
  editableIdea = false,
} = {}) {
  if (source !== IDEA || humanChoice !== true || authorizedOwnerVerified !== true) {
    throw new Error("Production mode changes require an authorized human Idea");
  }
  if (!knownMode(requestedMode)) throw new Error("Invalid Production mode");
  if (safeLeaseBoundary !== true || editableIdea !== true) {
    throw new Error("Production mode cannot change while the Idea is in flight or locked");
  }
  return Object.freeze({
    previous_mode: knownMode(persistedMode) ? persistedMode : null,
    next_mode: requestedMode,
    requires_audit_and_compare_and_set: true,
  });
}
