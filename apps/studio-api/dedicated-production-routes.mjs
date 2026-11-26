/** Dedicated Finished Video transport. The public ordinary editor never accepts a scope
 * header/query as an internal-authority escape hatch. Each alias has a narrow
 * method/path allowlist and an exact canonical source/owner check. */
import { exactEditorOwnership, editorAuthorityQuery, ideaEditorAuthorityQuery } from "./production-editor-boundary.mjs";
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
import { isAzFinishedVideoOrigin } from "./az-finished-video.mjs";
import { automaticEzIntakeEnabled, verifiedAutomaticEzDraftInput } from "./automatic-ez-intake.mjs";

export const dedicatedProductionRoutesEnabled=env=>productionModeCaptureEnabled(env)&&
  env?.STUDIO_DEDICATED_PRODUCTION_ROUTES==="true";
const rec=/^rec[A-Za-z0-9]{14}$/;
const readFinished=new Set(["record","item4","assets","outputs","plan","variants"]);
function finishedAllowed(op,verb) {
  if(verb==="GET")return readFinished.has(op);
  // AZ already owns its settings and upload operations. Never expose
  // ordinary promotion, conversation, or generic media-library substitution.
  if(verb==="PATCH")return op==="record";
  if(verb==="POST")return ["assets","assets/upload-session","plan","variants"].includes(op)||
    /^assets\/upload-session\/[A-Za-z0-9_-]+\/complete$/.test(op)||
    /^assets\/[A-Za-z0-9_-]+\/poster$/.test(op);
  if(verb==="PUT")return op==="outputs"||/^assets\/upload-session\/[A-Za-z0-9_-]+\/parts\/\d+$/.test(op);
  if(verb==="DELETE")return /^assets\/upload-session\/[A-Za-z0-9_-]+$/.test(op);
  return false;
}
export function dedicatedProductionRoute(path,method) {
  const verb=String(method||"GET").toUpperCase();
  if(path==="/api/automatic-ez/production-requests")
    return {kind:"automatic_ez_create",allowed:verb==="POST",path:"/api/production-requests"};
  if(path.startsWith("/api/automatic-ez/production-requests/"))
    return {kind:"invalid",allowed:false};
  if(path==="/api/finished-video/production-requests")
    return {kind:"finished_create",allowed:verb==="POST",path:"/api/production-requests"};
  const finished=/^\/api\/finished-video\/production-requests\/(rec[A-Za-z0-9]+)(?:\/(.*))?$/.exec(path);
  if(finished)return {kind:"finished_request",id:finished[1],allowed:rec.test(finished[1])&&finishedAllowed(finished[2]||"record",verb),
    path:"/api/production-requests/"+finished[1]+(finished[2]?"/"+finished[2]:"")};
  if(path.startsWith("/api/finished-video/production-requests/"))
    return {kind:"invalid",allowed:false};
  return null;
}
export function dedicatedRouteEnabled(env,route) {
  return route?.kind==="automatic_ez_create" ? automaticEzIntakeEnabled(env) : dedicatedProductionRoutesEnabled(env);
}
const one=rows=>Array.isArray(rows)&&rows.length===1?rows[0]:null;
function dedicatedIdeaAuthority(row,id,source,scope) {
  const profile=row?.content_profiles;
  return row?.airtable_record_id===id&&rec.test(id)&&row.production_source===source&&row.production_mode==="automatic"&&
    profile?.id&&row.content_profile_id===profile.id&&rec.test(profile.airtable_record_id)&&
    scope?.profiles?.some(p=>p.id===profile.airtable_record_id&&p.brandIds?.length>0);
}
export async function verifyDedicatedProductionAccess({route,body,scope,read,loadIdea}) {
  if(!route?.allowed)return false;
  if(route.kind==="finished_request") {
    const row=one(await read(editorAuthorityQuery(route.id)));
    if(!exactEditorOwnership(row,{...scope,requestId:route.id}))return false;
    const owner=row.idea_candidates;
    return owner.production_source==="finished_video"&&owner.production_mode==="automatic"&&
      isAzFinishedVideoOrigin(row.production_notes);
  }
  const id=body?.idea_record_id;
  if(!rec.test(String(id||"")))return false;
  const source=route.kind==="finished_create"?"finished_video":route.kind==="automatic_ez_create"?"idea":null;
  if(!source)return false;
  // Dedicated finished creation must carry the existing AZ contract, not a
  // new mode inferred from a filename or arbitrary generic request.
  if(source==="finished_video"&&!isAzFinishedVideoOrigin(body?.production_notes))return false;
  const row=one(await read(ideaEditorAuthorityQuery(id)));
  if(!dedicatedIdeaAuthority(row,id,source,scope))return false;
  const idea=await loadIdea(id);
  if (route.kind==="automatic_ez_create" && (!verifiedAutomaticEzDraftInput(idea,body) || body.content_profile_id!==row.content_profiles.airtable_record_id)) return false;
  const fields=idea?.fields;
  return idea?.id===id&&fields?.Studio_Production_Mode==="automatic"&&fields?.Studio_Production_Source===source&&
    Array.isArray(fields.Content_Profile)&&fields.Content_Profile.length===1&&fields.Content_Profile[0]===row.content_profiles.airtable_record_id;
}
