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
 assert.match(code,/platformOutputSeedFields\(parent,requestRecord,outputRow,effective,sourcePackage,\{recoveryHold:options\.recoveryHold===true\}\)/);
 assert.match(code, /\{ routingOnly: true, recoveryHold: options\.recoveryHold === true \}/);
});

test("2593 one-minute cron is independent and still cannot publish",()=>{
 assert.match(worker,/studioRecoverFreeSkylineFerryFanoutCron,/);
 assert.match(worker,/ctx\.waitUntil\(studioRecoverFreeSkylineFerryFanoutCron\(env, ctx\)/);
 assert.match(worker,/version: "0\.10\.1013-ferry-fanout-2593"/);
 const body=section("studioRecoverFreeSkylineFerryFanoutCron");
 assert.match(body,/outputs\.every\(x => f\(x,"Do_Not_Publish"\) === true/);
 assert.match(body,/!f\(x,"Scheduled_Post_Date"\)/);
 assert.match(body,/failed_no_auto_retry/);
});
