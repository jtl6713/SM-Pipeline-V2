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
  assert.match(got.action_group,/^G\./);assert.equal(got.public_publish_authorized,false);
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

const dueFresh=()=>({id:"recAAAAAAAAAAAAAA",fields:{
 Output_ID:5947,Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
 Review_Status:"Approved",Output_Status:"Approved for Publishing",
 Publish_Status:"Ready to Schedule",Auto_Publish_Enabled:true,Do_Not_Publish:false,
 Scheduled_Post_Date:"2026-11-20T12:00:00Z",Output_Caption:"Approved caption",
 Publish_Asset_URL:"https://example.com/approved.mp4"
}});
test("#3096 untouched due output is not mislabeled retry-prohibited for a null/false retry flag",()=>{
 for(const v of [null,false,true]){
  const row=dueFresh();row.fields.Publish_Retry_Eligible=v;
  const got=call(row);
  assert.match(got.action_group,/^R\./);
  assert.equal(got.first_publish_gate_reason,"fresh_approved_due_unattempted");
  assert.equal(got.evidence_state,"no_saved_attempt_evidence");
  assert.equal(got.can_repost,false);
  assert.equal(got.public_publish_authorized,false);
 }
});
test("#3096 prior slot stamp without a note remains ambiguous, including zero count",()=>{
 const row=dueFresh();
 row.fields.Studio_Publish_Dispatch_Count=0;
 row.fields.Studio_Publish_Dispatch_At="2026-10-19T10:00:00Z";
 row.fields.Publish_Retry_Eligible=true;
 const got=call(row);
 assert.equal(got.evidence_state,"ambiguous_dispatch");
 assert.match(got.action_group,/^T\./);
 assert.equal(got.can_repost,false);
});
test("#3096 explicit matching old hold is an audit candidate only, not a provider receipt",()=>{
 const row=dueFresh();
 Object.assign(row.fields,{Studio_Publish_Dispatch_Count:1,
  Studio_Publish_Dispatch_At:"2026-11-10T10:00:00Z",
  Studio_Publish_Dispatch_Note:"held until 2026-11-20T12:00:00Z"});
 let got=call(row);
 assert.equal(got.evidence_state,"explicit_early_hold_requires_audit");
 assert.match(got.action_group,/^S\./);
 assert.equal(got.public_publish_authorized,false);
 row.fields.IG_Story_Attempt_Count=1;
 got=call(row);assert.equal(got.evidence_state,"native_attempt_or_response");
 assert.doesNotMatch(got.action_group,/^[RS]\./);
 delete row.fields.IG_Story_Attempt_Count;
 row.fields.Studio_Publish_Dispatch_Note="held until 2026-11-20T13:00:00Z";
 assert.equal(call(row).evidence_state,"ambiguous_dispatch");
});
test("#3096 native parent/draft/video identities and response supersede a scheduled hold",()=>{
 for(const key of ["IG_Carousel_Parent_Container_ID","YouTube_Upload_Job_ID",
    "Instagram_Reel_Container_ID","IG_Story_Post_ID","FB_Slideshow_Meta_Video_ID"]){
  const row=dueFresh();row.fields[key]="prior-id";
  const got=call(row);
  assert.equal(got.evidence_state,"saved_remote_identity",key);
  assert.equal(got.has_saved_remote_identity,true,key);
  assert.doesNotMatch(got.action_group,/^[RS]\./);
 }
 const row=dueFresh();row.fields.Platform_Publish_Response_JSON='{"id":"previous"}';
 assert.equal(call(row).evidence_state,"native_attempt_or_response");
});
