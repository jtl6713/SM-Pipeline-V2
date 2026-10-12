import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("native photo packages never display video 0/3 destination render counts", () => {
 const from = app.indexOf("function pipelineProgressCell(record, groupRecords)");
 const end = app.indexOf("function normalizeDisplayText(", from);
 assert.ok(from > 0 && end > from);
 const fn = vm.runInNewContext(app.slice(from, end) + "\npipelineProgressCell", {
   pipelineDestinationProgress: () => ({done:0,total:3,percent:0}),
   pipelineOutputRenderInFlight: () => true,
   pipelineDisplayPercent: () => 65,
   escapeHtml: v => String(v),
   value: v => String(v),
 });
 for (const state of ["Preparing Assets", "Ready for Review", "Scheduled"]) {
   const html = fn({render_status:"Native Photo Route",studio_state:state}, [{id:"1"},{id:"2"},{id:"3"}]);
   assert.doesNotMatch(html, /0\/3|destinations rendered/);
   assert.match(html, state === "Preparing Assets" ? /Preparing photos/ : /Photos ready/);
 }
 const video = fn({render_status:"Rendering",studio_state:"Rendering"}, [{id:"1"}]);
 assert.match(video, /0\/3/);
});

test("Pipeline navigation and failed live polls cannot present stale Home snapshot as active output", () => {
 const open = app.slice(app.indexOf("function openDashboardCard("), app.indexOf("function ideaPathMode("));
 assert.doesNotMatch(open,/pipelineOutputs\s*=\s*dashboardCache\.outputs/);
 assert.match(open,/pipelineOutputs = \[\]/);
 const refresh = app.slice(app.indexOf("async function refreshPipelineOutputs("),app.indexOf("async function loadOutputs()"));
 assert.match(refresh,/if \(!Array\.isArray\(outputsResult\?\.records\)\) throw/);
 assert.match(refresh,/Pipeline data is unavailable or out of date/);
 assert.match(refresh,/Pipeline data unverified/);
 assert.match(refresh,/pipelineOutputs = \[\]/);
});
