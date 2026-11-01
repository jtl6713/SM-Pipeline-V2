/**
 * Exact, review-only, private R2 preview cache for Michigan Avenue Stroll V2.
 * Drive remains canonical. Cache has no publish, approval or QA authority.
 * A verified source Review attempt is the only writer.
 */
export const MICHIGAN_V2=Object.freeze({
  source_output_id:"recPnNYghmcJYivOA",
  attempt_id:"rrimport_9593_864436ce242983f69fceaa68f37ac4",
  file_id:"16osgGbNcyet_4WwDLiarSurkF3yXFOcq",
  sha256:"864436ce242983f69fceaa68f37ac4002c2c382ab8c8189098bdc5cab2072d34",
  bytes:46824860,
});
export const MICHIGAN_V2_CACHE_KEY="studio/review-previews/sha256-"+MICHIGAN_V2.sha256+".mp4";
const err=(message)=>{const e=new Error(message);e.status=503;throw e;};
const validObject=obj=>obj&&
  obj.size===MICHIGAN_V2.bytes&&
  obj.customMetadata?.sourceDriveFileId===MICHIGAN_V2.file_id&&
  obj.customMetadata?.sha256===MICHIGAN_V2.sha256&&
  obj.customMetadata?.role==="review-only-v2-preview";

export async function serveMichiganV2CachedPreview({request,env,fileId}){
  if(fileId!==MICHIGAN_V2.file_id||!env?.STUDIO_MEDIA?.get)return null;
  const range=request.method==="GET"?
    String(request.headers.get("Range")||"").trim():"";
  const rangeValid=/^bytes=(?:\d+-\d*|-\d+)$/.test(range);
  const object=await env.STUDIO_MEDIA.get(
    MICHIGAN_V2_CACHE_KEY,rangeValid?{range:request.headers}:undefined);
  if(!object)return null;
  if(!validObject(object))err("REVIEW_PREVIEW_CACHE_PROVENANCE_INVALID");
  const headers=new Headers({
    "Content-Type":"video/mp4","Accept-Ranges":"bytes",
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff",
    "X-Studio-Preview-Source":"verified-review-r2",
  });
  const partial=rangeValid&&typeof object.range?.offset==="number";
  if(partial){
    const start=object.range.offset;
    const len=object.range.length??(object.size-start);
    headers.set("Content-Range",`bytes ${start}-${start+len-1}/${object.size}`);
    headers.set("Content-Length",String(len));
  }else headers.set("Content-Length",String(object.size));
  return new Response(request.method==="HEAD"?null:object.body,{
    status:partial?206:200,headers,
  });
}

export async function ensureMichiganV2CachedPreview({env,sourceOutputId,attemptId,fetchVerifiedVideo,
  makeFixedLengthStream=()=>new FixedLengthStream(MICHIGAN_V2.bytes)}){
  if(sourceOutputId!==MICHIGAN_V2.source_output_id||
     attemptId!==MICHIGAN_V2.attempt_id||!env?.STUDIO_MEDIA?.head||
     !env?.STUDIO_MEDIA?.put)err("REVIEW_PREVIEW_CACHE_SOURCE_NOT_AUTHORIZED");
  const existing=await env.STUDIO_MEDIA.head(MICHIGAN_V2_CACHE_KEY);
  if(existing){
    if(!validObject(existing))err("REVIEW_PREVIEW_CACHE_PROVENANCE_INVALID");
    return {ok:true,cached:true};
  }
  if(typeof fetchVerifiedVideo!=="function")err("REVIEW_PREVIEW_SOURCE_UNAVAILABLE");
  const request=new Request("https://studio.chicagoshining.com/api/internal/review-preview-cache",{
    method:"GET",headers:{"Range":"bytes=0-","Accept":"video/mp4"}});
  const source=await fetchVerifiedVideo(sourceOutputId,attemptId,request);
  const contentType=String(source?.headers?.get("Content-Type")||"").toLowerCase();
  const contentRange=String(source?.headers?.get("Content-Range")||"");
  const reported=Number(contentRange.match(/\/(\d+)$/)?.[1]||
    source?.headers?.get("Content-Length")||0);
  if(![200,206].includes(source?.status)||
     !(contentType.startsWith("video/mp4")||
       contentType.startsWith("application/octet-stream"))||
     reported!==MICHIGAN_V2.bytes||!source?.body){
    try{await source?.body?.cancel()}catch{}
    err("REVIEW_PREVIEW_SOURCE_BYTES_UNVERIFIED");
  }
  // Keep bytes out of JS heap. The fixed-length stream is the R2 size authority;
  // an incomplete upstream transfer makes both promises reject, never blesses
  // a truncated cache object.
  const stream=makeFixedLengthStream();
  const upload=env.STUDIO_MEDIA.put(MICHIGAN_V2_CACHE_KEY,stream.readable,{
    httpMetadata:{contentType:"video/mp4",cacheControl:"private, no-store"},
    customMetadata:{
      role:"review-only-v2-preview",
      sourceDriveFileId:MICHIGAN_V2.file_id,
      sourceAttemptId:MICHIGAN_V2.attempt_id,
      sha256:MICHIGAN_V2.sha256,
    },
  });
  await Promise.all([source.body.pipeTo(stream.writable),upload]);
  const confirmed=await env.STUDIO_MEDIA.head(MICHIGAN_V2_CACHE_KEY);
  if(!validObject(confirmed))err("REVIEW_PREVIEW_CACHE_READBACK_FAILED");
  return {ok:true,cached:false};
}
