import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  META_REVIEW_RECOVERY_MARKER, metaRecoveryMediaDiagnostic, metaReviewRecoverySummary,
} from "./meta-review-recovery-attention.mjs";
import { factoryCardFromRow } from "./factory-desk.mjs";

const marker = {
  issue: 2563, operation: "false_human_revision_reclassification",
  reason: "production_media_recovery_required",
};
function record(fields={}) {
  return {id:"recABCdef12345678",fields:{
    Platform:"Instagram",Studio_Output_Type:"Carousel",Output_Status:"In Production",
    Review_Status:null,Publish_Status:"Not Ready",Do_Not_Publish:true,
    Auto_Publish_Enabled:false,[META_REVIEW_RECOVERY_MARKER]:marker,...fields,
  }};
}
test("#2563 video without final media has a specific missing-asset diagnosis",()=>{
  const result=metaRecoveryMediaDiagnostic({Platform:"Instagram",Studio_Output_Type:"Reel",Final_File_URL:null});
  assert.deepEqual(result.missing_assets,["Final publishable video not recorded"]);
  assert.equal(result.asset_evidence,"missing_or_incomplete");
});
test("#2563 photo gallery with no video URL alone is not incorrectly diagnosed as missing",()=>{
  const result=metaRecoveryMediaDiagnostic({Platform:"Facebook",Studio_Output_Type:"Multi-Image Post",Final_File_URL:null});
  assert.deepEqual(result.missing_assets,[]);
  assert.equal(result.asset_evidence,"not_yet_verified");
  assert.match(result.asset_message,/blank video-file field is normal/);
});
test("#2563 a gallery with reported missing final slides is explicitly actionable",()=>{
  const summary=metaReviewRecoverySummary(record({
    IG_Carousel_Error_Message:"AP0C found no C9 final slides for this output.",
  }));
  assert.deepEqual(summary.missing_assets,["Final gallery slides missing or incomplete"]);
  assert.equal(summary.action_owner,"studio");
  assert.equal(summary.user_action_required,false);
  assert.match(summary.next_step,/restore or regenerate missing media/);
});
test("#2563 Factory card preserves the asset diagnosis and a non-publishing hold",()=>{
  const card=factoryCardFromRow({
    id:"recABCdef12345678",kind:"output",platform:"Instagram",
    meta_repair_required:true,meta_repair_reason:"Creative media / gallery repair",
    meta_repair_asset_message:"Final gallery slides missing or incomplete",
    meta_repair_missing_assets:["Final gallery slides missing or incomplete"],
    meta_repair_owner:"Studio automation / repair",
    do_not_publish:true,auto_publish_enabled:false,
  });
  assert.equal(card.can_approve,false);
  assert.equal(card.can_retry,false);
  assert.equal(card.can_publish,false);
  assert.equal(card.do_not_publish,true);
  assert.deepEqual(card.meta_repair_missing_assets,["Final gallery slides missing or incomplete"]);
  assert.match(card.meta_repair_asset_message,/Final gallery/);
});
test("#2563 visible Factory banner counts media and provider issues and identifies action owner",()=>{
  const source=readFileSync(new URL("../studio-web/assets/factory-desk.js",import.meta.url),"utf8");
  assert.match(source,/meta_repair_missing_assets/);
  assert.match(source,/meta_repair_asset_message/);
  assert.match(source,/meta_repair_owner/);
  assert.match(source,/currently require your action/);
  assert.match(source,/View affected outputs/);
  assert.match(source,/No user action requested/);
});
