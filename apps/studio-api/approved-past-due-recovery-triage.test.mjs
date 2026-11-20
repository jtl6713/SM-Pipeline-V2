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
