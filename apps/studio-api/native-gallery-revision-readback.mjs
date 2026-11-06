/** Private Worker -> Runner revised gallery Drive readback.
 * Only called under the held output's canonical approval lock. No urls or
 * browser-originated verification receipts are accepted as evidence.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const fail=(code,status=503)=>{throw Object.assign(new Error(code),{code,status});};
export async function verifyNativeGalleryRevisionDrive({
 env,output_id,profile_id,content_item_id,original_artifacts,
 revision_artifacts,selected_slide_ids,runnerFetch=fetch
}={}){
 if(env?.NATIVE_GALLERY_REVISED_VERIFY_ENABLED!=="true")
   fail("GALLERY_REVISION_VERIFY_DISABLED",405);
 if(![output_id,profile_id,content_item_id].every(x=>REC.test(String(x||"")))||
    !Array.isArray(original_artifacts)||!Array.isArray(revision_artifacts)||
    !Array.isArray(selected_slide_ids)||!selected_slide_ids.length)
   fail("GALLERY_REVISION_READBACK_INPUT_INVALID",400);
 const rawBase=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/+$/,"");
 const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
 let parsed;try{parsed=new URL(rawBase);}catch{fail("GALLERY_REVISION_RUNNER_UNAVAILABLE");}
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||
    parsed.search||parsed.hash||secret.length<24)
   fail("GALLERY_REVISION_RUNNER_UNAVAILABLE");
 let response;try{
   response=await runnerFetch(rawBase+"/jobs/native-gallery/verify-revision",{
     method:"POST",headers:{"Content-Type":"application/json",
       "X-Pipeline-Secret":secret},
     body:JSON.stringify({output_id,profile_id,content_item_id,
       original_artifacts,revision_artifacts,selected_slide_ids}),
     signal:AbortSignal.timeout(120000),
   });
 }catch{fail("GALLERY_REVISION_RUNNER_READBACK_UNAVAILABLE");}
 let receipt;try{
   const body=await response.text();
   if(body.length>2000)fail("GALLERY_REVISION_RUNNER_RECEIPT_OVERSIZED");
   receipt=JSON.parse(body);
 }catch{fail("GALLERY_REVISION_RUNNER_RECEIPT_INVALID");}
 if(!response.ok||receipt?.ok!==true||receipt.verified!==true||
    receipt.publication_authorized!==false||
    receipt.factory_approved!==false||
    receipt.creative_approved!==false)
   fail("GALLERY_REVISION_RUNNER_EVIDENCE_DENIED",409);
 return true;
}
