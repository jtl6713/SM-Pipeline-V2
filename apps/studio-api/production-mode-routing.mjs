import { productionModeCaptureEnabled, MODE_FIELD, SOURCE_FIELD } from "./production-mode-capture.mjs";

// Keep the visibility rollout independent of capture while legacy/manual
// records and dedicated editor entrypoints are reconciled.
export function manualProductionListEnabled(env) {
  return productionModeCaptureEnabled(env) && env?.STUDIO_MANUAL_PRODUCTION_LIST === "true";
}

// This is a DENY fence, not a grant. Existing legacy eligibility remains
// unchanged; an unknown mode does not acquire any new authority.
export function blocksAutonomousProduction(idea) {
  return idea?.fields?.[MODE_FIELD] === "manual"
    && idea?.fields?.[SOURCE_FIELD] === "idea";
}

export function autoLaneModeFilter(env, lane) {
  if (!productionModeCaptureEnabled(env) || !["ready_production", "photo_ready"].includes(lane)) return "";
  // NULL legacy records retain their existing (unchanged) eligibility;
  // this filter must not be used for operational counts or photo matching.
  return "&or=(production_mode.is.null,production_mode.neq.manual)";
}

const recordId = /^rec[A-Za-z0-9]{14}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const dedicatedNotes = /(?:^|[;\s])(?:origin=az-finished-video|scripted-short=|ez-input=vibe-cut)|\[story-first-production\.1\]/i;

/** Strict authorized list query; all canonical scope/mode filters precede limit.
 * Existing dashboard, Factory, recovery and diagnostic queries do not use it.
 * Scope values must be resolved by the authorized server caller.
 */
export function manualProductionListQuery({ profileUuid, orgRecordId, brandRecordIds, limit } = {}) {
  const brands = [...new Set(Array.isArray(brandRecordIds) ? brandRecordIds : [])];
  if (!uuid.test(String(profileUuid || "")) || !recordId.test(String(orgRecordId || ""))
    || !brands.length || brands.some(id => !recordId.test(String(id)))) {
    throw new Error("Manual Production scope is unavailable");
  }
  const cap = Math.max(1, Math.min(100, Math.floor(Number(limit) || 100)));
  // Lean fields only. Do not fetch entire master/variant/render manifests in
  // this list. The typed FK joins are mandatory, not nullable bag lookups.
  const select = [
    "id","airtable_record_id","production_request_id","idea_candidate_id",
    "request_status","requested_title","production_notes","master_asset_status",
    "output_plan_status","variant_status","publish_status","created_at","updated_at",
    "idea_candidates!inner(airtable_record_id,content_profile_id,production_mode,production_source,candidate_title)",
    "organizations!inner(airtable_record_id)","brands!inner(airtable_record_id)",
  ].join(",");
  return "production_requests?select=" + select
    + "&idea_candidates.production_mode=eq.manual"
    + "&idea_candidates.production_source=eq.idea"
    + "&idea_candidates.content_profile_id=eq." + encodeURIComponent(profileUuid)
    + "&organizations.airtable_record_id=eq." + encodeURIComponent(orgRecordId)
    + "&brands.airtable_record_id=in.(" + brands.map(encodeURIComponent).join(",") + ")"
    + "&or=(request_status.in.(Draft,Ready,Submitted),and(request_status.eq.Promoted,production_notes.like.*%5Bfactory-revision-open%5D*))"
    + "&and=(or(production_notes.is.null,and(production_notes.not.ilike.*origin=az-finished-video*,production_notes.not.ilike.*scripted-short=*,production_notes.not.ilike.*ez-input=vibe-cut*,production_notes.not.like.*%5Bstory-first-production.1%5D*)))"
    + "&order=updated_at.desc.nullslast,airtable_record_id.asc&limit=" + cap;
}

/** Reverify the joined canonical identity before shaping the public response.
 * Fail closed for inconsistent/missing data, even if a query cache is stale.
 */
export function verifiedManualProductionRow(row, {profileUuid,orgRecordId,brandRecordIds} = {}) {
  const idea = row?.idea_candidates;
  const org = row?.organizations?.airtable_record_id;
  const brand = row?.brands?.airtable_record_id;
  const notes = String(row?.production_notes || "");
  const status = String(row?.request_status || "");
  const open = ["Draft","Ready","Submitted"].includes(status)
    || (status === "Promoted" && notes.includes("[factory-revision-open]"));
  if (!recordId.test(String(row?.airtable_record_id || ""))
      || !uuid.test(String(row?.idea_candidate_id || ""))
      || !recordId.test(String(idea?.airtable_record_id || ""))
      || idea?.production_mode !== "manual" || idea?.production_source !== "idea"
      || idea?.content_profile_id !== profileUuid || org !== orgRecordId
      || !Array.isArray(brandRecordIds) || !brandRecordIds.includes(brand)
      || !open || dedicatedNotes.test(notes)) return false;
  return true;
}
