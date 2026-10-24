import test from "node:test";
import assert from "node:assert/strict";
import {assessRecoveryPreflight,PREFLIGHT_ACTIONS} from "./exception-recovery-preflight.mjs";
const base=(fields={})=>({id:"recAAAAAAAAAAAAAA",fields:{
 Review_Status:"Approved",Output_Status:"Approved for Publishing",Publish_Status:"Publishing",
 Studio_Publish_Dispatch_Count:2,...fields}});
test("existing remote ID never enables duplicate publishing",()=>{
 const r=assessRecoveryPreflight(base({YouTube_Video_ID:"YT123456",Studio_Publish_Dispatch_Count:8}));
 assert.equal(r.remote_identity_exists,true);
 assert.equal(r.remote_publication_verified,false);
 assert.equal(r.category,"remote_identity_unverified");
 assert.equal(r.actions.retry_failed_stage.can_execute,false);
 assert.match(r.actions.retry_failed_stage.blocked_reason,/verify provider/);
});
test("held and rate-limited outputs cannot silently resume",()=>{
 const held=assessRecoveryPreflight(base({Do_Not_Publish:true}));
 const delayed=assessRecoveryPreflight(base({Publish_Next_Retry_At:"2099-01-01T00:00:00Z"}));
 assert.equal(held.category,"intentional_hold");
 assert.equal(held.actions.resume_processing.can_execute,false);
 assert.equal(delayed.category,"provider_cooldown");
 assert.equal(delayed.actions.resume_processing.can_execute,false);
});
test("all correction types remain gated until backed by action-specific adapters",()=>{
 const r=assessRecoveryPreflight(base());
 assert.deepEqual(Object.keys(r.actions),PREFLIGHT_ACTIONS);
 assert.ok(Object.values(r.actions).every(x=>x.can_execute===false&&x.requires_confirmation));
});
test("invalid output identity rejected before inspection",()=>{
 assert.throws(()=>assessRecoveryPreflight({id:"fake",fields:{}}));
});
