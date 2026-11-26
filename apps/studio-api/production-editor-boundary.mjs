/**
 * #3094 HTTP editor boundary. Browser scope selects a *surface*, never authority.
 * Only a canonical source/mode and existing tenant membership authorize it.
 * Internal producer calls do not cross this HTTP boundary. Do not activate
 * before dedicated clients and all existing-job exceptions have been tested.
 */
import { productionModeRoutingEnabled, manualProductionRowVerified } from "./manual-production-list.mjs";
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";

export function productionEditorBoundaryEnabled(env) {
  return env?.STUDIO_PRODUCTION_MODE_EDITOR === "true";
}
export function productionEditorBoundaryReady(env) {
  return productionEditorBoundaryEnabled(env) && productionModeRoutingEnabled(env) && productionModeCaptureEnabled(env);
}

export function classifyProductionEditorRoute(url, method) {
  const verb=String(method||"GET").toUpperCase(), path=url.pathname;
  const collection=path==="/api/production-requests";
  const createIdea=path.match(/^\/api\/ideas\/(rec[A-Za-z0-9]{14})\/production-request$/);
  const exact=path.match(/^\/api\/production-requests\/(rec[A-Za-z0-9]{14})(?:\/(.*))?$/);
  const output=path.match(/^\/api\/production-request-outputs\/(rec[A-Za-z0-9]{14})$/);
  if (collection && verb!=="POST") return null; // manual-only collection has its own guard
  if (!collection&&!createIdea&&!exact&&!output) return null;
  const scopes=url.searchParams.getAll("production_scope");
  const scope=scopes.length>1 ? "invalid" : scopes[0]||"manual";
  if (collection) return {kind:"create",scope,verb,operation:"collection"};
  if (createIdea) return {kind:"create",scope,verb,operation:"idea",id:createIdea[1]};
  if (output) return {kind:"output",scope,verb,operation:"output",id:output[1]};
  const operation=exact[2]||"record";
  const safeProgress=operation==="record"&&verb==="GET"&&
    url.searchParams.getAll("fields").length===1&&url.searchParams.get("fields")==="producer-progress";
  return {kind:"request",scope:safeProgress?"progress":scope,verb,operation,id:exact[1]};
}

// Exact FK row, not a browser mode, notes substring, or cached Idea.
export function productionEditorOwnerVerified(row, allowed) {
  const idea=row?.idea_candidates;
  return Boolean(row?.airtable_record_id&&row?.idea_candidate_id&&idea?.id===row.idea_candidate_id&&
    idea.airtable_record_id&&idea.content_profile_id&&
    idea.content_profiles?.id===idea.content_profile_id&&
    allowed.profileRecordIds.includes(idea.content_profiles?.airtable_record_id)&&
    row.organization_id&&row.organizations?.id===row.organization_id&&
    row.organizations?.airtable_record_id===allowed.organizationRecordId&&
    row.brand_id&&row.brands?.id===row.brand_id&&
    allowed.brandRecordIds.includes(row.brands?.airtable_record_id));
}
export function productionEditorIdeaVerified(idea, allowed) {
  return Boolean(idea?.id&&idea?.airtable_record_id&&idea.content_profile_id&&
    idea.content_profiles?.id===idea.content_profile_id&&
    allowed.profileRecordIds.includes(idea.content_profiles?.airtable_record_id));
}
function dedicatedMode(idea,source) {
  return idea?.production_mode==="automatic"&&idea?.production_source===source;
}
const finishedRead=new Set(["record","item4","assets","outputs","plan","variants","output"]);
const finishedWrite=new Set(["record","assets","assets/upload-session","plan","variants","outputs"]);
function finishedOperationAllowed(route) {
  if (route.verb==="GET") return finishedRead.has(route.operation);
  if (route.kind==="output") return false;
  if (route.verb==="PATCH") return route.operation==="record";
  if (route.verb==="POST") return finishedWrite.has(route.operation)&&route.operation!=="record"&&route.operation!=="outputs"||
    /^assets\/upload-session\/[A-Za-z0-9_-]+\/complete$/.test(route.operation)||
    /^assets\/[A-Za-z0-9_-]+\/poster$/.test(route.operation);
  if (route.verb==="PUT") return route.operation==="outputs"||/^assets\/upload-session\/[A-Za-z0-9_-]+\/parts\/\d+$/.test(route.operation);
  if (route.verb==="DELETE") return /^assets\/upload-session\/[A-Za-z0-9_-]+$/.test(route.operation);
  return false;
}
export function productionEditorDecision(route, row, allowed) {
  if (!route) return true;
  if (route.kind==="create") {
    if (route.verb!=="POST"||!productionEditorIdeaVerified(row,allowed)) return false;
    if (route.scope==="manual") return row.production_mode==="manual"&&row.production_source==="idea";
    if (route.scope==="finished-video") return route.operation==="collection"&&dedicatedMode(row,"finished_video");
    // The storyboard endpoint still validates the exact approved storyboard.
    // This permits creation only; ordinary editor/approval is never granted.
    if (route.scope==="script-a-short") return route.operation==="idea"&&dedicatedMode(row,"script_a_short");
    return false;
  }
  if (!productionEditorOwnerVerified(row,allowed)) return false;
  if (route.scope==="progress") return route.kind==="request"&&route.operation==="record"&&route.verb==="GET";
  if (route.scope==="manual") return manualProductionRowVerified(row,{
    profileUuid:row.idea_candidates.content_profile_id,organizationUuid:row.organization_id,brandUuids:[row.brand_id],
  });
  if (route.scope==="finished-video") {
    // Preserve AZ's existing user-selected approval/scheduling logic. This
    // allowlist only admits its dedicated intake operations, not generic
    // promote, producer conversation or any scheduling/publishing action.
    return dedicatedMode(row.idea_candidates,"finished_video")&&finishedOperationAllowed(route);
  }
  return false;
}
