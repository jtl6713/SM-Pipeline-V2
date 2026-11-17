import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const home = path.dirname(fileURLToPath(import.meta.url));
const functions04 = fs.readFileSync(path.join(home, "worker-functions-04.mjs"), "utf8");
const qualityUI = fs.readFileSync(path.join(home, "../studio-web/assets/factory-batch-quality-0710.js"), "utf8");
const status = functions04.slice(
  functions04.indexOf("export async function factoryBatchStatusRoute("),
  functions04.indexOf("/*__STUDIO_WORKER_END:factoryBatchStatusRoute__*/")
);
const lowCost = status.slice(status.indexOf('if (url.searchParams.get("quality_only")'), status.indexOf("// Only the explicit view=completed"));

test("Quality Agent is separately bounded from expensive global Factory activity requests", () => {
  assert.ok(lowCost.startsWith('if (url.searchParams.get("quality_only") === "1")'));
  assert.match(lowCost, /studioReadCoalesce\(/);
  assert.match(lowCost, /factoryBatchListGlobal\(env\.STUDIO_MEDIA, \{[\s\S]*?mode: "active", limit: 24, maxScan: 1200/);
  assert.doesNotMatch(lowCost, /factoryApprovalGroupList\(/);
  assert.match(lowCost, /factoryBatchCounts\(job\)/);
  assert.doesNotMatch(lowCost, /factoryBatchSummary\(job\)/);
  assert.match(qualityUI, /query\.set\("quality_only", "1"\)/);
  assert.match(qualityUI, /}, 30000\)/);
});

test("R2 batch-history outage must not suppress independent Supabase Quality Agent counts", () => {
  assert.match(lowCost, /batch_monitor_status: "unavailable"/);
  assert.match(lowCost, /quality_status: "partial"/);
  assert.match(lowCost, /totals: \{ batches: null, pending: null, failed: null, findings: null \}/);
  assert.match(lowCost, /let outputFailures = \{ status: "unavailable"/);
  assert.match(lowCost, /let approvedPastDue = \{ status: "unavailable"/);
  assert.match(lowCost, /return respond\(request, env, \{[\s\S]*?\.\.\.report, output_failures: outputFailures, approved_past_due: approvedPastDue/);
  const failureCatch=lowCost.indexOf('console.warn("Factory quality read-only R2 monitoring degraded"');
  const independentSnapshot=lowCost.indexOf('const snapshot = await loadStudioFailedOutputSnapshot');
  assert.ok(failureCatch >= 0 && independentSnapshot > failureCatch,
    "Supabase census executes after either successful or failed R2 batch read");
  assert.match(qualityUI, /data\?\.batch_monitor_status === "unavailable"/);
  assert.match(qualityUI, /Batch counts and findings are unknown/);
});

test("Partial history is explicitly distinguished from a definitive clean result", () => {
  assert.match(lowCost, /quality_status: history\.complete && !history\.has_more \? "ok" : "partial"/);
  assert.match(qualityUI, /quality_status === "partial"/);
  assert.match(qualityUI, /Partial monitoring snapshot/);
  new Function(qualityUI);
});

test("Factory approval and retry POST routes remain isolated from the GET monitor", () => {
  assert.match(status, /factoryBatchSummary\(job\)/);
  assert.doesNotMatch(lowCost, /factoryBatchDrain\(/);
  assert.doesNotMatch(lowCost, /factoryBatchRetry\(/);
});
