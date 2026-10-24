import test from "node:test";import assert from "node:assert/strict";
import {actionApprovalAudit,actionOutcomeAudit} from "./exception-recovery-action-audit.mjs";
const base={record_id:"recAAAAAAAAAAAAAA",client_request_id:"0123456789abcdefgh",action:"finalize_existing_facebook_post",output_id:"3374",post_id:"123456789_987654321",actor:"admin@example.com"};
test("approved action has deterministic event identity and explicit actor/remote IDs",()=>{
 const a=actionApprovalAudit(base);const b=actionApprovalAudit({...base,at:"2026-10-23T00:00:00Z"});
 assert.equal(a.Event_Key,b.Event_Key);
 assert.match(a.Message_Text,/No new posting authorized/);
 assert.equal(a.Actor,"admin@example.com");
 const done=actionOutcomeAudit(a,{status:"verified_published"});
 assert.equal(done.Reply_To_Event_Key,a.Event_Key);
 assert.notEqual(done.Event_Key,a.Event_Key);
});
test("audit refuses unknown actions, missing client identity and malformed record",()=>{
 for(const change of [{action:"delete"},{client_request_id:"short"},{record_id:"invalid"},{actor:""}]){
  assert.throws(()=>actionApprovalAudit({...base,...change}));
 }
});
