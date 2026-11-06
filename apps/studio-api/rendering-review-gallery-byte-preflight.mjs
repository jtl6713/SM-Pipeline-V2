/** Issue #1495 protected Studio -> Runner source-byte bridge.
 * Auth and profile authorization belong to the existing Worker route.
 * The browser cannot supply a profile, Drive URL, verification receipt or job.
 * No mutation, staging upload, render or approval can occur here.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[0-9a-f]{64}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
export function gallerySourceBytePreflightEnabled(env){
 return env?.NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED==="true";
}
export async function verifyGallerySourceBytes({
 env,output_id,inventory,runnerFetch=fetch,
}={}){
 if(!gallerySourceBytePreflightEnabled(env))
   fail("GALLERY_SOURCE_PREFLIGHT_DISABLED",405);
 if(!REC.test(String(output_id||""))||
    inventory?.ok!==true||inventory?.output_id!==output_id||
    inventory?.source_kind!=="airtable_metadata_only"||
    inventory?.can_generate!==false||
    inventory?.publication_authorized!==false||
    !REC.test(String(inventory?.profile_id||""))||
    !REC.test(String(inventory?.content_item_id||"")))
   fail("GALLERY_AIRTABLE_AUTHORITY_UNVERIFIED",403);
 const base=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/+$/,"");
 const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
 let uri;
 try{uri=new URL(base);}catch{fail("GALLERY_RUNNER_NOT_CONFIGURED",503);}
 if(uri.protocol!=="https:"||uri.username||uri.password||uri.search||uri.hash||
    !secret||secret.length<24)
   fail("GALLERY_RUNNER_NOT_CONFIGURED",503);
 let response;
 try{
   response=await runnerFetch(base+"/jobs/native-gallery/source-preflight",{
     method:"POST",
     headers:{"Content-Type":"application/json","Accept":"application/json",
       "X-Pipeline-Secret":secret},
     body:JSON.stringify({output_id,
       expected_profile_id:inventory.profile_id}),
     signal:AbortSignal.timeout(120000),
   });
 }catch{fail("GALLERY_RUNNER_SOURCE_UNAVAILABLE",503);}
 let payload;
 try{
   const raw=await response.text();
   if(raw.length>5000)fail("GALLERY_RUNNER_RECEIPT_TOO_LARGE",502);
   payload=JSON.parse(raw);
 }catch{fail("GALLERY_RUNNER_RECEIPT_INVALID",502);}
 if(!response.ok){
   // Not all gallery sources have owned catalog media records. Block safely.
   fail("GALLERY_RUNNER_SOURCE_REJECTED",response.status===409?409:503);
 }
 if(payload?.ok!==true||payload.output_id!==output_id||
    payload.profile_id!==inventory.profile_id||
    payload.content_item_id!==inventory.content_item_id||
    !Number.isSafeInteger(payload.slide_count)||
    payload.slide_count!==inventory.slide_count||
    !SHA.test(String(payload.original_artifacts_sha256||""))||
    payload.sources_byte_verified!==true||
    payload.source_rights_verified!==true||
    payload.shared_watermark_asset_verified!==true||
    typeof payload.original_artifact_watermark_verified!=="boolean"||
    payload.can_generate!==false||
    payload.can_approve!==false||
    payload.publication_authorized!==false||
    !Array.isArray(payload.blockers)||payload.blockers.length>20||
    payload.blockers.some(x=>typeof x!=="string"||x.length>120))
   fail("GALLERY_RUNNER_SOURCE_IDENTITY_CONFLICT",503);
 return {ok:true,output_id,profile_id:inventory.profile_id,
   content_item_id:inventory.content_item_id,
   slide_count:payload.slide_count,aspect_ratio:payload.aspect_ratio,
   sources_byte_verified:true,source_rights_verified:true,
   shared_watermark_asset_verified:true,
   original_artifact_watermark_verified:payload.original_artifact_watermark_verified,
   original_artifacts_sha256:payload.original_artifacts_sha256,
   can_generate:false,can_approve:false,publication_authorized:false,
   blockers:payload.blockers};
}
