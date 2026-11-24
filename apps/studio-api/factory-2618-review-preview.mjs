/**
 * #2618: exact review-only cache for corrected Studio MP4s.
 *
 * A corrected Drive Final_File_ID is not automatically browser-playable:
 * Safari asks for byte ranges, while private Drive is not a stable video CDN.
 * Stage only the seven reconciled, unscheduled, non-published Factory outputs.
 * Cache bytes in PRIVATE R2 after cryptographic file verification, and stream
 * correct 206 byte ranges to the authenticated Factory preview route.
 *
 * No approval, scheduling, provider, DNP or other output write occurs.
 */
const entries = [
  [["recaV78on0RSfqb31","recgeicEbdlbmQiv5","recy1CzV4MJQycBMq"],
   "1aWyb-OkXhJ9GwWkg3VWruTaivdms6pTL",
   "cde325819144408f3341c23287637f9ab19aed9cd62c69332d91e49dd8d04875",2194946],
  [["recfwDzGh6St6WB9f"],"1KMygA91kqVv2InOcAQbCoy5IvQDjkfgH",
   "a93676f4b1cfa53e22c7cf3b677ceb2136f1366acd74de7f7a80d890d0972d67",895259],
  [["rec1PDreUDoe2AcPV","rec1kjgusW1fX9BOp","recidhGcJSfOlxMsc"],
   "1DlqSVCwMkzUVJ4bFLJDrvals8Bal3imj",
   "f1e5986c31a6032334cd47a1ad6a4555085cdaa0fa3c79b614c915d1ce91af93",17892121],
];
const byOutput=new Map(entries.flatMap(([ids,fileId,sha256,bytes])=>
  ids.map(id=>[id,{id,fileId,sha256,bytes,
    key:"studio/review-previews/issue2618/sha256-"+sha256+".mp4"}])));
const fail=(reason)=>{const error=new Error(reason);error.status=503;throw error;};

// The corrected originals are private. Do not retry with anonymous Drive URLs:
// that discards the decisive OAuth status and can return an HTML login page.
const driveFailureReasons=new Set([
  "FACTORY_2618_RUNNER_UNCONFIGURED",
  "FACTORY_2618_RUNNER_UNAVAILABLE",
  "FACTORY_2618_RUNNER_SOURCE_CHANGED",
  "FACTORY_2618_RUNNER_BUSY",
  "FACTORY_2618_RUNNER_SOURCE_UNVERIFIED",
  "FACTORY_2618_DRIVE_OAUTH_UNAVAILABLE",
  "FACTORY_2618_DRIVE_OAUTH_BINDING_EMPTY",
  "FACTORY_2618_DRIVE_OAUTH_INVALID_CLIENT",
  "FACTORY_2618_DRIVE_OAUTH_INVALID_GRANT",
  "FACTORY_2618_DRIVE_OAUTH_UNAUTHORIZED_CLIENT",
  "FACTORY_2618_DRIVE_OAUTH_INVALID_SCOPE",
  "FACTORY_2618_DRIVE_OAUTH_TOKEN_ENDPOINT_FAILED",
  "FACTORY_2618_DRIVE_OAUTH_BINDING_QUOTED",
  "FACTORY_2618_DRIVE_OAUTH_TRANSPORT_FAILED",
  "FACTORY_2618_DRIVE_OAUTH_REDIRECT_REJECTED",
  "FACTORY_2618_DRIVE_OAUTH_HTTP_400",
  "FACTORY_2618_DRIVE_OAUTH_HTTP_401",
  "FACTORY_2618_DRIVE_OAUTH_HTTP_403",
  "FACTORY_2618_DRIVE_OAUTH_HTTP_429",
  "FACTORY_2618_DRIVE_OAUTH_HTTP_4XX",
  "FACTORY_2618_DRIVE_OAUTH_HTTP_5XX",
  "FACTORY_2618_DRIVE_OAUTH_NON_JSON_SUCCESS",
  "FACTORY_2618_DRIVE_OAUTH_DELETED_CLIENT",
  "FACTORY_2618_DRIVE_OAUTH_DISABLED_CLIENT",
  "FACTORY_2618_DRIVE_OAUTH_ACCESS_DENIED",
  "FACTORY_2618_DRIVE_OAUTH_ADMIN_POLICY_ENFORCED",
  "FACTORY_2618_DRIVE_OAUTH_ORG_INTERNAL",
  "FACTORY_2618_DRIVE_OAUTH_TEMPORARILY_UNAVAILABLE",
  "FACTORY_2618_DRIVE_OAUTH_SERVER_ERROR",
  "FACTORY_2618_DRIVE_OAUTH_TOKEN_MISSING",
  "FACTORY_2618_DRIVE_OAUTH_INVALID_REQUEST",
  "FACTORY_2618_DRIVE_OAUTH_REJECTED",
  "FACTORY_2618_DRIVE_ACCESS_DENIED",
  "FACTORY_2618_DRIVE_FILE_NOT_VISIBLE",
  "FACTORY_2618_DRIVE_RATE_LIMITED",
  "FACTORY_2618_DRIVE_UPSTREAM_FAILED",
]);
// Keep provider details, credentials, and access tokens out of logs and HTTP errors.
export async function refreshIssue2618DriveToken(env,fetchImpl=fetch){
  const clientId=String(env?.GOOGLE_CLIENT_ID||"").trim();
  const clientSecret=String(env?.GOOGLE_CLIENT_SECRET||"").trim();
  const refresh=String(env?.GOOGLE_REFRESH_TOKEN||"").trim();
  if(!clientId||!clientSecret||!refresh)fail("FACTORY_2618_DRIVE_OAUTH_BINDING_EMPTY");
  // A pasted .env literal may include delimiters that dotenv removes on the runner.
  if([clientId,clientSecret,refresh].some(value=>/^["']|["']$/.test(value)))
    fail("FACTORY_2618_DRIVE_OAUTH_BINDING_QUOTED");
  let response;
  try{
    response=await fetchImpl("https://oauth2.googleapis.com/token",{
      method:"POST",redirect:"manual",
      headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
      body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,
        refresh_token:refresh,grant_type:"refresh_token"}).toString(),
    });
  }catch{fail("FACTORY_2618_DRIVE_OAUTH_TRANSPORT_FAILED");}
  // Never forward the credential-bearing request to a redirect location.
  if(response.status>=300&&response.status<400)fail("FACTORY_2618_DRIVE_OAUTH_REDIRECT_REJECTED");
  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    const known={
      invalid_client:"INVALID_CLIENT",invalid_grant:"INVALID_GRANT",
      unauthorized_client:"UNAUTHORIZED_CLIENT",invalid_scope:"INVALID_SCOPE",
      invalid_request:"INVALID_REQUEST",deleted_client:"DELETED_CLIENT",
      disabled_client:"DISABLED_CLIENT",access_denied:"ACCESS_DENIED",
      admin_policy_enforced:"ADMIN_POLICY_ENFORCED",org_internal:"ORG_INTERNAL",
      temporarily_unavailable:"TEMPORARILY_UNAVAILABLE",server_error:"SERVER_ERROR",
    };
    const code=Object.prototype.hasOwnProperty.call(known,payload?.error)?known[payload.error]:null;
    const statusCode=[400,401,403,429].includes(response.status)?"HTTP_"+response.status:
      response.status>=500?"HTTP_5XX":response.status>=400?"HTTP_4XX":"TOKEN_ENDPOINT_FAILED";
    fail("FACTORY_2618_DRIVE_OAUTH_"+(code||statusCode));
  }
  if(payload===null)fail("FACTORY_2618_DRIVE_OAUTH_NON_JSON_SUCCESS");
  const token=typeof payload?.access_token==="string"?payload.access_token.trim():"";
  if(!token)fail("FACTORY_2618_DRIVE_OAUTH_TOKEN_MISSING");
  return token;
}

export async function fetchIssue2618DriveVideo({fileId,getAccessToken,fetchImpl=fetch}){
  if(!entries.some(([,id])=>id===fileId))fail("FACTORY_2618_PROTECTED_SOURCE_UNAVAILABLE");
  let token;
  try{token=await getAccessToken();}catch(error){
    if(driveFailureReasons.has(error?.message))fail(error.message);
    fail("FACTORY_2618_DRIVE_OAUTH_UNAVAILABLE");
  }
  if(!token)fail("FACTORY_2618_DRIVE_OAUTH_UNAVAILABLE");
  let response;
  try{
    response=await fetchImpl("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+"?alt=media&supportsAllDrives=true",{
      method:"GET",headers:{Authorization:"Bearer "+token,Accept:"video/mp4,application/octet-stream"},redirect:"follow",
    });
  }catch{fail("FACTORY_2618_DRIVE_UPSTREAM_FAILED");}
  if(response.ok)return response;
  try{await response.body?.cancel();}catch{}
  const reason={401:"FACTORY_2618_DRIVE_OAUTH_REJECTED",403:"FACTORY_2618_DRIVE_ACCESS_DENIED",
    404:"FACTORY_2618_DRIVE_FILE_NOT_VISIBLE",429:"FACTORY_2618_DRIVE_RATE_LIMITED"}[response.status];
  fail(reason||"FACTORY_2618_DRIVE_UPSTREAM_FAILED");
}

// Private authenticated server-to-server transport; the runner independently
// resolves the exact output and checks canonical Supabase source + full MP4 hash.
export async function fetchIssue2618RunnerVideo({env,outputId,fileId,fetchImpl=fetch}){
  const spec=issue2618PreviewSpec(outputId);
  if(!spec||fileId!==spec.fileId)fail("FACTORY_2618_PROTECTED_SOURCE_UNAVAILABLE");
  const base=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/+$/,"");
  const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
  if(base!=="https://pipeline.chicagoshining.com"||secret.length<24)
    fail("FACTORY_2618_RUNNER_UNCONFIGURED");
  let response;
  try{
    response=await fetchImpl(base+"/jobs/factory/private-preview-source/"+encodeURIComponent(outputId),{
      method:"GET",redirect:"manual",headers:{"X-Pipeline-Secret":secret,"Accept":"video/mp4"},
      signal:AbortSignal.timeout(90000),
    });
  }catch{fail("FACTORY_2618_RUNNER_UNAVAILABLE");}
  if(response.status!==200){
    try{await response.body?.cancel();}catch{}
    fail(response.status===409?"FACTORY_2618_RUNNER_SOURCE_CHANGED":
      response.status===429?"FACTORY_2618_RUNNER_BUSY":"FACTORY_2618_RUNNER_UNAVAILABLE");
  }
  if(response.headers.get("X-Factory-Source-Sha256")!==spec.sha256||
     Number(response.headers.get("Content-Length"))!==spec.bytes||
     response.headers.get("Content-Type")!=="video/mp4"){
    try{await response.body?.cancel();}catch{}
    fail("FACTORY_2618_RUNNER_SOURCE_UNVERIFIED");
  }
  return response;
}

const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
export const issue2618PreviewSpec=id=>byOutput.get(String(id||""))||null;

export function issue2618PreviewEligible(row, spec){
  if(!row||!spec||row.airtable_record_id!==spec.id)return false;
  const handoff=row.error_messages?.SM_2618_Factory_Review_Handoff;
  const plan=row.error_messages?.SM_2618_Creative_Rework_Plan;
  return row.output_status==="Ready for Review"
    && row.review_status==="Review Sent"
    && row.publish_status==="Not Ready"
    && row.do_not_publish===false
    && row.auto_publish_enabled===false
    && !row.scheduled_post_date && !row.studio_scheduled_at
    && !row.youtube_scheduled_publish_at && !row.published_at
    && !row.platform_post_url && !row.platform_publish_response
    && row.final_file_url==="https://drive.google.com/file/d/"+spec.fileId+"/view"
    && row.error_messages?.Final_File_ID===spec.fileId
    && handoff?.corrected_final_drive_id===spec.fileId
    && handoff?.candidate_sha256===spec.sha256
    && handoff?.human_factory_approval_pending===true
    && handoff?.publishing_authorized===false
    && plan?.candidate_sha256===spec.sha256
    && !hasOwn(row.error_messages,"SM_2618_Creative_QA_Hold");
}
const validCache=(obj,spec)=>Boolean(obj
  && obj.size===spec.bytes
  && obj.customMetadata?.role==="issue2618-verified-private-review"
  && obj.customMetadata?.sourceDriveFileId===spec.fileId
  && obj.customMetadata?.sha256===spec.sha256);

function previewResponse(request,object,spec,rangeValid){
  if(!validCache(object,spec))fail("FACTORY_2618_CACHE_PROVENANCE_INVALID");
  const isPartial=rangeValid&&typeof object.range?.offset==="number";
  const h=new Headers({
    "Content-Type":"video/mp4",
    "Accept-Ranges":"bytes",
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff",
    "X-Studio-Preview-Source":"issue2618-verified-private-r2",
  });
  if(isPartial){
    const start=object.range.offset;
    const length=object.range.length??(object.size-start);
    if(length<=0)fail("FACTORY_2618_INVALID_RANGE");
    h.set("Content-Range","bytes "+start+"-"+(start+length-1)+"/"+object.size);
    h.set("Content-Length",String(length));
  } else h.set("Content-Length",String(object.size));
  return new Response(request.method==="HEAD"?null:object.body,{
    status:isPartial?206:200,headers:h,
  });
}

export async function serveIssue2618ReviewPreview({
  request,env,outputId,readRows,fetchVideo,digest=async bytes=>
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
      .map(x=>x.toString(16).padStart(2,"0")).join(""),
}){
  const spec=issue2618PreviewSpec(outputId);
  if(!spec)return null;
  if(!["GET","HEAD"].includes(request.method))fail("FACTORY_2618_PREVIEW_READ_ONLY");
  if(!env?.STUDIO_MEDIA?.head||!env.STUDIO_MEDIA?.get||!env.STUDIO_MEDIA?.put)
    fail("FACTORY_2618_PRIVATE_R2_UNAVAILABLE");
  if(typeof readRows!=="function"||typeof fetchVideo!=="function")
    fail("FACTORY_2618_PROTECTED_SOURCE_UNAVAILABLE");
  const rows=await readRows(outputId);
  if(!Array.isArray(rows)||rows.length!==1||!issue2618PreviewEligible(rows[0],spec))
    fail("FACTORY_2618_SOURCE_CHANGED_OR_UNVERIFIED");
  let head=await env.STUDIO_MEDIA.head(spec.key);
  if(head&&!validCache(head,spec))fail("FACTORY_2618_CACHE_PROVENANCE_INVALID");
  if(!head){
    // Use the runner's verified private source transport, never another
    // output's old R5 MP4 or an anonymous/public Drive URL.
    let source;
    try{
      const get=new Request("https://studio.chicagoshining.com/api/internal/issue2618-cache",{
        method:"GET",headers:{"Accept":"video/mp4"}});
      source=await fetchVideo(spec.fileId,rows[0].final_file_url,get);
    }catch(error){
      if(driveFailureReasons.has(error?.message))fail(error.message);
      fail("FACTORY_2618_DRIVE_SOURCE_NOT_ACCESSIBLE_TO_WORKER");
    }
    const type=String(source?.headers?.get("Content-Type")||"").toLowerCase();
    if(!source?.ok||!source.body||!(
      type.startsWith("video/mp4")||type.startsWith("application/octet-stream"))){
      try{await source?.body?.cancel()}catch{}
      fail("FACTORY_2618_DRIVE_MEDIA_NOT_MP4");
    }
    const bytes=await source.arrayBuffer();
    if(bytes.byteLength!==spec.bytes)fail("FACTORY_2618_FILE_SIZE_MISMATCH");
    const hash=await digest(bytes);
    if(hash!==spec.sha256)fail("FACTORY_2618_FILE_HASH_MISMATCH");
    // The source may change while the runner is fetching it. Recheck before
    // persisting an immutable private cache object; never overwrite a winner.
    const current=await readRows(outputId);
    if(!Array.isArray(current)||current.length!==1||!issue2618PreviewEligible(current[0],spec))
      fail("FACTORY_2618_SOURCE_CHANGED_OR_UNVERIFIED");
    await env.STUDIO_MEDIA.put(spec.key,bytes,{
      onlyIf:{etagDoesNotMatch:"*"},
      httpMetadata:{contentType:"video/mp4",cacheControl:"private, no-store"},
      customMetadata:{role:"issue2618-verified-private-review",
        sourceDriveFileId:spec.fileId,sha256:spec.sha256},
    });
    head=await env.STUDIO_MEDIA.head(spec.key);
    if(!validCache(head,spec))fail("FACTORY_2618_CACHE_READBACK_FAILED");
  }
  const range=String(request.headers.get("Range")||"").trim();
  const rangeValid=/^bytes=(?:\d+-\d*|-\d+)$/.test(range) && request.method==="GET";
  const object=await env.STUDIO_MEDIA.get(spec.key,rangeValid?{range:request.headers}:undefined);
  if(!object)fail("FACTORY_2618_CACHED_PREVIEW_MISSING");
  return previewResponse(request,object,spec,rangeValid);
}
