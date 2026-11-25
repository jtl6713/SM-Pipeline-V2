import test from "node:test";
import assert from "node:assert/strict";
import {classifyApprovedPastDueOutput} from "./approved-past-due-recovery-triage.mjs";
const nowMs=Date.parse("2026-11-20T13:30:00Z");
const base={
 id:"recAAAAAAAAAAAAAA",
 fields:{Output_ID:5438,Platform:"Facebook",Platform_Output_Type:"Facebook Photo Set",
  Publish_Status:"Ready to Publish",Do_Not_Publish:false,
  Auto_Publish_Enabled:true,Publish_Retry_Eligible:true,
  FB_Publish_Status:"Ready for Assets",Studio_Publish_Dispatch_Count:2}
};
const call=x=>classifyApprovedPastDueOutput(x,{nowMs});
test("Facebook photo package is repair-only; no authority to post",()=>{
 const got=call(base);assert.match(got.action_group,/^J\./);
 assert.equal(got.public_publish_authorized,false);assert.equal(got.can_repost,false);
});
test("hard hold always wins against a media-ready package",()=>{
 assert.match(call({...base,fields:{...base.fields,Do_Not_Publish:true}}).action_group,/^A\./);
});
test("retry false and null never count as publication permission",()=>{
 for(const value of [false,null]){
  const got=call({...base,fields:{...base.fields,Publish_Retry_Eligible:value}});
  assert.match(got.action_group,/^T\./);assert.equal(got.public_publish_authorized,false);
 }
});
test("existing remote draft is routed to user rather than new TikTok upload",()=>{
 const got=call({...base,fields:{...base.fields,Platform:"TikTok",TikTok_Draft_Publish_ID:"v_inbox_url~v2.123"}});
 assert.match(got.action_group,/^C\./);assert.equal(got.has_saved_remote_identity,true);
});
test("existing published video requires authenticated channel verification",()=>{
 const got=call({...base,fields:{...base.fields,Platform:"YouTube",YouTube_Video_ID:"Ls65TemEHSo"}});
 assert.match(got.action_group,/^D\./);
});
test("rate limits and invalid tokens cannot become automatic retries",()=>{
 assert.match(call({...base,fields:{...base.fields,Studio_Publish_Dispatch_Note:"limit how often you can post"}}).action_group,/^E\./);
 assert.match(call({...base,fields:{...base.fields,Studio_Publish_Dispatch_Note:"Error validating access token: The session has been invalidated"}}).action_group,/^F\./);
});
test("cooldown is preserved and attempted cap is escalated",()=>{
 assert.match(call({...base,fields:{...base.fields,Publish_Next_Retry_At:"2026-11-21T00:00:00Z"}}).action_group,/^H\./);
 assert.match(call({...base,fields:{...base.fields,Studio_Publish_Dispatch_Count:8}}).action_group,/^I\./);
});
test("no saved external id is not proof of nonpublication",()=>{
 const got=call({...base,fields:{...base.fields,Platform:"Instagram",Platform_Output_Type:"Instagram Reel",FB_Publish_Status:"",Studio_Publish_Dispatch_Count:0}});
 assert.match(got.action_group,/^Q\./);assert.equal(got.can_repost,false);
});

const overdueStory=()=>({
 id:"recAAAAAAAAAAAAAA",
 fields:{Output_ID:5947,Platform:"Instagram",Platform_Output_Type:"Instagram Story",
 Review_Status:"Approved",Output_Status:"Approved for Publishing",Publish_Status:"Ready to Schedule",
 Do_Not_Publish:false,Auto_Publish_Enabled:true,Publish_Retry_Eligible:null,
 Scheduled_Post_Date:"2026-11-20T12:00:00.000Z",Review_Decision_At:"2026-11-17T03:42:36.320Z",
 Studio_Publish_Dispatch_At:"2026-11-17T03:42:38.594Z",Studio_Publish_Dispatch_Count:1,
 Studio_Publish_Dispatch_Note:"held until 2026-11-20T12:00:00.000Z",
 Publish_Asset_URL:"https://example.com/story.mp4",Output_Caption:"Approved story caption"}
});
test("exact approval-time scheduled hold is a reconciliation candidate, not a publish authorization",()=>{
 const got=call(overdueStory());
 assert.equal(got.dispatch_evidence,"explicit_pre_schedule_hold_candidate");
 assert.equal(got.explicit_early_hold_candidate,true);
 assert.match(got.action_group,/^R\./);
 assert.equal(got.can_repost,false);
 assert.equal(got.public_publish_authorized,false);
});
test("blank notes, changed due clock, unrelated approval, or native attempts cannot imply a historical false hold",()=>{
 for(const [key,value] of [
  ["Studio_Publish_Dispatch_Note",""],["Scheduled_Post_Date","2026-11-20T11:00:00Z"],
  ["Review_Decision_At","2026-11-16T03:42:36.320Z"],
  ["Publish_Attempt_Count",1],["IG_Story_Attempt_Count",1],
  ["Last_Publish_Attempt_At","2026-11-18T10:00:00Z"],
  ["Publish_Locked_By","provider"],["Platform_Publish_Response_JSON",{"id":"123"}],
  ["Studio_Publish_Dispatch_Count",2]
 ]){
  const row=overdueStory();row.fields[key]=value;
  const got=call(row);
  assert.equal(got.explicit_early_hold_candidate,false,key);
  assert.notEqual(got.dispatch_evidence,"no_saved_attempt",key);
  assert.equal(got.can_repost,false,key);
 }
});
test("previous remote container identities take precedence over null retry eligibility",()=>{
 for(const key of ["IG_Carousel_Parent_Container_ID","IG_Story_Container_ID","YouTube_Upload_Job_ID","Instagram_Reel_Container_ID"]){
  const row=overdueStory();row.fields[key]="123";
  const got=call(row);
  assert.match(got.action_group,/^N\./,key);
  assert.equal(got.has_saved_remote_identity,true,key);
  assert.equal(got.explicit_early_hold_candidate,false,key);
  assert.equal(got.can_repost,false,key);
 }
});
test("fresh eligible first dispatch is not a denied retry or a user action",()=>{
 for(const retry of [null,false,true]){
  const row=overdueStory();
  delete row.fields.Studio_Publish_Dispatch_At;delete row.fields.Studio_Publish_Dispatch_Note;
  row.fields.Studio_Publish_Dispatch_Count=0;row.fields.Publish_Retry_Eligible=retry;
  const got=call(row);
  assert.match(got.action_group,/^S\./);
  assert.equal(got.first_publish_preflight_reason,"fresh_approved_due_unattempted");
  assert.equal(got.owner,"Studio");
  assert.equal(got.public_publish_authorized,false);
 }
});
test("hard hold and future retry remain binding even for exact historical hold evidence",()=>{
 let row=overdueStory();row.fields.Do_Not_Publish=true;
 assert.match(call(row).action_group,/^A\./);
 row=overdueStory();row.fields.Publish_Next_Retry_At="2099-01-01T00:00:00Z";
 assert.match(call(row).action_group,/^H\./);
});
