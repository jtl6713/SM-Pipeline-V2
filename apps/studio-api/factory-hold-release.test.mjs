import test from "node:test";
import assert from "node:assert/strict";
import {releaseFactoryHoldInSupabase,formalReleaseBlock} from "./factory-hold-release.mjs";
const id="rec1Zg5eEJjQKzUDO",profile="recpNlNn6U6eq0M9r";
const auth={authenticated:true,authorized:true,permissions:{outputs_review:true,publishing_control:true},user:{record_id:"rec12345678901234"},authorized_profile_ids:[profile]};
const base={id:"f68a570b-98e2-4537-97a5-d8516653ca95",airtable_record_id:id,output_status:"Ready for Review",review_status:"Review Sent",publish_status:"Not Ready",render_status:"Rendered",do_not_publish:true,auto_publish_enabled:false,publish_retry_eligible:false,updated_at:"2026-11-24T12:54:55.642Z",publish_hold_set_at:"2026-11-23T00:00:00Z",error_messages:{}};
const record={id,fields:{Output_Status:"Ready for Review",Review_Status:"Review Sent",Publish_Status:"Not Ready",Render_Status:"Rendered",Do_Not_Publish:true,Output_Caption:"Vizcaya",Studio_Output_Type:"Story",Platform:"Instagram",Final_File_URL:"https://media.chicagoshining.com/story.mp4"}};
function fixture(patch={},mode="ok"){
 let row={...base,...patch},writes=[];
 const ops={read:async()=>new Map([[id,{row,profileId:profile,record}]]),verifyGallery:async()=>{},verifyImages:async r=>r,
 rest:async(_env,path,opts)=>{writes.push({path,opts});if(mode==="race")return [];row={...row,...opts.body,publish_hold_released_at:"2026-11-24T13:00:00Z"};return [row];}};
 return {ops,writes,get row(){return row;}};
}
test("exact plain hold release writes only Supabase, retains review and no schedule",async()=>{
 const f=fixture();const result=await releaseFactoryHoldInSupabase({},id,auth,f.ops);
 assert.equal(f.writes.length,1);assert.match(f.writes[0].path,/updated_at=eq/);assert.match(f.writes[0].path,/publish_hold_set_at=eq/);
 assert.equal(f.row.do_not_publish,false);assert.equal(f.row.review_status,"Review Sent");assert.equal(f.row.auto_publish_enabled,false);assert.equal(result.scheduled,false);
});
test("Vizcaya expired provider hold cannot be bypassed by Release for Approval",async()=>{
 const f=fixture({publish_hold_source:"issue2915_review_and_provider_reconciliation",error_messages:{IG_Story_Container_ID:"old",Studio_Publish_Dispatch_Count:2,SM_Issue2915_Story_Audio_Repair:{new_upload_authorized:false}}});
 await assert.rejects(releaseFactoryHoldInSupabase({},id,auth,f.ops),/expired Instagram container/);assert.equal(f.writes.length,0);
});
test("denies foreign profile, stale CAS, other provider evidence and creative holds",async()=>{
 let f=fixture();await assert.rejects(releaseFactoryHoldInSupabase({},id,{...auth,authorized_profile_ids:[]},f.ops),/authorized profiles/);assert.equal(f.writes.length,0);
 f=fixture({}, "race");await assert.rejects(releaseFactoryHoldInSupabase({},id,auth,f.ops),/revision changed/);
 assert.match(formalReleaseBlock({...base,error_messages:{IG_Story_Container_ID:"old"}}),/Prior dispatch/);
 assert.match(formalReleaseBlock({...base,error_messages:{Copyright_Hold:true}}),/Protected/);
 assert.match(formalReleaseBlock({...base,scheduled_post_date:"2026-12-01"}),/schedule/);
});

test("a rejected native gallery or failed media probe causes zero release writes",async()=>{
  const f=fixture();f.ops.verifyGallery=async()=>{throw Error("native gallery final slides missing");};
  await assert.rejects(releaseFactoryHoldInSupabase({},id,auth,f.ops),/final slides missing/);
  assert.equal(f.writes.length,0);
  f.ops.verifyGallery=async()=>{};f.ops.verifyImages=async()=>({readiness:"BLOCKED"});
  await assert.rejects(releaseFactoryHoldInSupabase({},id,auth,f.ops),/media could not be verified/);
  assert.equal(f.writes.length,0);
});
