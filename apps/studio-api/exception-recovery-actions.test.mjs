import test from "node:test";import assert from "node:assert/strict";
import {executeFb3AdminRecovery,validateFb3Approval,FB3_ACTION} from "./exception-recovery-actions.mjs";
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
