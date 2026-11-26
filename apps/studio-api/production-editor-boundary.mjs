/**
 * #3094 HTTP editor boundary. Internal production functions retain their
 * existing authorization and leases; a browser cannot select an internal
 * context by supplying a header, query flag, origin or payload.
 *
 * Keep disabled until dedicated upload/storyboard routes and browser callers
 * have been separated and the full activation matrix has passed.
 */
import { productionModeRoutingEnabled, assertManualListSchemaReady } from "./manual-production-list.mjs";
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
