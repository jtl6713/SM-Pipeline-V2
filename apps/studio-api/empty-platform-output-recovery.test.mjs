import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const code=fs.readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
const section=(name)=>code.slice(code.indexOf("export async function "+name+"("),
  code.indexOf("/*__STUDIO_WORKER_END:"+name+"__*/"));

test("source extraction includes new backend repair without duplicate definitions",()=>{
 assert.doesNotThrow(()=>readStudioWorkerSource());
 assert.match(worker,/\/*__STUDIO_WORKER_EXTRACT:studioRecoverEmptyPlatformOutputCron__\*\//);
 assert.match(worker,/ctx\.waitUntil\(studioRecoverEmptyPlatformOutputCron\(env,ctx\)/);
});

test("root repair is per-profile, exact-plan and zero-output only",()=>{
 const body=section("studioRecoverEmptyPlatformOutputCron");
 assert.match(body,/studioWriteSource\(env\) !== "supabase"/);
 assert.match(body,/No Platform Outputs found for this Production Request/);
 assert.match(body,/String\(f\(requestRecord,"Request_Status"\)\|\|""\)==="Submitted"/);
 assert.match(body,/String\(f\(idea,"Candidate_Status"\)\|\|""\)==="Promoted"/);
 assert.match(body,/owners\.length===1 && owners\[0\]===sampled\.id/);
 assert.match(body,/outputs\.length===0/);
 assert.match(body,/plan\.items\.length===rows\.length/);
 assert.match(body,/planned\.size===rows\.length/);
 assert.match(body,/!productionRequestRevisionOpen\(requestRecord\)/);
 assert.ok(body.indexOf('STUDIO_MEDIA.put(receiptKey') <
   body.indexOf('finalizeProductionRequestPromotion(env,sampled.id'));
 assert.match(body,/recoveryHold:true,skipDirectiveSync:true/);
 assert.match(body,/real\.length===rows\.length/);
 assert.match(body,/real\.every\(row=>f\(row,"Do_Not_Publish"\)===true/);
 assert.doesNotMatch(body,/publishNow|scheduleOutput|sendToMeta|approveAll/i);
});

test("media source failure cannot block creation of user-editable held outputs or silently publish",()=>{
 const effect=code.slice(code.indexOf("export async function buildOutputWorkItemEffective("),
   code.indexOf("/*__STUDIO_WORKER_END:buildOutputWorkItemEffective__*/"));
 const seed=code.slice(code.indexOf("function platformOutputSeedFields("),
   code.indexOf("/*__STUDIO_WORKER_END:platformOutputSeedFields__*/"));
 assert.match(effect,/options\.recoveryHold !== true\) throw error/);
 assert.match(effect,/effective\.music = emptyStudioMusic\(\)/);
 assert.match(effect,/effective\.recovery_media_issue/);
 assert.match(seed,/Render_Status: "Blocked"/);
 assert.match(seed,/Asset_Selection_Notes: effective\.recovery_media_issue/);
 assert.match(seed,/Do_Not_Publish: true/);
 assert.match(seed,/Auto_Publish_Enabled: false/);
 assert.match(seed,/Scheduled_Post_Date: null/);
 assert.match(seed,/Review_Status: "Pending Review"/);
 assert.match(code,/buildOutputWorkItemEffective\(env,outputRow,requestRecord,parent,profileDefaults,\{recoveryHold:options\.recoveryHold===true\}\)/);
});
