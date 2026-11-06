import test from "node:test";
import assert from "node:assert/strict";
import {enrollReview,applyReviewEvent,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {inspectReviewPlan} from "./rendering-review-plan-preflight.mjs";

const ID="recA1B2C3D4E5F6G7";
const assetId="master_asset_12345678";
const candidate={
  explanation:"Cut an unnecessary pause and use one approved opening clip.",
  narration:"See Chicago differently on your next visit.",
  changes:["Trim the middle pause"],preserve:[],
  reuse_asset_ids:[assetId],
  timeline:[{start_seconds:0,end_seconds:17,direction:"Use the approved shot",
    asset_ids:[assetId]}],
  requirements:[],claims:[],acceptance_checks:["The revised Reel is 17 seconds long"],
};
const clone=x=>structuredClone(x);
const source={verified:true,authority:"server",output_id:ID,profile_id:CHICAGO_PROFILE_ID,
  attempt_id:"attempt_original_123",artifact_id:"drive-master-123",
  drive_file_id:"drive-master-123",canonical_media_authority:"google_drive"};
const asset={id:assetId,verified:true,authority:"server",rights_clear:true,
  drive_file_id:"drive-asset-321",profile_id:CHICAGO_PROFILE_ID,
  canonical_media_authority:"google_drive",rights_receipt_id:"rights-123",
  media_type:"video"};
function session(withCandidate=candidate){
  const hold={id:"rrhold_12345678",owner:"rrsession_12345678",
    verified:true,output_id:ID,active:true};
  const s=enrollReview({id:ID,profile_id:CHICAGO_PROFILE_ID,
    platform:"Instagram",output_type:"Instagram Reel",render_status:"Rendered",
    final_file_id:source.artifact_id},hold,{
    enabled:true,profile_ids:[CHICAGO_PROFILE_ID],
    output_types:["Instagram Reel"],manual_admission:true},
    {session_id:hold.owner,original_attempt_id:source.attempt_id});
  return applyReviewEvent(s,{
    type:"PRODUCER_CANDIDATE",expected_version:1,
    idempotency_key:"candidate_req_12345678",fingerprint:"candidate_fp_12345678",
    candidate:withCandidate,candidate_hash:"a".repeat(64),
    evidence_hash:"b".repeat(64),user_message_id:"user_msg_12345678",
    producer_message_id:"model_msg_12345678",direction:"Trim pauses",
    summary:"I propose a tighter cut",at:"2026-10-28T14:10:00Z",
  }).session;
}
const args=()=>({session:session(),source:clone(source),assets:[clone(asset)]});
test("trusted evidence compiles deterministic immutable plan with no publishing permissions",async()=>{
  const a=await inspectReviewPlan(args());
  const b=await inspectReviewPlan(args());
  assert.equal(a.ready_to_commit,true);
  assert.equal(a.frozen,true);
  assert.equal(a.plan_hash,b.plan_hash);
  assert.equal(a.plan.source_artifact_id,"drive-master-123");
  assert.equal(a.plan.asset_manifest[0].drive_file_id,asset.drive_file_id);
  assert.equal(a.plan.allow_public_publish,false);
  assert.equal(a.plan.allow_platform_upload,false);
  assert.equal(a.plan.mutate_original_production_request,false);
  assert.equal(a.plan.mutate_sibling_outputs,false);
  assert.equal(a.plan.auto_approve,false);
  assert.deepEqual(a.event_preview.missing_assets,[]);
  assert.equal(a.event_preview.plan_version,1);
});
test("missing asset/provenance or cross-profile rights never become a render-ready plan",async()=>{
  for(const changed of [[],[{...asset,rights_clear:false}],
    [{...asset,profile_id:"recO1T2H3E4R5P6R7",cross_profile_authorized:false}],
    [{...asset,drive_file_id:""}]]){
    const result=await inspectReviewPlan({...args(),assets:changed});
    assert.equal(result.ready_to_commit,false);
    assert.equal(result.blockers[0].kind,"asset");
    assert.equal(result.event_preview.missing_assets.length,1);
  }
});
test("factual instructional claims cannot be blessed by model source labels",async()=>{
  const c=clone(candidate);c.claims=[{claim:"Chicago has a specific train route",source_ids:["source-1"]}];
  const x=await inspectReviewPlan({...args(),session:session(c)});
  assert.equal(x.frozen,false);
  assert.equal(x.ready_to_commit,false);
  assert.equal(x.blockers[0].kind,"research");
  const supported=await inspectReviewPlan({...args(),session:session(c),
    factReceipts:[{claim:c.claims[0].claim,source_attempt_id:source.attempt_id,
      candidate_hash:"a".repeat(64),authority:"server",verified:true,
      verified_at:"2026-10-28T14:12:00Z",source_urls:["https://transit.test/rules"]}]});
  assert.equal(supported.ready_to_commit,true);
});
test("preserved footage needs scene-specific server evidence, not just an observation",async()=>{
  const c=clone(candidate);c.preserve=["Keep the opening clip"];
  c.timeline[0].asset_ids=[];
  const needs=await inspectReviewPlan({...args(),session:session(c)});
  assert.equal(needs.ready_to_commit,false);
  assert.ok(needs.blockers.some(x=>x.kind==="visual_verification"));
  const generic=await inspectReviewPlan({...args(),session:session(c),
    visualReceipt:{verified:true,authority:"server",
      source_attempt_id:source.attempt_id,
      source_drive_file_id:source.drive_file_id,
      observed_segments:[{start_seconds:0,end_seconds:17}]}});
  assert.equal(generic.ready_to_commit,false);
  const precise={verified:true,authority:"server",
    source_attempt_id:source.attempt_id,
    source_drive_file_id:source.drive_file_id,
    observed_segments:[{verified:true,authority:"server",
      timeline_scene_index:0,preserve_instruction:c.preserve[0],
      source_attempt_id:source.attempt_id,
      source_drive_file_id:source.drive_file_id,
      source_start_seconds:0,source_end_seconds:17,
      render_url:"https://media.example/drive-clip"}]};
  const passed=await inspectReviewPlan({...args(),session:session(c),
    visualReceipt:precise});
  assert.equal(passed.ready_to_commit,true);
  assert.equal(passed.plan.creative.timeline[0].preserve_source,true);
  assert.equal(passed.plan.creative.timeline[0].preserve_instruction,c.preserve[0]);
  assert.equal(passed.plan.preservation_manifest[0].timeline_scene_index,0);
  const forged=clone(precise);forged.observed_segments[0].source_end_seconds=9;
  const drifted=await inspectReviewPlan({...args(),session:session(c),
    visualReceipt:forged});
  assert.equal(drifted.ready_to_commit,false);
  assert.ok(drifted.blockers.some(x=>x.kind==="visual_verification"));
});
test("an asset requirement remains blocked until a server-verified exact requirement receipt",async()=>{
  const c=clone(candidate);
  c.requirements=[{kind:"asset",description:"An exact readable entry sign",
    alternatives:["Use a verified deterministic diagram"]}];
  const needs=await inspectReviewPlan({...args(),session:session(c)});
  assert.equal(needs.frozen,true);
  assert.equal(needs.ready_to_commit,false);
  const requirement=needs.blockers[0];
  assert.equal(requirement.kind,"asset");
  const accepted=await inspectReviewPlan({...args(),session:session(c),
    requirementReceipts:[{requirement_id:requirement.id,
      source_attempt_id:source.attempt_id,candidate_hash:"a".repeat(64),
      verified:true,authority:"server",provenance:"drive-asset-validated"}]});
  assert.equal(accepted.ready_to_commit,true);
});
test("changed source attempt, stale model candidate, wrong media authority and missing hold deny",async()=>{
  const stale=args();stale.session.producer_candidate.stale=true;
  await assert.rejects(()=>inspectReviewPlan(stale),e=>e.code==="PRODUCER_CANDIDATE_STALE");
  const changed=args();changed.source.artifact_id="different-file";
  await assert.rejects(()=>inspectReviewPlan(changed),e=>e.code==="SOURCE_AUTHORITY_MISSING");
  const external=args();external.source.canonical_media_authority="r2";
  await assert.rejects(()=>inspectReviewPlan(external),e=>e.code==="SOURCE_AUTHORITY_MISSING");
  const unheld=args();unheld.session.review_hold.active=false;
  await assert.rejects(()=>inspectReviewPlan(unheld),e=>e.code==="REVIEW_NOT_EDITABLE");
});
test("ready plan hash changes when the actual creative timeline changes",async()=>{
  const a=await inspectReviewPlan(args());
  const c=clone(candidate);
  c.timeline[0].end_seconds=21;
  const b=await inspectReviewPlan({...args(),session:session(c)});
  assert.notEqual(a.plan_hash,b.plan_hash);
});

test("false source verification and unverified rights never become a ready plan",async()=>{
  const untrusted=args();untrusted.source.verified=false;
  await assert.rejects(()=>inspectReviewPlan(untrusted),e=>e.code==="SOURCE_AUTHORITY_MISSING");
  for(const changed of [{...asset,authority:"model"},{...asset,rights_receipt_id:""}]){
    const result=await inspectReviewPlan({...args(),assets:[changed]});
    assert.equal(result.ready_to_commit,false);
    assert.ok(result.blockers.some(b=>b.kind==="asset"));
  }
});
test("gapped or multi-asset timelines fail before committing immutable jobs",async()=>{
  const gap=clone(candidate);
  gap.timeline.push({start_seconds:18,end_seconds:20,direction:"Later scene",
    asset_ids:[assetId]});
  await assert.rejects(
    ()=>inspectReviewPlan({...args(),session:session(gap)}),
    e=>e.code==="TIMELINE_INVALID");
  const multiple=clone(candidate);
  multiple.timeline[0].asset_ids=[assetId,assetId];
  await assert.rejects(
    ()=>inspectReviewPlan({...args(),session:session(multiple)}),
    e=>e.code==="TIMELINE_INVALID");
});

test("frozen plan only reuses authenticated source audio when narration and Drive URL match",async()=>{
  const original={
    ...clone(source),
    original_voiceover_text:candidate.narration,
    original_voiceover_url:"https://drive.google.com/uc?export=download&id=1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2",
  };
  const a=await inspectReviewPlan({...args(),source:original});
  assert.equal(a.ready_to_commit,true);
  assert.equal(a.plan.creative.preserve_original_audio,true);
  const legacy=await inspectReviewPlan({...args(),source:{...original,
    original_voiceover_url:"https://drive.google.com/uc?id=1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2&export=download"}});
  assert.equal(legacy.plan.creative.preserve_original_audio,true);
  assert.equal(legacy.ready_to_commit,true);
  assert.notEqual(a.plan_hash,(await inspectReviewPlan(args())).plan_hash);
  for(const changed of [
    {original_voiceover_text:"Different voiceover"},
    {original_voiceover_url:"https://example.org/audio.mp3"},
    {original_voiceover_url:"https://drive.google.com/uc?export=download&id=123&extra=1"},
    {original_voiceover_url:""},
  ]){
    const b=await inspectReviewPlan({...args(),source:{...original,...changed}});
    assert.equal(b.plan.creative.preserve_original_audio,false);
    assert.equal(b.ready_to_commit,true);
  }
  const newScript=clone(candidate);
  newScript.narration="New words must use new text-to-speech";
  const changed=await inspectReviewPlan({
    ...args(),source:original,session:session(newScript),
  });
  assert.equal(changed.plan.creative.preserve_original_audio,false);
});
