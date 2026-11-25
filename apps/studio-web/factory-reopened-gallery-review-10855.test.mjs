/** #10855: old accepted Factory IDs must not hide a new canonical review cycle. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const start = source.indexOf("  function factorySubmittedApprovalIds() {");
const end = source.indexOf("  // A publication hold blocks", start);
assert.ok(start >= 0 && end > start);
const helper = source.slice(start, end);
const id = "recO494MDnQ1Tk51b";
const card = {
  id, kind:"output", output_id:10855, output_status:"Ready for Review",
  review_status:"Review Sent", publish_status:"Not Ready",
  render_status:"Native Photo Route", do_not_publish:false,
  auto_publish_enabled:false, review_package_ready:true,
  scheduled_post_date:null, studio_scheduled_at:null,
  youtube_scheduled_publish_at:null, published_at:null, platform_post_url:null,
};
function evaluate({ current=card, recentHours=12, intent=false,
                    unresolved=false, activityStatus="approved" }={}) {
  const state = {
    submissionIntentIds: new Set(intent ? [id] : []),
    submittingOutputIds: new Set(),
    batch:{}, desk:{lanes:{needs_eyes:[current]}},
  };
  const accepted = {[id]: Date.now() - recentHours*3600000};
  const context = {
    state, Date, recentFactoryAccepted:()=>accepted,
    pendingFactoryApproval:()=>unresolved ? {ids:[id]} : null,
    factoryRecoveryEntries:()=>[],
    factoryActivityRows:()=> [{items:[{id,status:activityStatus}]}],
  };
  return vm.runInNewContext(helper+"\nfactorySubmittedApprovalIds",context)().has(id);
}
test("#10855 returned from old approved to Ready for Review is no longer hidden",()=>{
  assert.equal(evaluate(),false);
});
test("a currently running Factory claim still blocks duplicate submission",()=>{
  assert.equal(evaluate({activityStatus:"processing"}),true);
  assert.equal(evaluate({intent:true}),true);
  assert.equal(evaluate({unresolved:true}),true);
});
test("recent acceptance keeps the bounded asynchronous-request grace",()=>{
  assert.equal(evaluate({recentHours:0.01}),true);
});
test("the restored review must have no hold, schedule, automatic publishing or completed review",()=>{
  for(const override of [
    {do_not_publish:true},{auto_publish_enabled:true},{scheduled_post_date:"2026-11-25T12:00:00Z"},
    {review_status:"Approved"},{publish_status:"Publishing"},{review_package_ready:false},
    {published_at:"2026-11-22T14:00:00Z"},{render_status:"Waiting in Render Queue"},
  ])assert.equal(evaluate({current:{...card,...override}}),true);
});
test("a terminal previously-approved card still stays out of Needs Eyes",()=>{
  assert.equal(evaluate({current:{...card,output_status:"Approved for Publishing"}}),true);
});


test("submitted review-ready cards disappear synchronously, remain hidden through stale snapshots and can reopen after reconciliation",()=>{
  const visibleEnd=source.indexOf("  // Only genuinely unreviewable",end);
  const pendingIds=new Set(),recovery=[],accepted={};
  const state={submissionIntentIds:new Set(),submittingOutputIds:new Set(),batch:{},desk:{lanes:{needs_eyes:[card]}}};
  let items=[];
  const ctx={state,Date,recentFactoryAccepted:()=>accepted,pendingFactoryApproval:()=>pendingIds.size?{ids:[...pendingIds]}:null,
    factoryRecoveryEntries:()=>recovery,factoryActivityRows:()=>[{items}],
    canReviewActions:()=>true,canReviewHeldOutput:c=>c.do_not_publish===true,canRejectHeldOutput:()=>false};
  const visible=vm.runInNewContext(source.slice(start,visibleEnd)+"\nfactoryVisibleNeedsEyes",ctx);
  const other={...card,id:"recOtherOutput001"};
  const both=()=>Array.from(visible([card,other]),c=>c.id);
  assert.deepEqual(both(),[id,other.id]);
  state.submissionIntentIds.add(id);
  assert.deepEqual(both(),[other.id],"click must hide without waiting for any request");
  assert.equal(visible([{...card,do_not_publish:true}]).length,0,"stale held snapshot cannot defeat active fence");
  state.submissionIntentIds.clear();pendingIds.add(id);
  assert.deepEqual(both(),[other.id],"persisted unconfirmed request remains hidden");
  pendingIds.clear();recovery.push({saved:{ids:[id]}});
  assert.deepEqual(both(),[other.id],"reloaded recovery request remains hidden");
  recovery.length=0;items=[{id,status:"processing"}];
  assert.deepEqual(both(),[other.id],"accepted active claim remains hidden");
  items=[{id,status:"approved"}];accepted[id]=Date.now();
  assert.deepEqual(both(),[other.id],"completed receipt cannot resurrect stale RFR");
  items=[];assert.deepEqual(both(),[other.id],"recent acceptance survives activity cleanup");
  accepted[id]=Date.now()-12*3600000;
  assert.deepEqual(both(),[id,other.id],"genuine reopened review remains available");
  delete accepted[id];items=[{id,status:"failed"}];
  assert.deepEqual(both(),[id,other.id],"definitively failed request can reenter canonical review");
});
