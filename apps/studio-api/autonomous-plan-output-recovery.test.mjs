import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autonomousPlanOutputSpilloverRepair } from "./autonomous-plan-output-recovery.mjs";

const stamp = "2026-10-23T20:27:08.669Z";
const request = {
  notes: "origin=autonomous\nQuick carousel map of local art\nez-photo-wait=off",
  revisionOpen: false, promoted: false, active: true, status: "Draft",
  masterStatus: "Ready", planStatus: "Ready", variantStatus: "Ready",
  masterAssetCount: 8, createdAt: "2026-10-23T20:25:08.669Z",
};
const plan = {
  schema_version: "item4.output-plan.1",
  generated_at: "2026-10-23T20:27:05.908Z",
  source_asset_count: 8,
  items: [
    { platform: "Instagram", output_type: "Carousel" },
    { platform: "Facebook", output_type: "Multi-Image Post" },
    { platform: "TikTok", output_type: "Multi-Photo" },
  ],
};
const specs = [
  ["i-reel", "Instagram", "Reel"],["fb-reel", "Facebook", "Reel"],
  ["tt-video", "TikTok", "Video Draft"],["yt-short", "YouTube", "Short"],
  ["i-story", "Instagram", "Story"],["fb-story", "Facebook", "Story"],
  ["i-carousel", "Instagram", "Carousel"],["fb-photo", "Facebook", "Multi-Image Post"],
  ["tt-photo", "TikTok", "Multi-Photo"],
];
const rows = specs.map(([id, platform, outputType]) => ({
  id,platform,outputType,enabled:true,active:true,status:"Draft",
  hasPlatformOutput:false,createdAt:stamp,updatedAt:stamp,
}));

test("recover only untouched extra outputs outside the authoritative photo plan",()=>{
  const result=autonomousPlanOutputSpilloverRepair({request,plan,rows});
  assert.equal(result.repair,true);
  assert.deepEqual(result.disableIds,["i-reel","fb-reel","tt-video","yt-short","i-story","fb-story"]);
  assert.ok(!result.disableIds.includes("i-carousel"));
  assert.ok(!result.disableIds.includes("fb-photo"));
  assert.ok(!result.disableIds.includes("tt-photo"));
});
test("operator edited or published extra destinations never get disabled",()=>{
  for(const variation of [
    rows.map((r,i)=>i===0?{...r,updatedAt:"2026-10-24T12:00:00Z"}:r),
    rows.map((r,i)=>i===0?{...r,hasPlatformOutput:true}:r),
    rows.map((r,i)=>i===0?{...r,status:"In Production"}:r),
    rows.map((r,i)=>i===0?{...r,enabled:false}:r),
  ]) assert.equal(autonomousPlanOutputSpilloverRepair({request,plan,rows:variation}).repair,false);
});
test("do not repair manual, revised, promoted or stale proposals",()=>{
  for(const alternative of [
    {...request,notes:"human proposal"},
    {...request,revisionOpen:true},
    {...request,promoted:true},
    {...request,status:"Submitted"},
    {...request,masterAssetCount:9},
    {...request,createdAt:"2026-10-22T20:25:08.669Z"},
  ]) assert.equal(autonomousPlanOutputSpilloverRepair({request:alternative,plan,rows}).repair,false);
});
test("plan scope and selected media stay unchanged, only the original extras are eligible",()=>{
  const result=autonomousPlanOutputSpilloverRepair({request,plan,rows});
  assert.equal(plan.items.length,3);
  assert.equal(rows.every(r=>r.active),true);
  assert.equal(result.reason,"untouched_autonomous_companion_spillover");
});
test("production claim invokes the guarded reconciliation before bridge preflight",()=>{
  const source=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const claim=source.slice(source.indexOf("async function processReadyProductionClaim("),
    source.indexOf("async function studioReadyProductionCronResume("));
  assert.match(claim,/reconcileAutonomousPlanOutputSpillover\(env, requestRecord\)/);
  assert.match(claim,/finishAutonomousProductionRequest/);
  assert.ok(claim.indexOf("reconcileAutonomousPlanOutputSpillover(env, requestRecord)")
    <claim.indexOf("const finished = await finishAutonomousProductionRequest("));
});
