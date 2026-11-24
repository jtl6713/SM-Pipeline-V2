import test from "node:test";
import assert from "node:assert/strict";
import {originalFactoryIntent, originalIntentCoversGallery} from "./factory-original-intent.mjs";
const profile="recgtK8Z7eNADNtVy", actor="recAuthUser123456";
const childId="factory_child_2915", parentId="factory_parent_2915";
const records=[{id:"recVoFLCOAGHNIkD3",output_id:10863,profile_id:profile},
{id:"recWq5HIxBT8BCtme",output_id:10875,profile_id:profile}];
const job={request_id:childId,group_request_id:parentId,profile_id:profile,
  submitted_by:null,created_at:"2026-11-24T11:56:00Z",items:records};
const parent={request_id:parentId,submitted_by:actor,created_at:"2026-11-24T11:55:00Z",
 records,children:[{request_id:childId,profile_id:profile,records}]};
const output={publish_hold_released_at:"2026-11-23T04:47:52Z",updated_at:"2026-11-23T04:47:52Z",
 do_not_publish:false,auto_publish_enabled:false,output_status:"Ready for Review",
 review_status:"Review Sent",publish_status:"Not Ready"};
const proof={pending:2,slides:[{updated_at:"2026-11-22T06:29:08Z"},{updated_at:"2026-11-22T06:29:08Z"}]};
test("NYC original authenticated group intent survives legacy child missing actor",()=>{
 const intent=originalFactoryIntent(job,parent);
 assert.deepEqual(intent,{requestId:parentId,approvedByUserRecordId:actor,submittedAt:parent.created_at});
 assert.equal(originalIntentCoversGallery(intent,output,proof),true);
});
test("late child creation must not turn pre-release parent click into post-release consent",()=>{
 const intent=originalFactoryIntent(job,{...parent,created_at:"2026-11-22T03:00:00Z"});
 assert.equal(originalIntentCoversGallery(intent,output,proof),false);
});
test("missing or conflicting actor, exact set or ownership denies consent",()=>{
 for(const p of [null,{...parent,submitted_by:null},{...parent,records:records.slice(1)},
 {...parent,children:[{...parent.children[0],records:[...records].reverse()}]}]){
 assert.equal(originalFactoryIntent(job,p),null);
 }
 assert.equal(originalFactoryIntent({...job,submitted_by:"recOtherUser12345"},parent),null);
});
test("post-submit changes, holds, partial slide decisions, publication or missing proof deny replay",()=>{
 const intent=originalFactoryIntent(job,parent);
 for(const row of [{...output,updated_at:"2026-11-24T12:00:00Z"},
 {...output,publish_hold_released_at:null},{...output,do_not_publish:true},
 {...output,published_at:"2026-11-24T12:00:00Z"},{...output,scheduled_post_date:"2027-01-01"},
 {...output,auto_publish_enabled:true}]){
 assert.equal(originalIntentCoversGallery(intent,row,proof),false);
 }
 for(const p of [null,{...proof,pending:1},{...proof,slides:[{updated_at:"2026-11-24T12:00:00Z"}],pending:1}]){
 assert.equal(originalIntentCoversGallery(intent,output,p),false);
 }
});
test("standalone authenticated submission uses its own original timestamp",()=>{
 const j={...job,group_request_id:null,submitted_by:actor};
 assert.equal(originalFactoryIntent(j).submittedAt,j.created_at);
});
