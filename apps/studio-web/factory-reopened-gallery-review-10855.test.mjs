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
