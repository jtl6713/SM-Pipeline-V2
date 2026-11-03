/** Authenticated native gallery Generate handler, disabled by protected flags.
 * Stable request ID + exact slide selection are the only client parameters.
 * Airtable is canonical. This handler never writes V1, Factory or MAE fields.
 */
import {previewNativeGalleryCorrection} from "./rendering-review-gallery-selection-preview.mjs";
import {createNativeGalleryJobIntent,nativeGalleryJobsEnabled}
  from "./native-gallery-job-airtable.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};

export async function handleNativeGalleryGenerate({
  request,env,output_id,authorization,assertWriteRequest,
  loadInventory,jobAdapter,
}={}){
  if(request?.method!=="POST")fail("METHOD_NOT_ALLOWED",405);
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization.permissions?.outputs_review!==true||
     !REC.test(String(authorization.user?.record_id||"")))
    fail("NATIVE_GALLERY_REVIEW_PERMISSION_DENIED",403);
  if(typeof assertWriteRequest!=="function"||
     typeof loadInventory!=="function")fail("NATIVE_GALLERY_AUTH_ADAPTER_MISSING",503);
  assertWriteRequest(request,env);
  if(!nativeGalleryJobsEnabled(env))
    fail("NATIVE_GALLERY_JOB_WRITES_DISABLED",405);
  if(!REC.test(String(output_id||"")))fail("NATIVE_GALLERY_OUTPUT_INVALID",400);
  if(!/^application\/json(?:\s*;|$)/i.test(
       String(request.headers?.get("Content-Type")||"")))
    fail("NATIVE_GALLERY_JSON_REQUIRED",415);
  const raw=await request.text();
  if(raw.length>16000)fail("NATIVE_GALLERY_BODY_TOO_LARGE",413);
  let body;
  try{body=JSON.parse(raw)}catch{fail("NATIVE_GALLERY_INVALID_JSON",400);}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).length!==2||
     Object.keys(body).some(k=>!["client_request_id","selected_slides"].includes(k))||
     !TOKEN.test(String(body.client_request_id||""))||
     !Array.isArray(body.selected_slides)||body.selected_slides.length<1||
     body.selected_slides.length>20)
    fail("NATIVE_GALLERY_INVALID_GENERATION_REQUEST",400);
  // This scope/slide authority is reconstructed from Airtable on each click.
  const inventory=await loadInventory(output_id,authorization);
  const proposal=await previewNativeGalleryCorrection({
    output_id,client_request_id:body.client_request_id,
    selected_slides:body.selected_slides,inventory,
  });
  const receipt=await createNativeGalleryJobIntent({
    env,actor_id:authorization.user.record_id,output_id,
    client_request_id:body.client_request_id,proposal,adapter:jobAdapter,
  });
  if(receipt?.ok!==true||receipt.durable!==true||
     receipt.hold_verified!==true||receipt.source_bytes_verified!==true||
     receipt.publication_authorized!==false)
    fail("NATIVE_GALLERY_JOB_RECEIPT_UNVERIFIED",503);
  return {ok:true,replay:receipt.replay===true,
    output_id,job_id:receipt.job_id,state:"held_queued",
    creative_approved:false,factory_approved:false,
    publication_authorized:false};
}
