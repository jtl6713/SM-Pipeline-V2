import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const deployWorkflow = fs.readFileSync(
  path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"),
  "utf8"
);

function loadCadenceHelper() {
  const start = worker.indexOf("function studioCronAirtableCadence");
  assert.ok(start >= 0, "studioCronAirtableCadence missing");
  const end = worker.indexOf("\nclass HttpError", start);
  assert.ok(end > start, "HttpError marker missing after cadence helper");
  const snippet = `${worker.slice(start, end)}\n; studioCronAirtableCadence;`;
  return vm.runInNewContext(snippet, Object.create(null));
}

test("Worker health advertises airtable low-burn cron build", () => {
  assert.match(worker, /version: "0.10.520-pipeline-content-page"/);
  assert.match(worker, /studio_airtable_low_burn_cron_v1: true/);
  assert.match(worker, /studioCronAirtableCadence/);
});

test("production Worker deploy cron is every five minutes", () => {
  assert.match(deployWorkflow, /'triggers':\{'crons':\['\*\/5 \* \* \* \*'\]\}/);
  assert.doesNotMatch(deployWorkflow, /'crons':\['\*\/2 \* \* \* \*'\]/);
});

test("scheduled gates insights and ingest to heavy cadence", () => {
  const scheduled = worker.slice(
    worker.indexOf("async scheduled(event, env, ctx)"),
    worker.indexOf("class HttpError")
  );
  assert.match(scheduled, /const cadence = studioCronAirtableCadence/);
  assert.match(scheduled, /if \(cadence\.insights\)/);
  assert.match(scheduled, /if \(cadence\.ingest\)/);
  assert.match(scheduled, /if \(cadence\.heavy\)/);
  assert.match(scheduled, /studioSweepPublishedInsights/);
  assert.match(scheduled, /item4PulsePipelineStage\(env, "a2"/);
  assert.match(scheduled, /cadence\.heavy \|\| \(item4Drain\?\.request_ids/);
});

test("insights backlog list is capped near the per-profile select size", () => {
  const sweep = worker.slice(
    worker.indexOf("async function studioSweepPublishedInsights"),
    worker.indexOf("async function studioSweepSimilarAccountTimes")
  );
  assert.match(sweep, /Math\.max\(perProfileLimit \* 4, 40\)/);
  assert.doesNotMatch(sweep, /limit:\s*250/);
});

test("studioCronAirtableCadence marks UTC :00 and :30 as heavy", () => {
  const studioCronAirtableCadence = loadCadenceHelper();
  const light = studioCronAirtableCadence(new Date("2026-09-27T18:05:00Z"), "*/5 * * * *");
  assert.equal(light.heavy, false);
  assert.equal(light.insights, false);
  assert.equal(light.ingest, false);

  const heavy = studioCronAirtableCadence(new Date("2026-09-27T18:00:00Z"), "*/5 * * * *");
  assert.equal(heavy.heavy, true);
  assert.equal(heavy.insights, true);
  assert.equal(heavy.ingest, true);

  const forced = studioCronAirtableCadence(new Date("2026-09-27T18:17:00Z"), "0 * * * *");
  assert.equal(forced.heavy, true);
});
