import test from "node:test";
import assert from "node:assert/strict";
import {verifyNativeGalleryRevisionDrive} from "./native-gallery-revision-readback.mjs";
const env={NATIVE_GALLERY_REVISED_VERIFY_ENABLED:"true",
 PIPELINE_RUNNER_URL:"https://private-runner.example",
 PIPELINE_RUNNER_SHARED_SECRET:"gallery-readback-private-secret-123456789"};
const O="rec00000000000001",P="rec00000000000002",C="rec00000000000003";
const original=[{slot_id:"rec00000000000004",drive_file_id:"source_file_1234567890123456"}];
const revision=[{slot_id:"rec00000000000004",drive_file_id:"revision_file_1234567890123"}];
const selected=["rec00000000000004"];
const args={env,output_id:O,profile_id:P,content_item_id:C,
 original_artifacts:original,revision_artifacts:revision,
 selected_slide_ids:selected};
test("the only accepted readback requires original and new Drive evidence",async()=>{
 const result=await verifyNativeGalleryRevisionDrive({...args,
  runnerFetch:async(url,opts)=>{
   assert.equal(url,"https://private-runner.example/jobs/native-gallery/verify-revision");
   assert.equal(opts.headers["X-Pipeline-Secret"],env.PIPELINE_RUNNER_SHARED_SECRET);
   assert.deepEqual(JSON.parse(opts.body),{
     output_id:O,profile_id:P,content_item_id:C,
     original_artifacts:original,revision_artifacts:revision,selected_slide_ids:selected});
   return {ok:true,text:async()=>JSON.stringify({ok:true,verified:true,
     publication_authorized:false,factory_approved:false,creative_approved:false})};
  }});
 assert.equal(result,true);
});
test("disabled configuration does not contact Runner",async()=>{
 let touched=false;
 await assert.rejects(verifyNativeGalleryRevisionDrive({...args,
   env:{...env,NATIVE_GALLERY_REVISED_VERIFY_ENABLED:"false"},
   runnerFetch:async()=>{touched=true;}}),/GALLERY_REVISION_VERIFY_DISABLED/);
 assert.equal(touched,false);
});
test("unverified, public or creative-accepted receipts fail closed",async()=>{
 for(const receipt of [
  {ok:true,verified:false,publication_authorized:false,factory_approved:false,
   creative_approved:false},
  {ok:true,verified:true,publication_authorized:true,factory_approved:false,
   creative_approved:false},
  {ok:true,verified:true,publication_authorized:false,factory_approved:true,
   creative_approved:false},
 ]){
  await assert.rejects(verifyNativeGalleryRevisionDrive({...args,
   runnerFetch:async()=>({ok:true,text:async()=>JSON.stringify(receipt)})}),
   /GALLERY_REVISION_RUNNER_EVIDENCE_DENIED/);
 }
});
