import test from "node:test";
import assert from "node:assert/strict";
import {verifyGallerySourceBytes} from "./rendering-review-gallery-byte-preflight.mjs";

const output_id="rec00000000000001",profile_id="rec00000000000002";
const content_item_id="rec00000000000003";
const env={NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 PIPELINE_RUNNER_URL:"https://private-runner.example",
 PIPELINE_RUNNER_SHARED_SECRET:"test-shared-secret-123456789"};
const inventory={ok:true,output_id,profile_id,content_item_id,
 source_kind:"airtable_metadata_only",slide_count:2,can_generate:false,
 publication_authorized:false};
const payload={ok:true,output_id,profile_id,content_item_id,
 slide_count:2,aspect_ratio:"4:5",sources_byte_verified:true,
 source_rights_verified:true,shared_watermark_asset_verified:true,
 original_artifact_watermark_verified:false,
 original_artifacts_sha256:"a".repeat(64),
 blockers:["GALLERY_DURABLE_HOLD_AND_LEASE_REQUIRED"],
 can_generate:false,can_approve:false,publication_authorized:false};

function transport(response=payload){
 return async (url,options)=>{
   assert.equal(url,"https://private-runner.example/jobs/native-gallery/source-preflight");
   assert.equal(options.method,"POST");
   assert.equal(options.headers["X-Pipeline-Secret"],env.PIPELINE_RUNNER_SHARED_SECRET);
   assert.deepEqual(JSON.parse(options.body),{output_id,
      expected_profile_id:profile_id});
   return {ok:true,status:200,text:async()=>JSON.stringify(response)};
 };
}
test("auth-bound actual image receipt never authorizes Generate or publishing",async()=>{
 const result=await verifyGallerySourceBytes({env,output_id,inventory,
   runnerFetch:transport()});
 assert.equal(result.sources_byte_verified,true);
 assert.equal(result.can_generate,false);
 assert.equal(result.can_approve,false);
 assert.equal(result.publication_authorized,false);
 assert.equal(result.original_artifact_watermark_verified,false);
});
test("disabled rollout never touches the Runner",async()=>{
 let called=false;
 await assert.rejects(verifyGallerySourceBytes({
  env:{...env,NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"false"},
  output_id,inventory,runnerFetch:()=>{called=true;},
 }),/GALLERY_SOURCE_PREFLIGHT_DISABLED/);
 assert.equal(called,false);
});
test("stale or foreign metadata denied before Runner",async()=>{
 let called=false;
 await assert.rejects(verifyGallerySourceBytes({env,output_id,
  inventory:{...inventory,profile_id:"wrong"},
  runnerFetch:()=>{called=true;}}),/GALLERY_AIRTABLE_AUTHORITY_UNVERIFIED/);
 assert.equal(called,false);
});
test("mismatched Runner receipt rejected, never accepted as authorized",async()=>{
 for(const value of [
  {...payload,profile_id:"rec99999999999999"},
  {...payload,can_generate:true},
  {...payload,publication_authorized:true},
  {...payload,slide_count:1},
  {...payload,original_artifacts_sha256:"invalid"},
 ]){
   await assert.rejects(verifyGallerySourceBytes({env,output_id,inventory,
     runnerFetch:transport(value)}),/GALLERY_RUNNER_SOURCE_IDENTITY_CONFLICT/);
 }
});
test("Runner source denial remains a blocker",async()=>{
 await assert.rejects(verifyGallerySourceBytes({env,output_id,inventory,
  runnerFetch:async()=>({ok:false,status:409,text:async()=>'{"ok":false}'})}),
  /GALLERY_RUNNER_SOURCE_REJECTED/);
});
