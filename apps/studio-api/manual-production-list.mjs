/**
 * #3094 manual-only ordinary Production read boundary.
 * Pure query/receipt validation; do not use this to filter Home, Pipeline,
 * Quality Agent, or worker queues. The caller resolves an authorized profile,
 * organization and brands before providing canonical UUIDs.
 */
import { productionRouting } from "./production-mode-policy.mjs";
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
export const PRODUCTION_MODE_ROUTING_FLAG="STUDIO_PRODUCTION_MODE_ROUTING";
export function productionModeRoutingEnabled(env) {
  return env?.[PRODUCTION_MODE_ROUTING_FLAG] === "true";
}
export function assertManualListSchemaReady(env) {
  if (!productionModeRoutingEnabled(env) || !productionModeCaptureEnabled(env))
    throw new Error("Production mode routing is not ready");
}
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const recordId=value=>typeof value==="string"&&/^rec[A-Za-z0-9]{14}$/.test(value);
const ordinaryStatuses=new Set(["Draft","Ready","Submitted"]);
const deniedOrigins=["az-finished-video","scripted-short","story-first","script_a_short","finished_video"];
const deniedNotes=["origin=az-finished-video","ez-input=finished-video","[story-first-production.1]","scripted-short="];
function checkedScope(scope) {
  if (!uuid(scope?.profileUuid)||!uuid(scope?.organizationUuid)||!Array.isArray(scope?.brandUuids)
      || !scope.brandUuids.length || scope.brandUuids.some(id=>!uuid(id)))
    throw new Error("Canonical authorized Production list scope is required");
  return scope;
}
export function manualProductionListQuery({scope,requestSelect,limit=100}) {
  const {profileUuid,organizationUuid,brandUuids}=checkedScope(scope);
  if (typeof requestSelect!=="string"||!requestSelect.includes("idea_candidates(airtable_record_id)"))
    throw new Error("Production request select contract unavailable");
  const select=requestSelect.replace("idea_candidates(airtable_record_id)",
    "idea_candidates!inner(id,airtable_record_id,content_profile_id,production_mode,production_source,candidate_title)")+",origin";
  const clauses=[
    "or(request_status.in.(Draft,Ready,Submitted),and(request_status.eq.Promoted,production_notes.like.*[factory-revision-open]*))",
    "or(publish_status->>Active.is.null,publish_status->>Active.neq.false)",
    "or(publish_status->>Test_Run_ID.is.null,publish_status->>Test_Run_ID.eq.)",
    "or(origin.is.null,origin.not.in.("+deniedOrigins.join(",")+"))",
    "or(production_notes.is.null,and("+deniedNotes.map(note=>"production_notes.not.ilike.*"+note+"*").join(",")+"))",
  ];
  const params=new URLSearchParams({
    select,
    organization_id:"eq."+organizationUuid,
    brand_id:"in.("+[...new Set(brandUuids)].join(",")+")",
    "idea_candidates.content_profile_id":"eq."+profileUuid,
    "idea_candidates.production_mode":"eq.manual",
    "idea_candidates.production_source":"eq.idea",
    and:"("+clauses.join(",")+")",
    order:"updated_at.desc.nullslast,airtable_record_id.asc",
    limit:String(Math.max(1,Math.min(100,Math.floor(Number(limit)||100)))),
  });
  return "production_requests?"+params.toString();
}
/** Independent exact canonical FK/readback checks. No legacy bag grants mode. */
export function manualProductionRowVerified(row,scope) {
  const {profileUuid,organizationUuid,brandUuids}=checkedScope(scope);
  const idea=row?.idea_candidates;
  if (!recordId(row?.airtable_record_id)||!uuid(row?.idea_candidate_id)||
      !idea||idea.id!==row.idea_candidate_id||!recordId(idea.airtable_record_id)||
      idea.content_profile_id!==profileUuid||row.organization_id!==organizationUuid||
      !brandUuids.includes(row.brand_id)) return false;
  if (!productionRouting({source:idea.production_source,persistedMode:idea.production_mode}).ordinary_production_visible)
    return false;
  const notes=String(row.production_notes||"");
  if (deniedOrigins.includes(String(row.origin||"").toLowerCase()) ||
      deniedNotes.some(marker=>notes.toLowerCase().includes(marker))) return false;
  if (!ordinaryStatuses.has(row.request_status) &&
      !(row.request_status==="Promoted"&&notes.split(/\r?\n/).some(line=>line.trim().startsWith("[factory-revision-open]")))) return false;
  const bag=row.publish_status||{};
  return !String(bag.Test_Run_ID||"").trim() && String(bag.Active??true).toLowerCase()!=="false";
}
