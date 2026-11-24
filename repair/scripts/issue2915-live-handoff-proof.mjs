// Verify live server cards with the deployed browser's own pure selection
// and Production predicates. This is not a real user-session click or POST.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const read=p=>fs.readFileSync("/tmp/2915-"+p,"utf8");
const json=p=>JSON.parse(read(p));
const desk=json("desk.json"),policy=json("policy.json"),active=json("active.json");
const production=json("content.json");
const factory=read("factory.js"),app=read("production.js");
assert.ok(Array.isArray(desk.lanes?.needs_eyes),"Factory lane unavailable");
assert.equal(policy.ok,true);
assert.equal(typeof policy.approvals_enabled,"boolean");
assert.ok(Array.isArray(active.batches),"Active batch read unavailable");
assert.ok(Array.isArray(production.records),"Production list unavailable");
const between=(source,a,b)=>{
  const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,"deployed function boundary missing: "+a);
  return source.slice(start,end);
};
const ids=[10863,10864,10865,10867,10868,10875,5628];
const activeIds=new Set();
for(const batch of active.batches){
  for(const item of [...(batch.items||[]),...(batch.children||[]).flatMap(c=>c.items||[])]){
    if(!["approved","already_satisfied","failed","skipped_removed","superseded_duplicate"].includes(String(item.status||"pending").toLowerCase()))activeIds.add(String(item.id));
  }
}
const state={batchApprovalsEnabled:policy.approvals_enabled,batchGlobal:policy.global_rollout||null,batchRollout:policy.rollout||null,selectedOutputs:new Set(),submittingOutputIds:new Set()};
const ctx={state,recentFactoryAccepted:()=>({}),factoryActiveSubmissionIds:()=>activeIds,factorySubmittedApprovalIds:()=>activeIds,canPreview:c=>c.can_preview===true,canDelete:()=>false,cardLabel:c=>c.title||String(c.id),esc:v=>String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"),$:()=>({options:[]})};
const source=[
  between(factory,"  function canReviewActions(","  function canDelete("),
  between(factory,"  function resolveFactoryCardProfileId(","  function factoryProfileId("),
  between(factory,"  function factoryBatchSelectionReason(","  function contentGroupKey("),
  between(factory,"  function factoryHasHumanReviewAction(","  function factoryReviewAttentionCards("),
].join("\n");
const api=vm.runInNewContext(source+"\n({renderCard,canReviewActions,canReviewHeldOutput,factoryBatchSelectionReason,factoryVisibleNeedsEyes})",ctx);
const visible=api.factoryVisibleNeedsEyes(desk.lanes.needs_eyes);
const rows=ids.map(n=>{
  const cards=desk.lanes.needs_eyes.filter(c=>Number(c.output_id)===n);
  const c=cards[0];
  if(!c)return {output:n,exact_count:0,visible:false};
  const html=api.renderCard(c,{lane:"needs_eyes"});
  const checkbox=html.match(/<input[^>]*data-factory-select-output="[^"]+"[^>]*>/)?.[0]||"";
  const heldAction=html.includes('data-factory-held-review="approve:'+c.id+'"');
  return {output:n,exact_count:cards.length,visible:visible.some(x=>x.id===c.id),
    can_preview:c.can_preview===true,review_ready:c.review_package_ready===true,
    held:c.do_not_publish===true,active_submission:activeIds.has(String(c.id)),
    individual:api.canReviewActions(c),batch_selectable:!!checkbox&&!/\bdisabled\b/.test(checkbox),
    held_creative_action:heldAction,reason:api.factoryBatchSelectionReason(c),
    output_status:c.output_status,review_status:c.review_status,publish_status:c.publish_status};
});
const match=app.match(/  function productionContentNeedsWork\(record\) \{[\s\S]*?\n  \}/);
assert.ok(match,"deployed Production predicate missing");
const needsWork=vm.runInNewContext("("+match[0].trim()+")");
const parents=[2222,2223].map(n=>{
  const matches=production.records.filter(c=>Number(c.content_id??c.content_number)===n);
  const c=matches[0];
  return {content:n,exact_count:matches.length,active_count:c?.production_active_output_count??null,
    state_counts:c?.output_state_counts??null,visible_in_production:c?needsWork(c):null};
});
const report={read_only:true,scope:"live service identity plus deployed pure browser predicates; no actual human session or submission",rows,parents};
fs.writeFileSync("/tmp/2915-report.json",JSON.stringify(report,null,2));
console.log("ISSUE2915_EXACT_HANDOFF="+JSON.stringify(report));
assert.ok(rows.slice(0,6).every(r=>r.exact_count===1&&r.visible&&r.can_preview&&r.review_ready&&!r.held&&!r.active_submission&&r.individual&&r.batch_selectable),"NYC exact selection not fully verified");
assert.ok(rows[6].exact_count===1&&rows[6].visible&&rows[6].can_preview&&rows[6].held&&rows[6].held_creative_action&&!rows[6].batch_selectable,"Miami held review action not verified");
assert.ok(parents.every(r=>r.exact_count===1&&r.active_count===0&&r.visible_in_production===false),"Exact Production projection missing or still active");
console.log("ISSUE2915_LIVE_PREDICATE_PROOF=PASS");
