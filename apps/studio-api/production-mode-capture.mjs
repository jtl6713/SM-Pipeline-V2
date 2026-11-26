import { initialProductionMode, productionRouting } from "./production-mode-policy.mjs";

// Capture is intentionally separate from routing/activation. Enabling this
// flag only records mode metadata on newly created Ideas.
export const PRODUCTION_MODE_CAPTURE_FLAG = "STUDIO_PRODUCTION_MODE_CAPTURE";
export const MODE_FIELD = "Studio_Production_Mode";
export const SOURCE_FIELD = "Studio_Production_Source";
export function productionModeCaptureEnabled(env) {
  return env?.[PRODUCTION_MODE_CAPTURE_FLAG] === "true";
}
export function ideaProductionModeSelect(env) {
  return productionModeCaptureEnabled(env) ? ",production_mode,production_source" : "";
}

// The caller is a trusted, authorized server creation entrypoint. The user
// cannot choose manual yet: claim and editor boundaries must land first.
export function newIdeaProductionCapture(env, source) {
  if (!productionModeCaptureEnabled(env)) return {};
  return {[MODE_FIELD]:initialProductionMode({source}),[SOURCE_FIELD]:source};
}

// Only new POST rows can carry this internal capture marker. Generic edits,
// retries, and legacy JSON bags cannot overwrite typed authority.
export function splitIdeaProductionCapture(env, fields, {creating=false}={}) {
  const clean={...(fields||{})};
  const mode=clean[MODE_FIELD],source=clean[SOURCE_FIELD];
  delete clean[MODE_FIELD];
  delete clean[SOURCE_FIELD];
  let typed={};
  if (productionModeCaptureEnabled(env) && creating &&
      (mode!==undefined || source!==undefined)) {
    if (mode!==initialProductionMode({source}) || mode!=="automatic")
      throw new Error("Invalid new Idea Production capture");
    typed={production_mode:mode,production_source:source};
  }
  return {fields:clean,typed};
}

// Never trust a legacy JSON bag or a half-populated typed pair. Projection is
// read-only; no routing or scheduling authority is granted here.
export function projectIdeaProductionMode(row, fields={}) {
  const clean={...fields};
  delete clean[MODE_FIELD];
  delete clean[SOURCE_FIELD];
  const route=productionRouting({source:row?.production_source,persistedMode:row?.production_mode});
  if (route.source && route.mode && route.mode===row?.production_mode) {
    clean[MODE_FIELD]=route.mode;
    clean[SOURCE_FIELD]=route.source;
  }
  return clean;
}

/** Only the canonical shaped record can veto legacy automatic admission.
 * Null legacy mode grants no new authority; existing eligibility remains intact.
 */
export function isExplicitManualIdea(idea) {
  return idea?.fields?.[SOURCE_FIELD]==="idea" && idea.fields[MODE_FIELD]==="manual";
}
