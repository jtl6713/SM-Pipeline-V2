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
  "FACTORY_2618_DRIVE_OAUTH_UNAVAILABLE",
  "FACTORY_2618_DRIVE_OAUTH_REJECTED",
  "FACTORY_2618_DRIVE_ACCESS_DENIED",
  "FACTORY_2618_DRIVE_FILE_NOT_VISIBLE",
  "FACTORY_2618_DRIVE_RATE_LIMITED",
  "FACTORY_2618_DRIVE_UPSTREAM_FAILED",
]);
export async function fetchIssue2618DriveVideo({fileId,getAccessToken,fetchImpl=fetch}){
  if(!entries.some(([,id])=>id===fileId))fail("FACTORY_2618_PROTECTED_SOURCE_UNAVAILABLE");
  let token;
  try{token=await getAccessToken();}catch{fail("FACTORY_2618_DRIVE_OAUTH_UNAVAILABLE");}
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
    // Only the configured Studio OAuth identity may fetch the corrected Drive
    // source. Never fall back to another output's old cached R5 MP4.
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
    await env.STUDIO_MEDIA.put(spec.key,bytes,{
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
