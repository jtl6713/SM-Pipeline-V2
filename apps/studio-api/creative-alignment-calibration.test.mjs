import test from "node:test";
import assert from "node:assert/strict";
import {calibrateCreativeAlignmentShadow} from "./creative-alignment-calibration.mjs";

const sample=(n,profile_group,stratum,human_label,extra={})=>({
  output_id:"output-"+n,revision:"r1",profile_group,stratum,human_label,
  context:{profile:{id:"profile-"+profile_group,scope:profile_group+" and neighborhoods",city:profile_group},
    title:"Nighttime in "+profile_group,caption:"The city after dark",platform:"Instagram",format:"Reel",
    assets:[{id:"asset-"+n,classification:{city:profile_group,time_of_day:"night"},
      visual_evidence:{description:"city landmark after dark"}}]},...extra
});
const supports=c=>({findings:c.assets.map(a=>({asset_id:a.id,verdict:"plausible_b_roll",
  evidence:[{source:"classification",reason:"Supports broad city theme"}]}))});
const contradicts=c=>({findings:c.assets.map(a=>({asset_id:a.id,verdict:"material_contradiction",
  material_to_story:true,required_relationship:"Explicit named location",
  reason:"Independent visual and location classification contradict required place",
  evidence:[{source:"classification",reason:"Wrong city"},{source:"visual",reason:"Wrong named landmark"}]}))});

test("four-profile calibration counts false repairs and misses without authorizing enforcement",async()=>{
  const samples=[
    sample(1,"Chicago","broad_city","valid",{time_to_factory_ms:1200}),
    sample(2,"Miami","specific_landmark","material_mismatch"),
    sample(3,"Los Angeles","mixed_b_roll","valid"),
    sample(4,"New York","day_night","valid"),
    sample(5,"Miami","sparse_metadata","uncertain"),
    sample(6,"Chicago","explicit_scene","material_mismatch"),
  ];
  samples[0].context.assets[0].classification.subject="Buckingham Fountain";
  let active=0,peak=0;
  const result=await calibrateCreativeAlignmentShadow({samples,review:async c=>{
    assert.equal("human_label" in c,false);
    active++;peak=Math.max(peak,active);
    await Promise.resolve();
    active--;
    return ["asset-3","asset-5","asset-6"].includes(c.assets[0].id)?contradicts(c):supports(c);
  }});
  assert.equal(peak,1);
  assert.equal(result.total.assessed,6);
  assert.equal(result.total.false_repair,1);
  assert.equal(result.total.uncertain_repair,1);
  assert.equal(result.total.missed_mismatch,1);
  assert.equal(result.total.time_to_factory_ms_total,1200);
  assert.equal(result.total.time_to_factory_observed,1);
  assert.deepEqual(result.missing_profiles,[]);
  assert.deepEqual(result.missing_strata,["technical_failure"]);
  assert.equal(result.rows[0].disposition,"pass");
  assert.equal(result.enforcement_authorized,false);
  assert.equal(result.repair_authorized,false);
  assert.equal(result.publishing_authorized,false);
  for(const k of ["approval_actions","schedule_actions","publish_actions"])assert.equal(result[k],0);
});

test("technical exceptions are independent of semantic reviewer availability",async()=>{
  const a=sample(1,"Chicago","technical_failure","technical_failure");
  a.context.technicalFailures=["unverified source rights"];
  const result=await calibrateCreativeAlignmentShadow({samples:[a],review:()=>assert.fail("no semantic call")});
  assert.equal(result.total.exception,1);
  assert.equal(result.total.missed_technical_failure,0);
});

test("reviewer error stops further calls; unavailable is not pass or coverage",async()=>{
  const samples=[sample(1,"Chicago","broad_city","valid"),sample(2,"Miami","specific_landmark","material_mismatch")];
  let calls=0;
  const result=await calibrateCreativeAlignmentShadow({samples,review:()=>{calls++;throw Error("unavailable");}});
  assert.equal(calls,1);
  assert.equal(result.total.reviewer_unavailable,2);
  assert.equal(result.total.assessed,0);
  assert.equal(result.total.pass,0);
  assert.equal(result.complete_batch,false);
  assert.equal(result.missing_profiles.length,4);
});

test("timeout aborts reviewer and prevents additional calls",async()=>{
  let signal,calls=0;
  const result=await calibrateCreativeAlignmentShadow({timeoutMs:5,
    samples:[sample(1,"Chicago","broad_city","valid"),sample(2,"Miami","specific_landmark","valid")],
    review:(_,opts)=>{calls++;signal=opts.signal;return new Promise(()=>{});}});
  assert.equal(signal.aborted,true);
  assert.equal(calls,1);
  assert.equal(result.total.reviewer_unavailable,2);
});

test("reviewer cannot manufacture corroborating evidence by mutating input",async()=>{
  const a=sample(1,"Miami","sparse_metadata","uncertain");
  a.context.assets[0].visual_evidence=null;
  const result=await calibrateCreativeAlignmentShadow({samples:[a],review:c=>{
    c.assets[0].visual_evidence={description:"invented"};
    return contradicts(c);
  }});
  assert.equal(result.rows[0].disposition,"warn_pass_through");
  assert.equal(result.total.uncertain_repair,0);
});

test("mismatched profile, duplicate revision, invalid label and oversized sample are rejected or unknown",async()=>{
  const a=sample(1,"Miami","broad_city","valid");
  a.context.profile.city="Chicago";
  const result=await calibrateCreativeAlignmentShadow({samples:[a],review:()=>assert.fail("unverified context")});
  assert.equal(result.total.invalid_context,1);
  assert.equal(result.total.assessed,0);
  await assert.rejects(()=>calibrateCreativeAlignmentShadow({samples:[a,a],review:supports}),/Duplicate/);
  await assert.rejects(()=>calibrateCreativeAlignmentShadow({samples:[{...a,human_label:"model_generated"}],review:supports}),/independently labeled/);
  await assert.rejects(()=>calibrateCreativeAlignmentShadow({samples:Array.from({length:17},(_,i)=>sample(i,"Miami","day_night","valid")),review:supports}),/bounded batch/);
});
