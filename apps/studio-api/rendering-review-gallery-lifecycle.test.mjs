import test from "node:test";
import assert from "node:assert/strict";
import {executeNativeGalleryLifecycle} from "./rendering-review-gallery-lifecycle.mjs";
const output_id="rec00000000000001",actor_id="reviewer_12345678";
const attempt_id="gallery_attempt_0012345",manifest_sha256="a".repeat(64);
function ops(){return {
 createHeldAttemptOnce:async()=>({attempt_id,durable:true,hold_verified:true,
   source_bytes_verified:true,publication_authorized:false}),
 readAttempt:async()=>({output_id,attempt_id,actor_id,hold_verified:true,
   profile_id:"rec00000000000002",status:"ready_for_review",completed_slides:2,total_slides:2}),
 readVerifiedManifest:async()=>({output_id,profile_id:"rec00000000000002",
   manifest_sha256,drive_readback_verified:true,rights_verified:true,
   publication_hold_active:true}),
 creativeReviewCAS:async ({decision})=>({decision,manifest_sha256,
    durable:true,readback_verified:true}),
};}
test("backend must be configured before any action",async()=>{
 await assert.rejects(executeNativeGalleryLifecycle({
  action:"status",output_id,actor_id,attempt_id,operations:{}}),
  /GALLERY_DURABLE_BACKEND_UNAVAILABLE/);
});
test("status uses server-authorized attempt and never claims publishing",async()=>{
 const result=await executeNativeGalleryLifecycle({action:"status",
  output_id,actor_id,attempt_id,operations:ops()});
 assert.equal(result.completed_slides,2);
 assert.equal(result.publication_authorized,false);
 assert.equal(result.factory_approved,false);
});
test("creative accept is bound to exact revised manifest, never Factory approval",async()=>{
 const result=await executeNativeGalleryLifecycle({action:"accept",output_id,
  actor_id,attempt_id,manifest_sha256,operations:ops()});
 assert.equal(result.creative_approved,true);
 assert.equal(result.factory_approved,false);
 assert.equal(result.publication_authorized,false);
 await assert.rejects(executeNativeGalleryLifecycle({action:"accept",output_id,
  actor_id,attempt_id,manifest_sha256:"b".repeat(64),operations:ops()}),
  /GALLERY_REVISED_ARTIFACT_NOT_VERIFIED/);
});
test("missing hold blocks acceptance",async()=>{
 const adapter=ops();
 adapter.readVerifiedManifest=async()=>({...await ops().readVerifiedManifest(),
    publication_hold_active:false});
 await assert.rejects(executeNativeGalleryLifecycle({action:"accept",output_id,
  actor_id,attempt_id,manifest_sha256,operations:adapter}),
  /GALLERY_REVISED_ARTIFACT_NOT_VERIFIED/);
});
test("unverified generation receipt cannot claim success",async()=>{
 const adapter=ops();
 adapter.createHeldAttemptOnce=async()=>({attempt_id,durable:true,
  hold_verified:true,source_bytes_verified:false,publication_authorized:false});
 const inventory={ok:true,output_id,source_kind:"airtable_metadata_only",
  can_generate:false,publication_authorized:false,review_hold_created:false,
  profile_id:"rec00000000000002",content_item_id:"rec00000000000003",
  slides:[{slide_id:"rec00000000000004",order:1,blockers:[],status:"ok"}],
  slide_count:1,platform:"Instagram",aspect_ratio:"4:5",blockers:[]};
 await assert.rejects(executeNativeGalleryLifecycle({action:"generate",output_id,
  actor_id,request_id:"req_1234567890",
  selected_slides:[{slide_id:"rec00000000000004",instruction:"Brighten the skyline without changing subjects"}],
  inventory,operations:adapter}),/GALLERY_GENERATION_RECEIPT_UNVERIFIED/);
});
