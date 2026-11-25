import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const code=fs.readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const section=(name)=>code.slice(code.indexOf("export async function "+name+"("),code.indexOf("/*__STUDIO_WORKER_END:"+name+"__*/"));

test("2593 exact ferry repair preflights the 2 original IG/FB destinations, never missing outputs as success",()=>{
 const body=section("studioRecoverFreeSkylineFerryFanoutCron");
 assert.ok(body.startsWith("export async function"));
 for(const id of ["reczvqjo1xs2jYXn0","recBFUCFOx5hEnj0e","recbxdvQZTDm61Ctq"])assert.ok(body.includes(id));
 assert.match(body,/exactNycHandoffPreflight/);
 assert.match(body,/studioWriteSource\(env\) !== "supabase"/);
 assert.match(body,/originalOutputs\.length !== 0/);
 assert.match(body,/plan_destinations_mismatch/);
 assert.match(body,/preflight:"zero_platform_outputs_and_exact_two_enabled_destinations"/);
 assert.ok(body.indexOf("STUDIO_MEDIA.put(receiptKey") < body.indexOf("finalizeProductionRequestPromotion(env, target.request"));
 assert.match(body,/onlyIf: new Headers\(\{ "If-None-Match": "\*" \}\)/);
 assert.match(body,/resumed = response\?\.accepted === true/);
 assert.doesNotMatch(body,/publishPlatform|publishNow|approvePlatform|schedulePlatform|postToMeta/i);
});

test("2593 output seed applies publication hold AFTER all normal scheduled stamps",()=>{
 const start=code.indexOf("function platformOutputSeedFields(");
 const end=code.indexOf("/*__STUDIO_WORKER_END:platformOutputSeedFields__*/",start);
 const body=code.slice(start,end);
 const schedule=body.indexOf("...(function scheduledStamp()");
 const hold=body.indexOf("...(options.recoveryHold === true ?");
 assert.ok(schedule>0 && hold>schedule, "hold overrides any source requested schedule");
 assert.match(body,/Do_Not_Publish: true/);
 assert.match(body,/Auto_Publish_Enabled: false/);
 assert.match(body,/Output_Status: "In Production"/);
 assert.match(body,/Scheduled_Post_Date: null/);
 assert.match(body,/Studio_Scheduled_At: null/);
 assert.match(body,/YouTube_Scheduled_Publish_At: null/);
 assert.match(code,/platformOutputSeedFields\(parent,requestRecord,outputRow,effective,sourcePackage,\{\s*recoveryHold:options\.recoveryHold===true,\s*recoveryReviewOnly:options\.recoveryReviewOnly===true,\s*\}\)/);
 assert.match(body,/options\.recoveryReviewOnly === true \? \{\} : \{ Do_Not_Publish: true \}/);
 assert.doesNotMatch(section("studioRecoverFreeSkylineFerryFanoutCron"),/recoveryReviewOnly/);
 assert.match(code, /\{ routingOnly: true, recoveryHold: options\.recoveryHold === true,/);
 assert.match(code, /skipDirectiveSync: options\.recoveryHold === true && options\.skipDirectiveSync === true/);
});

test("2593 one-minute cron is independent and still cannot publish",()=>{
 assert.match(worker,/studioRecoverFreeSkylineFerryFanoutCron,/);
 assert.match(worker,/ctx\.waitUntil\(studioRecoverFreeSkylineFerryFanoutCron\(env, ctx\)/);
 assert.match(worker,/version: "0\.10\.\d+-[A-Za-z0-9-]+"/, "active Worker build identifier remains well-formed");
 const body=section("studioRecoverFreeSkylineFerryFanoutCron");
 assert.match(body,/outputs\.every\(x => f\(x,"Do_Not_Publish"\) === true/);
 assert.match(body,/!f\(x,"Scheduled_Post_Date"\)/);
 assert.match(body,/failed_no_auto_retry/);
});

test("2593 v2 never repeats a prior failed mutation; only retries canonical GETs", () => {
  const action = section("studioRecoverFreeSkylineFerryFanoutCron");
  const finalize = section("finalizeProductionRequestPromotion");
  const fanout = section("fanoutProductionRequestOutputsToContentItems");
  const sideEffects = section("completeProductionRequestPromotionSideEffects");
  assert.match(action, /free-skyline-ferry-hold-v2/);
  assert.match(action, /studio\.issue2593\.free-skyline-held-fanout\.2/);
  assert.match(action, /readExact\("existing_outputs"/);
  assert.match(action, /skipDirectiveSync: true/);
  assert.match(action, /for \(let attempt = 1; attempt <= 3; attempt\+\+\)/);
  assert.match(finalize, /const canonicalRead = async/);
  assert.match(finalize, /options\.recoveryHold !== true/);
  assert.match(fanout, /const canonicalFanoutRead = async/);
  assert.match(fanout, /canonicalFanoutRead\("destinations"/);
  assert.match(fanout, /canonicalFanoutRead\("parent_content"/);
  assert.match(sideEffects, /options\.recoveryHold === true && options\.skipDirectiveSync === true/);
  assert.match(sideEffects, /recovery_fanout:/);
  assert.match(action, /onlyIf: new Headers\(\{ "If-None-Match": "\*" \}\)/);
  assert.match(action, /outputs\.every\(x => f\(x,"Do_Not_Publish"\) === true/);
});
