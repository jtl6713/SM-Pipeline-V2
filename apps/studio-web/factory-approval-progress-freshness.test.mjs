import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
test("Factory active approval progress refresh is bounded, transparent, and uses one snapshot", async () => {
  const factory = await readFile(path.join(here, "assets/factory-desk.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(factory, /function updateFactoryBatchFreshness\(/);
  assert.match(factory, /Status delayed · last updated/);
  assert.match(factory, /lastBatchSuccessMs = Date\.now\(\)/);
  assert.match(factory, /timeoutMs: 12000/);
  assert.match(factory, /\}, 3000\);/);
  assert.match(factory, /if \(state\.batchActivityLoading\) \{/);
  assert.match(factory, /batchRefreshRequested = true/);
  assert.match(factory, /Promise\.allSettled\(fastGroups/);
  assert.match(factory, /aggregateDone = batches\.reduce/);
  assert.match(factory, /const completed = Number\(row\.done_count/);
  assert.match(factory, /state\.batchActivityError = String\(error/);
  assert.doesNotMatch(factory, /"Live · batches needing action"/);
  assert.match(html, /activity=global-parent-child-v6-freshness/);
});

test("Factory active approvals show actual stages, output identity, elapsed and retry health", async () => {
  const factory = await readFile(path.join(here, "assets/factory-desk.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  const css = await readFile(path.join(here, "assets/factory-live-approval-progress.css"), "utf8");
  for (const name of [
    "Queued", "Validating", "Approving", "Verifying", "Completed", "Failed",
    "Last update", "Elapsed", "Recovery attempt", "Waiting to retry",
    "No recent progress; recovery may be required",
  ]) assert.ok(factory.includes(name), "missing live stage or health: " + name);
  assert.match(factory, /function factoryLiveCurrent\(/);
  assert.match(factory, /function factoryLiveSummaryHtml\(/);
  assert.match(factory, /factoryLiveItemHtml\(item\)/);
  assert.match(factory, /factoryLiveSummaryHtml\(items\.filter/);
  assert.match(factory, /hasPendingWork \? 3000 : 15000/);
  assert.match(factory, /function factoryBatchMergeExactActivity\(/);
  assert.match(factory, /request_id: row\.request_id/);
  assert.match(factory, /lastBatchFullFetchMs/);
  assert.match(factory, /return groupCount > 0;/);
  assert.match(factory, /discoveryAge >= 60000/);
  assert.match(factory, /factoryBatchPollWithFallback\(/);
  assert.match(factory, /factoryBatchPollWindow\(\[\.\.\.knownGroups, \.\.\.remembered\]/);
  assert.match(factory, /const fastGroups = window\.groups/);
  assert.match(factory, /Exact Factory progress is unavailable; retaining prior snapshot/);
  assert.match(factory, /overall\.hidden = !batches\.length;/);\n  assert.match(factory, /Latest completed submission/);
  assert.match(html, /factory-live-approval-progress\.css/);
  assert.match(html, /live=five-stages-20261120/);
  assert.match(css, /@media \(max-width: 600px\)/);
});
