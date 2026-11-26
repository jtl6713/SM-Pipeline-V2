/**
 * #3094 HTTP editor boundary. Internal production functions retain their
 * existing authorization and leases; a browser cannot select an internal
 * context by supplying a header, query flag, origin or payload.
 *
 * Keep disabled until dedicated upload/storyboard routes and browser callers
 * have been separated and the full activation matrix has passed.
 */
import { productionModeRoutingEnabled, assertManualListSchemaReady, manualProductionRowVerified } from "./manual-production-list.mjs";
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
export const EDITOR_GUARD_FLAG="STUDIO_PRODUCTION_EDITOR_GUARD";
export const MANUAL_CREATE_FLAG="STUDIO_MANUAL_IDEA_CREATE";
export function editorGuardEnabled(env) {
  return env?.[EDITOR_GUARD_FLAG]==="true";
}
export function assertEditorGuardReady(env) {
  if (!editorGuardEnabled(env)) throw new Error("Production editor boundary disabled");
  assertManualListSchemaReady(env);
}
export function manualIdeaCreateEnabled(env) {
  return productionModeCaptureEnabled(env)&&productionModeRoutingEnabled(env)&&
    editorGuardEnabled(env)&&env?.[MANUAL_CREATE_FLAG]==="true";
}
const idPattern="rec[A-Za-z0-9]{14}";
const exactRequest=new RegExp("^/api/production-requests/("+idPattern+")(?:/|$)");
const exactOutput=new RegExp("^/api/production-request-outputs/("+idPattern+")$");
const ideaDraft=new RegExp("^/api/ideas/("+idPattern+")/production-request$");
export function classifyProductionEditorHttp(pathname,method,searchParams) {
  const path=String(pathname||"");
  const verb=String(method||"").toUpperCase();
  if (path==="/api/production-requests"&&verb==="POST") return {kind:"create_request"};
  const idea=ideaDraft.exec(path);
  if(idea) return {kind:"idea_draft",id:idea[1]};
  const out=exactOutput.exec(path);
  if(out) return {kind:"output",id:out[1]};
  const match=exactRequest.exec(path);
  if(!match) return null;
  // Only the existing bounded GET projection is operational; all full or
  // light document reads, edits, media and approval routes are editor access.
  if(path==="/api/production-requests/"+match[1]&&verb==="GET"&&
      String(searchParams?.get("fields")||"").trim().toLowerCase()==="producer-progress")
    return null;
  return {kind:"request",id:match[1]};
}
/** An explicit selection is never silently dropped when capture is off. */
export function parseNewIdeaModeChoice(env,{source,requestedMode,canConfigure=false}={}) {
  if(requestedMode===undefined||requestedMode===null) return "automatic";
  if(requestedMode!=="automatic"&&requestedMode!=="manual") throw new Error("Invalid Production mode");
  if(requestedMode==="automatic") return requestedMode;
  if(source!=="idea"||!canConfigure) throw new Error("Manual Production requires an authorized ordinary Idea");
  if(!manualIdeaCreateEnabled(env)) throw new Error("Manual Production opt-in is not yet enabled");
  return requestedMode;
}

const isRecordId=id=>new RegExp("^"+idPattern+"$").test(String(id||""));
export function editorAuthorityQuery(id) {
  if(!isRecordId(id)) throw new Error("Invalid exact Production Request ID");
  const select="id,airtable_record_id,organization_id,brand_id,idea_candidate_id,request_status,origin,production_notes,publish_status,organizations(id,airtable_record_id),brands(id,airtable_record_id),idea_candidates!inner(id,airtable_record_id,production_mode,production_source,content_profile_id,content_profiles(id,airtable_record_id))";
  return "production_requests?"+new URLSearchParams({airtable_record_id:"eq."+id,select,limit:"2"});
}
export function manualEditorAuthority(row,{requestId,organizationId,profiles}={}) {
  const owner=row?.idea_candidates;
  const profile=owner?.content_profiles;
  if(row?.airtable_record_id!==requestId||!isRecordId(requestId)||!isRecordId(organizationId)||
     !owner?.id||row.idea_candidate_id!==owner.id||!isRecordId(owner.airtable_record_id)||
     !profile?.id||owner.content_profile_id!==profile.id||!isRecordId(profile.airtable_record_id)||
     !row.organizations?.id||row.organization_id!==row.organizations.id||
     row.organizations.airtable_record_id!==organizationId||!row.brands?.id||
     row.brand_id!==row.brands.id||!isRecordId(row.brands.airtable_record_id)) return false;
  const authorized=Array.isArray(profiles)&&profiles.some(p=>p.id===profile.airtable_record_id&&
      p.brandIds?.includes(row.brands.airtable_record_id));
  if(!authorized) return false;
  // Reuse the exact same mode, dedicated-origin, status and active gates as the list.
  return manualProductionRowVerified(row,{profileUuid:profile.id,organizationUuid:row.organizations.id,brandUuids:[row.brands.id]});
}

export function childEditorAuthorityQuery(id) {
  if(!isRecordId(id)) throw new Error("Invalid exact Production Request Output ID");
  return "production_request_outputs?"+new URLSearchParams({airtable_record_id:"eq."+id,
    select:"airtable_record_id,production_request_id,organization_id,brand_id,production_request_airtable_id,production_request_airtable_ids,production_requests(id,airtable_record_id)",limit:"2"});
}
export function childEditorParent(row,id) {
  const parent=row?.production_requests;
  if(row?.airtable_record_id!==id||!isRecordId(id)||!parent?.id||
      row.production_request_id!==parent.id||!isRecordId(parent.airtable_record_id)) return null;
  // Reject compatibility linkage disagreements: the downstream editor still
  // consumes those fields and must never mutate a different parent.
  const links=[...new Set([row.production_request_airtable_id,
    ...(Array.isArray(row.production_request_airtable_ids)?row.production_request_airtable_ids:[])].filter(Boolean))];
  if(links.length!==1||links[0]!==parent.airtable_record_id) return null;
  return parent.airtable_record_id;
}
/** Pure HTTP boundary with injected canonical reads and no write operations. */
export async function verifyEditorHttpAccess({route,requestId,scope,read,loadIdea}={}) {
  if(!route) return true;
  if(route.kind==="create_request"||route.kind==="idea_draft") {
    const id=route.id||requestId;
    if(!isRecordId(id)) return false;
    const idea=await loadIdea(id);
    return idea?.id===id&&idea?.fields?.Studio_Production_Mode==="manual"&&
      idea?.fields?.Studio_Production_Source==="idea";
  }
  let id=route.id,child=null;
  if(route.kind==="output") {
    const rows=await read(childEditorAuthorityQuery(id));
    if(!Array.isArray(rows)||rows.length!==1) return false;
    child=rows[0];id=childEditorParent(child,id);
    if(!id)return false;
  }else if(route.kind!=="request")return false;
  const rows=await read(editorAuthorityQuery(id));
  if(!Array.isArray(rows)||rows.length!==1)return false;
  const row=rows[0];
  if(child&&(child.production_request_id!==row.id||
      child.organization_id!==row.organization_id||child.brand_id!==row.brand_id))return false;
  return manualEditorAuthority(row,{...scope,requestId:id});
}
