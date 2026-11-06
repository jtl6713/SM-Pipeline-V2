import test from "node:test";
import assert from "node:assert/strict";
import {evaluateNativeGalleryReleaseGate,nativeGalleryRequiredReleaseEvidence as keys} from "./native-gallery-release-gate.mjs";
const head="a".repeat(40),ts="2026-11-02T16:00:00.000Z";
const good=()=>Object.fromEntries(keys.map(k=>[k,{result:"pass",mocked:false,
 evidence_url:"https://github.com/example/valid-proof-"+k,
 executed_at_utc:ts,head_sha:head,tester:"qa-user-verified",
 deployment_id:"staging-20261102",receipt_sha256:"b".repeat(64)}]));
test("missing evidence and unsafe flags always block",()=>{
 const r=evaluateNativeGalleryReleaseGate({head_sha:head,evidence:{},production_flags:{generation:false}});
 assert.equal(r.ready,false);assert.equal(r.blockers.length,keys.length);
 assert.equal(evaluateNativeGalleryReleaseGate({head_sha:head,evidence:good(),production_flags:{generation:true}}).ready,false);
});
test("a claimed pass without proof, a mock, or stale head never clears a gate",()=>{
 for(const mutation of [x=>{x.chicago_canary.mocked=true},x=>{x.ci_exact_head.head_sha="c".repeat(40)},
 x=>{x.generation_rights.evidence_url=""},x=>{x.admin_qa.receipt_sha256=""}]){
  const e=good();mutation(e);
  assert.equal(evaluateNativeGalleryReleaseGate({head_sha:head,evidence:e,production_flags:{generation:false}}).ready,false);
 }
});
test("complete structurally valid proof receipts pass contract only, not live verification",()=>{
 const r=evaluateNativeGalleryReleaseGate({head_sha:head,evidence:good(),production_flags:{generation:false}});
 assert.deepEqual(r,{ready:true,blockers:[]});
});
