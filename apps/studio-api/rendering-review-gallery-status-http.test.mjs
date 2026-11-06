import test from "node:test";
import assert from "node:assert/strict";
import {readGalleryRevisionStatus} from "./rendering-review-gallery-status-http.mjs";
import {NATIVE_GALLERY_JOBS_TABLE} from "./native-gallery-job-airtable.mjs";
const output_id="rec00000000000001";
const profile="rec00000000000002",content="rec00000000000003";
const job="ngjob_123456789123456789";
const fixture={
 output_id,authorized_profile_ids:[profile],
 readOutput:async()=>({id:output_id,fields:{
  Content_Item:[content],Do_Not_Publish:true,
  Studio_Render_Review_Hold_Active:true,
  Studio_Render_Review_Hold_ID:"gallery_hold_1234",
  Studio_Render_Review_Hold_Owner:"gallery_owner_1234",
  Studio_Render_Review_Session_ID:"gallery_owner_1234",
 }}),
 readContent:async()=>({id:content,fields:{Content_Profile:[profile]}}),
 listRecords:async table=>{
   assert.equal(table,NATIVE_GALLERY_JOBS_TABLE);
   return [{id:"rec00000000000004",fields:{
     Job_ID:job,Output_Record_ID:output_id,
     Content_Item_Record_ID:content,Profile_Record_ID:profile,
     Job_State:"ready_for_review",Row_Version:4,
     Hold_ID:"gallery_hold_1234",Hold_Owner:"gallery_owner_1234",
     Total_Slides:2,Completed_Slides:2,
     Revised_Manifest_SHA256:"a".repeat(64),
   }}];
 },
};
test("reads native-gallery jobs, never Reel attempts or unverified media",async()=>{
 const result=await readGalleryRevisionStatus(fixture);
 assert.equal(result.jobs.length,1);
 assert.equal(result.jobs[0].job_id,job);
 assert.equal(result.jobs[0].status,"ready_for_review");
 assert.equal(result.jobs[0].revised_manifest_stored,true);
 assert.equal(result.jobs[0].hold_active,true);
 assert.equal(result.jobs[0].progress_label,"2 of 2 slide slots recorded");
 assert.equal(result.jobs[0].progress_percent,100);
 assert.equal(result.jobs[0].progress_source,"airtable_ledger_unverified");
 assert.equal(result.jobs[0].can_accept,false);
 assert.equal(result.jobs[0].revised_drive_readback_verified,false);
 assert.equal(result.can_publish,false);
});
test("foreign profile denied before job lookup",async()=>{
 let queried=false;
 await assert.rejects(readGalleryRevisionStatus({...fixture,
  authorized_profile_ids:[],listRecords:async()=>{queried=true;return[];}}),
  /GALLERY_PROFILE_FORBIDDEN/);
 assert.equal(queried,false);
});
test("malformed job ID and contradictory output rejected",async()=>{
 await assert.rejects(readGalleryRevisionStatus({...fixture,job_id:"not valid"}),
   /GALLERY_JOB_INVALID/);
 await assert.rejects(readGalleryRevisionStatus({...fixture,
  listRecords:async()=>[{id:"rec00000000000004",fields:{
   Job_ID:job,Output_Record_ID:"rec99999999999999",
   Content_Item_Record_ID:content,Profile_Record_ID:profile,
   Row_Version:1,
  }}]}),/GALLERY_JOB_IDENTITY_CONFLICT/);
});
test("no false positive when a specific job does not exist",async()=>{
 await assert.rejects(readGalleryRevisionStatus({...fixture,
  job_id:"ngjob_missing_12345678"}),/GALLERY_JOB_NOT_FOUND/);
});

test("hold is not reported active if its session owner has changed",async()=>{
 const result=await readGalleryRevisionStatus({...fixture,
  readOutput:async()=>({id:output_id,fields:{
   Content_Item:[content],Do_Not_Publish:true,
   Studio_Render_Review_Hold_Active:true,
   Studio_Render_Review_Hold_ID:"gallery_hold_1234",
   Studio_Render_Review_Hold_Owner:"gallery_owner_1234",
   Studio_Render_Review_Session_ID:"another_session_9876",
  }})});
 assert.equal(result.hold_active,false);
 assert.equal(result.jobs[0].hold_active,false);
 assert.equal(result.jobs[0].can_accept,false);
 assert.equal(result.can_publish,false);
});
test("partial ledger progress is reported without pretending media verification",async()=>{
 const result=await readGalleryRevisionStatus({...fixture,
  listRecords:async()=>[{id:"rec00000000000004",fields:{
   Job_ID:job,Output_Record_ID:output_id,
   Content_Item_Record_ID:content,Profile_Record_ID:profile,
   Job_State:"claimed",Row_Version:2,
   Hold_ID:"gallery_hold_1234",Hold_Owner:"gallery_owner_1234",
   Total_Slides:4,Completed_Slides:1,Progress_Stage:"c5_generation"
  }}]});
 assert.equal(result.jobs[0].progress_label,"1 of 4 slide slots recorded");
 assert.equal(result.jobs[0].progress_percent,25);
 assert.equal(result.jobs[0].revised_drive_readback_verified,false);
 assert.equal(result.jobs[0].can_accept,false);
});
test("impossible Airtable counts fail closed rather than show progress",async()=>{
 for(const [completed,total] of [[-1,2],[3,2],[0,0],[0,21],[1.5,2],
   [Number.MAX_SAFE_INTEGER+1,2],[0,null]]) {
  await assert.rejects(readGalleryRevisionStatus({...fixture,
   listRecords:async()=>[{id:"rec00000000000004",fields:{
    Job_ID:job,Output_Record_ID:output_id,
    Content_Item_Record_ID:content,Profile_Record_ID:profile,
    Job_State:"held_queued",Row_Version:1,
    Hold_ID:"gallery_hold_1234",Hold_Owner:"gallery_owner_1234",
    Total_Slides:total,Completed_Slides:completed,
   }}]}),/GALLERY_PROGRESS_LEDGER_INVALID/);
 }
});
