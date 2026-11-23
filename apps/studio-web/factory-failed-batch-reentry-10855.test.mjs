import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/factory-desk.js",import.meta.url),"utf8");
const from=source.indexOf("    const failedTarget = item => {");
const to=source.indexOf("    details.innerHTML = latest ?",from);
assert.ok(from>0&&to>from);
const helpers=source.slice(from,to);
const id="recO494MDnQ1Tk51b";
const failure={id,output_id:10855,profile_id:"recgtK8Z7eNADNtVy",
  status:"failed",error:"Cannot approve: publishing hold is active"};
const current={id,kind:"output",output_id:10855,do_not_publish:false,
  output_status:"Ready for Review",review_status:"Review Sent",publish_status:"Not Ready",
  scheduled_post_date:null,studio_scheduled_at:null,published_at:null,platform_post_url:null};

function evaluate(desk,item=failure){
  const ctx={state:{desk},esc:x=>String(x).replaceAll('"','&quot;')};
  return vm.runInNewContext(helpers+"\n({target:failedTarget, hint:failedBatchHint})",ctx);
}
test("historical hold failure #10855 remains historical after live release, and has a path back to review",()=>{
 const {target,hint}=evaluate({lanes:{needs_eyes:[current]}});
 const state=target(failure);
 assert.equal(state.inEyes,true);
 assert.equal(state.currentHoldReleased,true);
 assert.match(hint(failure),/original batch result remains Failed/);
 assert.match(hint(failure),/Find in Needs Eyes/);
 assert.match(hint(failure),/data-factory-failed-open="recO494MDnQ1Tk51b"/);
});
test("failed #10855 absent from canonical review still has safe navigation, never a false approval",()=>{
 const {target,hint}=evaluate({lanes:{needs_eyes:[],manual:[]}});
 assert.equal(target(failure).currentHoldReleased,false);
 assert.match(hint(failure),/historical attempt result/);
 assert.match(hint(failure),/Open output in Pipeline/);
 assert.doesNotMatch(hint(failure),/publishing hold released/);
});
test("live holds and unrelated failures cannot be represented as resolved",()=>{
 const {target,hint}=evaluate({lanes:{needs_eyes:[{...current,do_not_publish:true}]}});
 assert.equal(target(failure).currentHoldReleased,false);
 assert.equal(hint({...failure,status:"approved"}),"");
 assert.equal(hint({...failure,error:"missing approved slides"}),"");
 assert.equal(hint({...failure,id:"../../bad-id"}),""); 
});
test("failure-details navigation never retries, approves or publishes",()=>{
 const start=source.indexOf('    details.querySelectorAll("[data-factory-failed-open]")');
 const end=source.indexOf('    details.querySelector("[data-factory-copy-batch]")',start);
 assert.ok(start>0&&end>start);
 const action=source.slice(start,end);
 assert.match(action,/openStudioTarget/);
 assert.match(action,/factoryNeedsEyesSearch/);
 assert.doesNotMatch(action,/fetchJson\s*\(|mutateDesk\s*\(|approve\s*\(|retryFactoryBatchFailures\s*\(/);
});
