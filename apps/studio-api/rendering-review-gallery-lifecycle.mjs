/** Issue #1495: authenticated native gallery lifecycle boundary.
 * Storage and Runner execution MUST be injected by an authoritative adapter.
 * No unconfigured call is allowed to pretend generation or acceptance worked.
 * This module never publishes, releases a hold or updates original slides.
 */
import {previewNativeGalleryCorrection} from "./rendering-review-gallery-selection-preview.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[a-f0-9]{64}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const operations=["createHeldAttemptOnce","readAttempt","readVerifiedManifest","creativeReviewCAS"];
const requireOps=ops=>{if(operations.some(name=>typeof ops?.[name]!=="function"))
  fail("GALLERY_DURABLE_BACKEND_UNAVAILABLE",503);};
const requireActor=actor=>{if(!TOKEN.test(String(actor||"")))
  fail("GALLERY_REVIEWER_IDENTITY_INVALID",403);};

/** Only the server supplies inventory, authorized reviewer identity and ops.
 * User controls only exact slide IDs/instructions, request ID and decisions.
 */
export async function executeNativeGalleryLifecycle({
  action,output_id,actor_id,request_id,selected_slides,
  attempt_id,manifest_sha256,inventory,operations:ops
}={}){
  requireActor(actor_id);
  if(!REC.test(String(output_id||"")))fail("GALLERY_OUTPUT_INVALID",400);
  requireOps(ops);
  if(action==="generate"){
    if(!TOKEN.test(String(request_id||"")))fail("GALLERY_REQUEST_ID_INVALID",400);
    const proposal=await previewNativeGalleryCorrection({
      output_id,client_request_id:request_id,selected_slides,inventory,
    });
    // The selection preview is metadata only. Generation requires an
    // independently verified source manifest and durable authoritative hold.
    const created=await ops.createHeldAttemptOnce({
      output_id,actor_id,request_id,proposal,
      required_source:"verified_drive_bytes",
      require_publication_hold:true,
      auto_approve:false,allow_public_publish:false,
    });
    if(!TOKEN.test(String(created?.attempt_id||""))||
       created?.durable!==true||created?.hold_verified!==true||
       created?.source_bytes_verified!==true||
       created?.publication_authorized!==false)
      fail("GALLERY_GENERATION_RECEIPT_UNVERIFIED",503);
    return {ok:true,attempt_id:created.attempt_id,status:"held_queued",
      publication_authorized:false,creative_approved:false,
      factory_approved:false};
  }
  if(!TOKEN.test(String(attempt_id||"")))fail("GALLERY_ATTEMPT_INVALID",400);
  const current=await ops.readAttempt({output_id,attempt_id,actor_id});
  if(current?.output_id!==output_id||current?.attempt_id!==attempt_id||
     current?.actor_id!==actor_id||current?.hold_verified!==true)
    fail("GALLERY_ATTEMPT_NOT_AUTHORIZED",403);
  if(action==="status"){
    return {ok:true,attempt_id,status:current.status,
      completed_slides:current.completed_slides??0,
      total_slides:current.total_slides??0,
      creative_approved:current.creative_approved===true,
      factory_approved:false,publication_authorized:false};
  }
  if(action==="accept"||action==="reject"){
    if(!SHA.test(String(manifest_sha256||"")))
      fail("GALLERY_MANIFEST_HASH_REQUIRED",400);
    const manifest=await ops.readVerifiedManifest({output_id,attempt_id,actor_id});
    if(manifest?.manifest_sha256!==manifest_sha256||
       manifest?.drive_readback_verified!==true||
       manifest?.rights_verified!==true||
       manifest?.publication_hold_active!==true||
       manifest?.profile_id!==current.profile_id||
       manifest?.output_id!==output_id)
      fail("GALLERY_REVISED_ARTIFACT_NOT_VERIFIED");
    const decision=await ops.creativeReviewCAS({
      output_id,attempt_id,actor_id,manifest_sha256,
      decision:action,allow_factory_approval:false,
      allow_public_publish:false,
    });
    if(decision?.durable!==true||decision?.readback_verified!==true||
       decision?.manifest_sha256!==manifest_sha256||
       decision?.decision!==action)
      fail("GALLERY_CREATIVE_DECISION_NOT_VERIFIED",503);
    return {ok:true,attempt_id,decision:action,manifest_sha256,
      creative_approved:action==="accept",factory_approved:false,
      publication_authorized:false};
  }
  fail("GALLERY_ACTION_UNSUPPORTED",400);
}
