import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  META_REVIEW_RECOVERY_MARKER, metaReviewRecoverySourceRow,
  metaReviewRecoveryShapedRecord, metaReviewRecoverySummary,
} from "./meta-review-recovery-attention.mjs";
import { classifyFactoryLane, factoryCardFromRow, partitionFactoryLanes }
  from "./factory-desk.mjs";

const REC = "recABCdef12345678";
const marker = {
  issue:2563, operation:"false_human_revision_reclassification",
  reason:"production_media_recovery_required",
  previous_output_status:"Changes Requested",
};
function row(fields={}) {
  return {
    airtable_record_id: REC, output_number:10821, platform:"Instagram",
    output_status:"In Production", review_status:null,
    publish_status:"Not Ready",do_not_publish:true, auto_publish_enabled:false,
    published_at:null,platform_post_url:null,test_run_id:null,
    error_messages:{[META_REVIEW_RECOVERY_MARKER]:marker},
    ...fields,
  };
}
function shaped(source=row()) {
  return {id:source.airtable_record_id,fields:{
    Platform:source.platform,Output_ID:source.output_number,
    Output_Status:source.output_status,Review_Status:source.review_status,
    Publish_Status:source.publish_status,Do_Not_Publish:source.do_not_publish,
    Auto_Publish_Enabled:source.auto_publish_enabled,Test_Run_ID:source.test_run_id,
    Published_At:source.published_at,Platform_Post_URL:source.platform_post_url,
    ...source.error_messages,
  }};
}
test("#2563 accepts only the exact held, unpublished, prior false-review recovery",()=>{
  assert.equal(metaReviewRecoverySourceRow(row()),true);
  assert.equal(metaReviewRecoveryShapedRecord(shaped()),true);
  assert.equal(metaReviewRecoverySourceRow(row({platform:"YouTube"})),false);
  assert.equal(metaReviewRecoverySourceRow(row({do_not_publish:false})),false);
  assert.equal(metaReviewRecoverySourceRow(row({auto_publish_enabled:true})),false);
  assert.equal(metaReviewRecoverySourceRow(row({published_at:"2026-11-21T12:00:00Z"})),false);
  assert.equal(metaReviewRecoverySourceRow(row({output_status:"Published"})),false);
  assert.equal(metaReviewRecoverySourceRow(row({review_status:"Changes Requested"})),false);
  assert.equal(metaReviewRecoverySourceRow(row({error_messages:{}})),false);
  assert.equal(metaReviewRecoverySourceRow(row({error_messages:{
    [META_REVIEW_RECOVERY_MARKER]:{issue:2563,reason:"production_media_recovery_required"}
  }})),false);
});
test("#2563 each recovery class says what Studio must do, not that user rejected it",()=>{
  for(const [reason,expected] of [
    ["provider_reconciliation_required","Meta publication verification"],
    ["provider_preflight_required","Meta dispatch preflight"],
    ["production_media_recovery_required","Creative media / gallery repair"],
  ]) {
    const data=metaReviewRecoverySummary(shaped(row({error_messages:{
      [META_REVIEW_RECOVERY_MARKER]:{...marker,reason},
    }})));
    assert.equal(data.category,expected);
    assert.equal(data.status,"Studio repair required");
    assert.match(data.next_step,/Studio must/);
    assert.equal(data.action_owner,"studio");
    assert.equal(data.user_action_required,false);
    assert.equal(data.can_approve,false);
    assert.equal(data.can_retry,false);
    assert.equal(data.can_publish,false);
  }
});
test("#2563 recovered outputs go to unlimited Repair lane, never approval or automatic work",()=>{
  const summary=metaReviewRecoverySummary(shaped());
  const cardRow = {
    id:REC, kind:"output",title:"Meta test",platform:"Instagram",studio_state:summary.status,
    meta_repair_required:true,meta_repair_reason:summary.category,
    meta_repair_next_step:summary.next_step,meta_repair_user_action_required:false,
    do_not_publish:true,auto_publish_enabled:false,
    output_status:"In Production",review_status:null,publish_status:"Not Ready",
    review_package_ready:false,
  };
  assert.equal(classifyFactoryLane(cardRow),"manual");
  const card=factoryCardFromRow(cardRow);
  assert.equal(card.can_approve,false);
  assert.equal(card.can_retry,false);
  assert.equal(card.can_publish,false);
  assert.equal(card.meta_repair_user_action_required,false);
  assert.equal(card.meta_repair_reason,summary.category);
  // Explicitly not capped by the R2 three-item Needs Assets working pile.
  const cards=Array.from({length:118},(_,index)=>({...cardRow,id:"recABCdef"+String(index).padStart(8,"0")}));
  const lanes=partitionFactoryLanes(cards);
  assert.equal(lanes.lanes.manual.length,118);
  assert.equal(lanes.lanes.needs_eyes.length,0);
  assert.equal(lanes.lanes.auto_high.length,0);
});
test("#2563 recovery query is independent of Changes Requested and preserved in Factory output set",()=>{
  const source=readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
  const factory=readFileSync(new URL("../studio-web/assets/factory-desk.js",import.meta.url),"utf8");
  const worker=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  assert.match(source,/error_messages->>SM_False_Changes_Requested_Recovery_2563=not\.is\.null/);
  assert.match(source,/metaRecoveredRows = \(metaHeldRows \|\| \[\]\)\.filter\(metaReviewRecoverySourceRow\)/);
  assert.match(source,/heldMetaRepairs = recoveryRows\.filter\(metaReviewRecoverySourceRow\)/);
  assert.match(source,/\.\.\.\(open \|\| \[\]\), \.\.\.heldMetaRepairs/);
  assert.match(source,/\.\.\.protectedReworkRows, \.\.\.metaRecoveredRows/);
  assert.match(source,/\|\| metaReviewRecoveryShapedRecord\(row\)/);
  assert.match(worker,/meta_repair_required: Boolean\(metaRepair\)/);
  assert.match(factory,/Studio repair required/);
  assert.match(factory,/Studio repair required · Publishing held/);
});
