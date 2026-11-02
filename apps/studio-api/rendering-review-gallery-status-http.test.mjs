import test from "node:test";
import assert from "node:assert/strict";
import {readGalleryRevisionStatus} from "./rendering-review-gallery-status-http.mjs";
const output_id="rec00000000000001";
const profile="rec00000000000002";
const attempt="gallery_attempt_12345678";
const fixture={
 output_id,authorized_profile_ids:[profile],
 readOutput:async()=>({id:output_id,fields:{
  Content_Item:["rec00000000000003"],
  Studio_Render_Review_Hold_Active:true,
  Studio_Render_Review_Hold_ID:"held_00123456",
  Studio_Render_Review_Hold_Owner:"session_00123456",
 }}),
 readContent:async()=>({id:"rec00000000000003",fields:{Content_Profile:[profile]}}),
 listRecords:async()=>[{id:"rec00000000000004",fields:{
  Attempt_ID:attempt,Output_Record_ID:output_id,Attempt_Status:"ready_for_review",
  Artifact_File_ID:"some_drive_file_1234567890",
 }}],
};
test("reads exact profile-scoped Airtable status without approving metadata",async()=>{
 const result=await readGalleryRevisionStatus(fixture);
 assert.equal(result.attempts.length,1);
 assert.equal(result.attempts[0].status,"ready_for_review");
 assert.equal(result.attempts[0].can_accept,false);
 assert.equal(result.attempts[0].revised_drive_readback_verified,false);
 assert.equal(result.can_generate,false);
});
test("foreign profile denied before attempt lookup",async()=>{
 let queried=false;
 await assert.rejects(readGalleryRevisionStatus({...fixture,
  authorized_profile_ids:[],listRecords:async()=>{queried=true;return[];}}),/GALLERY_PROFILE_FORBIDDEN/);
 assert.equal(queried,false);
});
test("malformed attempt and contradictory output rejected",async()=>{
 await assert.rejects(readGalleryRevisionStatus({...fixture,attempt_id:"not valid"}),/GALLERY_ATTEMPT_INVALID/);
 await assert.rejects(readGalleryRevisionStatus({...fixture,
  listRecords:async()=>[{id:"rec00000000000004",fields:{
   Attempt_ID:attempt,Output_Record_ID:"rec99999999999999",
  }}]}),/GALLERY_ATTEMPT_IDENTITY_CONFLICT/);
});
