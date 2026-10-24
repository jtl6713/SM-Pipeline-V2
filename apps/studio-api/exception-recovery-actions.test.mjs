import test from "node:test";import assert from "node:assert/strict";
import {executeFb3AdminRecovery,validateFb3Approval,FB3_ACTION,RECEIPT_REPAIR_ACTION,validateApprovedReceiptRepair,executeApprovedReceiptRepair} from "./exception-recovery-actions.mjs";
const id="recAAAAAAAAAAAAAA";
const row=(extra={})=>({id,fields:{Output_ID:3374,Platform:"Facebook",FB_Publish_Status:"Published Pending Finalize",Publish_Status:"Publishing",
 Output_Status:"Approved for Publishing",Platform_Post_ID:"123456789_987654321",Test_Run_ID:"",Do_Not_Publish:false,
 Publish_Locked_By:"",Publish_Locked_At:"",...extra}});
const approval={action:FB3_ACTION,confirm_output_id:"3374",confirm_post_id:"123456789_987654321"};
test("confirmation requires exact output and Facebook post id",()=>{
 assert.equal(validateFb3Approval(row(),approval),null);
 assert.equal(validateFb3Approval(row(),{...approval,confirm_post_id:"111"}),"remote_post_confirmation_mismatch");
 assert.equal(validateFb3Approval(row({Do_Not_Publish:true}),approval),"not_eligible_for_existing_post_finalization");
});
test("verified existing post invokes only the supplied FB3 finalizer and ledger",async()=>{
 let current=row();const called=[];
 const done=await executeFb3AdminRecovery({recordId:id,approval,
  readOutput:async()=>current,
  verifyRemote:async()=>({verified_public:true,platform:"Facebook",remote_id:approval.confirm_post_id,permalink:"https://www.facebook.com/posts/1",evidence:"exact_graph"}),
  finalizeExistingPost:async()=>{called.push("fb3");current=row({Output_Status:"Published",Publish_Status:"Published",Published_At:"2026-10-23T00:00:00Z",Platform_Post_URL:"https://www.facebook.com/posts/1"});return {ok:true};},
  appendLedger:async()=>{called.push("ledger");return {recorded:true};},
 });
 assert.deepEqual(called,["fb3","ledger"]);assert.equal(done.status,"verified_published");assert.equal(done.no_graph_create,true);
});
test("wrong remote receipt or hold blocks all mutation",async()=>{
 for(const v of [{verified_public:false},{verified_public:true,platform:"Facebook",remote_id:"9999",permalink:"https://www.facebook.com/post/1"}]){
 let calls=0;const x=await executeFb3AdminRecovery({recordId:id,approval,readOutput:async()=>row(),
 verifyRemote:async()=>v,finalizeExistingPost:async()=>{calls++;},appendLedger:async()=>{calls++;}});
 assert.equal(x.status,"blocked");assert.equal(calls,0);
 }
});
test("pending after FB3 does not falsely assert published or write ledger",async()=>{
 let ledger=0;
 const r=await executeFb3AdminRecovery({recordId:id,approval,
  readOutput:async()=>row(),
  verifyRemote:async()=>({verified_public:true,platform:"Facebook",remote_id:approval.confirm_post_id,permalink:"https://www.facebook.com/post/1"}),
  finalizeExistingPost:async()=>({ok:true}),
  appendLedger:async()=>{ledger++;},
 });
 assert.equal(r.status,"pending_verification");assert.equal(ledger,0);
});

test("QA-PUBLISH-001 existing receipt repair requires saved public evidence and approval",async()=>{
 const original=row({Review_Status:"Approved",Published_At:"2026-10-23T00:00:00Z",Platform_Post_URL:"https://www.facebook.com/page/posts/987654321"});
 const approve={action:RECEIPT_REPAIR_ACTION,confirm_output_id:"3374",confirm_post_id:"123456789_987654321"};
 assert.equal(validateApprovedReceiptRepair(original,approve),null);
 assert.equal(validateApprovedReceiptRepair(row({Review_Status:"Approved"}),approve),"no_authoritative_published_timestamp");
 assert.equal(validateApprovedReceiptRepair(row({...original.fields,Do_Not_Publish:true}),approve),"publication_held");
});
test("admin-only receipt repair patches statuses, no publisher or asset fields",async()=>{
 let current=row({Review_Status:"Approved",Published_At:"2026-10-23T00:00:00Z",Platform_Post_URL:"https://www.facebook.com/page/posts/987654321"});
 let patched,ledger=0;
 const response=await executeApprovedReceiptRepair({
  recordId:id,approval:{action:RECEIPT_REPAIR_ACTION,confirm_output_id:"3374",confirm_post_id:"123456789_987654321"},
  readOutput:async()=>current,
  verifyRemote:async()=>({verified_public:true,remote_id:"123456789_987654321",platform:"Facebook",
    permalink:"https://www.facebook.com/page/posts/987654321",evidence:"graph_exact"}),
  patchStatus:async(_row,fields)=>{patched=fields;current=row({...current.fields,...fields});},
  appendLedger:async()=>{ledger++;return {recorded:true};},
 });
 assert.equal(response.status,"verified_published");assert.equal(ledger,1);
 assert.deepEqual(Object.keys(patched).sort(),["Output_Status","Publish_Next_Retry_At","Publish_Retry_Eligible","Publish_Status"].sort());
 assert.equal(response.no_new_post,true);
});
test("receipt repair refuses private, missing-ID, held and untrusted URL cases",async()=>{
 const approve={action:RECEIPT_REPAIR_ACTION,confirm_output_id:"3374",confirm_post_id:"123456789_987654321"};
 let writes=0;
 for(const fields of [
  {Do_Not_Publish:true},
  {Platform_Post_URL:"https://www.facebook.com.evil.test/page/12"},
  {Platform_Post_ID:"9999999999"}
 ]) {
  const current=row({Review_Status:"Approved",Published_At:"2026-10-23T00:00:00Z",
    Platform_Post_URL:"https://www.facebook.com/page/posts/987654321",...fields});
  const result=await executeApprovedReceiptRepair({recordId:id,approval:approve,readOutput:async()=>current,
    verifyRemote:async()=>({verified_public:true,remote_id:approve.confirm_post_id,platform:"Facebook",permalink:"https://www.facebook.com/post/12"}),
    patchStatus:async()=>{writes++;},appendLedger:async()=>{writes++;}});
  assert.equal(result.status,"blocked");
 }
 assert.equal(writes,0);
});

test("secondary ledger outage never converts a verified status repair into unsafe retry",async()=>{
 let current=row({Review_Status:"Approved",Published_At:"2026-10-23T00:00:00Z",Platform_Post_URL:"https://www.facebook.com/page/posts/987654321"});
 const result=await executeApprovedReceiptRepair({
  recordId:id,approval:{action:RECEIPT_REPAIR_ACTION,confirm_output_id:"3374",confirm_post_id:"123456789_987654321"},
  readOutput:async()=>current,
  verifyRemote:async()=>({verified_public:true,remote_id:"123456789_987654321",platform:"Facebook",permalink:"https://www.facebook.com/page/posts/987654321"}),
  patchStatus:async(_r,fields)=>{current=row({...current.fields,...fields});},
  appendLedger:async()=>{throw Error("Airtable ledger temporary outage");},
 });
 assert.equal(result.status,"verified_published");
 assert.equal(result.durable_recovery_recorded,false);
});

test("status repair rejects unrelated saved post URL even with a matching provider ID",async()=>{
 const approved={action:RECEIPT_REPAIR_ACTION,confirm_output_id:"3374",confirm_post_id:"123456789_987654321"};
 const initial=row({Review_Status:"Approved",Published_At:"2026-10-23T00:00:00Z",
   Platform_Post_URL:"https://www.facebook.com/page/posts/111111111"});
 let writes=0;
 const result=await executeApprovedReceiptRepair({recordId:id,approval:approved,
   readOutput:async()=>initial,
   verifyRemote:async()=>({verified_public:true,remote_id:approved.confirm_post_id,
     platform:"Facebook",permalink:"https://www.facebook.com/page/posts/987654321"}),
   patchStatus:async()=>{writes++;},appendLedger:async()=>{writes++;},
 });
 assert.equal(result.status,"blocked");
 assert.equal(result.reason,"saved_public_receipt_provider_permalink_mismatch");
 assert.equal(writes,0);
});
test("YouTube canonical watch link and youtu.be saved receipt identify the same video",async()=>{
 const video="dQw4w9WgXcQ";
 let current=row({Platform:"YouTube",Review_Status:"Approved",Platform_Post_ID:video,
   YouTube_Video_ID:video,Published_At:"2026-10-23T00:00:00Z",
   Platform_Post_URL:"https://youtu.be/"+video});
 let writes=0;
 const result=await executeApprovedReceiptRepair({recordId:id,
   approval:{action:RECEIPT_REPAIR_ACTION,confirm_output_id:"3374",confirm_post_id:video},
   readOutput:async()=>current,
   verifyRemote:async()=>({verified_public:true,remote_id:video,platform:"YouTube",
     permalink:"https://www.youtube.com/watch?v="+video,evidence:"youtube_videos_list_exact_id_privacy"}),
   patchStatus:async(_row,fields)=>{writes++;current=row({...current.fields,...fields});},
   appendLedger:async()=>({recorded:true}),
 });
 assert.equal(result.status,"verified_published");
 assert.equal(writes,1);
});
