/**
 * Server-to-server AP1-IG dispatch ownership claim. OFF by default.
 *
 * The exact R2 output-approval lock is shared with Rendering Review admission,
 * Factory and Pipeline approval. The caller only receives success AFTER
 * Airtable independently confirms Publish_Locked_By and irreversible-start
 * markers. No Graph API call, public post or review-hold release occurs here.
 */
import {renderingReviewHoldPresent} from "./rendering-review-publication-hold.mjs";

const outputIdRe=/^rec[A-Za-z0-9]{14}$/;
const requestIdRe=/^[A-Za-z0-9_-]{8,120}$/;
const CHICAGO="recT2rbKX3MF7cVFU";
const OUTPUT_OWNER="AP1-IG";
const text=x=>String(x??"").trim();
function deny(code,message,status=409){
  const e=new Error(message);e.code=code;e.status=status;throw e;
}
export function igDispatchClaimEnabled(env){
  return env?.RENDERING_REVIEW_IG_DISPATCH_CLAIM_ENABLED==="true" &&
    env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true" &&
    env?.RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED==="true";
}
async function secretEquals(a,b){
  if(typeof a!=="string"||typeof b!=="string"||b.length<24)return false;
  const h=async x=>new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(x)));
  const [v,w]=await Promise.all([h(a),h(b)]);
  let mismatch=0;
  for(let i=0;i<v.length;i++)mismatch|=v[i]^w[i];
  return mismatch===0;
}
function oneRecordLink(v){
  return Array.isArray(v)&&v.length===1&&outputIdRe.test(v[0])?v[0]:null;
}
/** Caller constructs every operation and supplies protected config, never user claims. */
export async function claimChicagoInstagramDispatch({
  request,env,readOutput,readContentItem,patchOutput,withOutputLock,now=()=>new Date(),
}){
  if(!igDispatchClaimEnabled(env))
    deny("DISPATCH_CLAIM_DISABLED","Shared IG dispatch claim disabled",405);
  if(request?.method!=="POST")
    deny("METHOD_NOT_ALLOWED","POST required",405);
  if(!await secretEquals(text(request.headers?.get("X-Review-Dispatch-Token")),
    text(env?.RENDERING_REVIEW_DISPATCH_SHARED_SECRET)))
    deny("INTERNAL_AUTH_DENIED","Protected publisher identity required",403);
  if(!/application\/json(?:\s*;|$)/i.test(text(request.headers?.get("Content-Type"))))
    deny("INVALID_CONTENT_TYPE","JSON required",415);
  const raw=await request.text();
  if(raw.length>1200)deny("CLAIM_TOO_LARGE","Dispatch request too large",413);
  let input;
  try{input=JSON.parse(raw);}catch{deny("BAD_JSON","Invalid dispatch request",400);}
  if(!input||Array.isArray(input)||typeof input!=="object"||
     Object.keys(input).length!==4||
     Object.keys(input).some(k=>!["output_id","expected_publish_asset_url",
       "expected_final_file_id","client_request_id"].includes(k))||
     !outputIdRe.test(text(input.output_id))||
     !requestIdRe.test(text(input.client_request_id))||
     typeof input.expected_publish_asset_url!=="string"||
     input.expected_publish_asset_url.length>2200||
     !input.expected_publish_asset_url.startsWith("https://")||
     typeof input.expected_final_file_id!=="string"||
     input.expected_final_file_id.length>255)
    deny("INVALID_CLAIM","Exact output, immutable asset and client request ID required",400);
  for(const [key,value] of Object.entries({readOutput,readContentItem,patchOutput,withOutputLock}))
    if(typeof value!=="function")deny("DISPATCH_CLAIM_UNAVAILABLE",
      "Trusted "+key+" adapter unavailable",503);
  return withOutputLock(input.output_id,async()=>{
    // The same lock MUST protect manual admission's hold claim and this
    // publisher's first Publish_Locked_By write. Do not add a legacy fallback.
    const original=await readOutput(input.output_id);
    if(original?.id!==input.output_id||!original.fields)
      deny("OUTPUT_UNAVAILABLE","Exact authoritative output unreadable",503);
    const f=original.fields;
    const linked=oneRecordLink(f.Content_Item);
    if(!linked)deny("CONTENT_IDENTITY_MISSING","One Content Item required");
    const content=await readContentItem(linked);
    if(content?.id!==linked || oneRecordLink(content.fields?.Content_Profile)!==CHICAGO)
      deny("NOT_CHICAGO_REEL","Shared claim is Chicago Instagram Reels only",403);
    if(text(f.Platform)!=="Instagram"||text(f.Platform_Output_Type)!=="Instagram Reel")
      deny("NOT_INSTAGRAM_REEL","Unsupported publishing output",403);
    if(text(f.Output_Status)!=="Approved for Publishing"||
       text(f.Review_Status)!=="Approved"||
       text(f.Publish_Status)!=="Ready to Publish"||
       text(f.Publish_Method)!=="Automated"||
       f.Auto_Publish_Enabled!==true||f.Do_Not_Publish===true)
      deny("OUTPUT_NOT_READY","Existing approval/publishing controls reject claim");
    if(renderingReviewHoldPresent(k=>f[k]))
      deny("REVIEW_HOLD_ACTIVE","Review owns publication hold");
    if(f.Publish_Locked_By||f.Publish_Locked_At||f.Publish_Started_At||
       f.Published_At||f.Platform_Post_ID||f.Platform_Post_URL||f.Platform_Media_ID)
      deny("DISPATCH_ALREADY_OWNED","Output already dispatched or owned");
    if(text(f.Publish_Asset_URL)!==input.expected_publish_asset_url||
       text(f.Final_File_ID)!==input.expected_final_file_id||
       !text(f.Final_File_ID||f.Final_File_URL))
      deny("ARTIFACT_CHANGED","Original media identity changed");
    const stamp=now().toISOString();
    await patchOutput(input.output_id,{
      Publish_Locked_By:OUTPUT_OWNER,Publish_Locked_At:stamp,
      Publish_Started_At:stamp,Publish_Status:"Publishing",
    });
    // A network timeout or ambiguous PATCH response must never be treated as
    // permission to create an Instagram container.
    const saved=await readOutput(input.output_id);
    const after=saved?.fields||{};
    if(saved?.id!==input.output_id || after.Publish_Locked_By!==OUTPUT_OWNER ||
       after.Publish_Locked_At!==stamp||after.Publish_Started_At!==stamp||
       text(after.Publish_Status)!=="Publishing"||
       text(after.Publish_Asset_URL)!==input.expected_publish_asset_url||
       text(after.Final_File_ID)!==input.expected_final_file_id||
       renderingReviewHoldPresent(k=>after[k]))
      deny("CLAIM_READBACK_FAILED","Publisher claim not independently verified",503);
    return {ok:true,output_id:input.output_id,owner:OUTPUT_OWNER,
      publish_started_at:stamp,claim_id:input.client_request_id,
      review_hold_active:false,remote_media_created:false};
  });
}
