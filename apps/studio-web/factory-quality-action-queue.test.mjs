import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const factory = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const quality = readFileSync(join(here, "assets/factory-batch-quality-0710.js"), "utf8");
const html = readFileSync(join(here, "index.html"), "utf8");

test("Retry Failed shows original batch failures and demands an accepted receipt", () => {
  assert.match(factory, /Failed outputs \('/);
  assert.match(factory, /item\.previous_failure_error/);
  assert.match(factory, /result\.accepted !== true/);
  assert.match(factory, /Retry accepted for original batch/);
  assert.match(factory, /Retry not confirmed:/);
  assert.match(factory, /Retry only after checking the failure/);
  assert.match(factory, /state\.inspectedBatchKey = batch\.job_id/);
  assert.match(factory, /state\.batchDetailsOpen = true/);
  assert.match(factory, /action: batch\.group \? "retry_group" : "retry"/);
});

test("Quality Agent shows bounded actionable records with filters and no blind republish", () => {
  assert.match(quality, /failureFilter: "action", failureShown: 8/);
  assert.match(quality, /const pageFailures = filteredFailures\.slice\(0, state\.failureShown\)/);
  assert.match(quality, /data-qa-filter/);
  assert.match(quality, /data-qa-show-more/);
  assert.match(quality, /factory-quality-diagnosis/);
  assert.match(quality, /data-qa-open/);
  assert.match(quality, /recoverQualityOutputs\(state\.failures\.filter/);
  assert.match(quality, /\.slice\(0,10\), true\)/);
  assert.match(quality, /quality_rate_limit_preview: true/);
  assert.match(quality, /No blind republishing/);
  assert.match(quality, /overdue\.items\.slice\(0, state\.overdueShown\)/);
  // Release identity is verified by ui-release-contract; do not pin this behavior test to one build.
  assert.match(html, /UI build 0\.6\.\d+/);
});
