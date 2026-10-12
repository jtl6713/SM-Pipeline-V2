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

function scheduledBody() {
  return worker.slice(
    worker.indexOf("async scheduled(event, env, ctx)"),
    worker.indexOf("class HttpError")
  );
}

test("Worker health advertises airtable burn-kill cron build", () => {
  assert.match(worker, /version: "0.10.537-hot-read-hold"/);
  assert.match(worker, /studio_airtable_low_burn_cron_v1: true/);
  assert.match(worker, /studio_airtable_burn_kill_v1: true/);
  assert.match(worker, /studioCronAirtableCadence/);
  assert.match(worker, /airtableCooldownWaitMs/);
});

test("production Worker deploy cron is every five minutes", () => {
  assert.match(deployWorkflow, /'triggers':\{'crons':\['\*\/5 \* \* \* \*'\]\}/);
  assert.doesNotMatch(deployWorkflow, /'crons':\['\*\/2 \* \* \* \*'\]/);
});

test("scheduled skips cron while Airtable is cooling down", () => {
  const scheduled = scheduledBody();
  assert.match(scheduled, /airtableCooldownWaitMs\(\)/);
  assert.match(scheduled, /coolMs > AIRTABLE_SLOT_FAIL_FAST_MS/);
  assert.match(scheduled, /cron skipped: Airtable cooling down/);
});

test("light ticks only run publish/produce rescue; heavy owns platform heals", () => {
  const scheduled = scheduledBody();
  assert.match(scheduled, /const cadence = studioCronAirtableCadence/);
  assert.match(scheduled, /if \(!cadence\.heavy\) return;/);
  assert.match(scheduled, /studioReconcileOverdueScheduledPublishes/);
  assert.match(scheduled, /studioReconcileApprovedPublishes/);
  assert.match(scheduled, /healStuckStudioRenders/);
  assert.match(scheduled, /resumeStaleStudioProductionJobs/);
  assert.match(scheduled, /startOrphanedStudioProductionJobs/);

  // Platform reconciles / heal storms must sit behind the heavy gate.
  const heavyGate = scheduled.indexOf("if (!cadence.heavy) return;");
  assert.ok(heavyGate > 0, "missing light early-return");
  const afterHeavy = scheduled.slice(heavyGate);
  assert.match(afterHeavy, /studioReconcileTiktokDrafts/);
  assert.match(afterHeavy, /studioReconcilePublishingInstagramReels/);
  assert.match(afterHeavy, /studioReconcileFacebookReels/);
  assert.match(afterHeavy, /studioReconcileYoutubePublishes/);
  assert.match(afterHeavy, /studioHealFailedStatuses/);
  assert.match(afterHeavy, /studioHealAwaitingApprovalStaleRfr/);
  assert.match(afterHeavy, /advanceStudioProductionOutputs/);
  assert.match(afterHeavy, /studioSweepPostPublishMediaRelease/);

  // Light body (before heavy gate) must not still call platform reconcile storms.
  const beforeHeavy = scheduled.slice(0, heavyGate);
  assert.doesNotMatch(beforeHeavy, /studioReconcileTiktokDrafts/);
  assert.doesNotMatch(beforeHeavy, /studioReconcilePublishingInstagramReels/);
  assert.doesNotMatch(beforeHeavy, /studioReconcileYoutubePublishes/);
  assert.doesNotMatch(beforeHeavy, /studioHealFailedStatuses/);
  assert.doesNotMatch(beforeHeavy, /studioSweepPublishedInsights/);
  assert.doesNotMatch(beforeHeavy, /item4PulsePipelineStage/);
});

test("scheduled gates insights and ingest to heavy cadence", () => {
  const scheduled = scheduledBody();
  assert.match(scheduled, /if \(cadence\.insights\)/);
  assert.match(scheduled, /if \(cadence\.ingest\)/);
  assert.match(scheduled, /if \(cadence\.heavy\)/);
  assert.match(scheduled, /studioSweepPublishedInsights/);
  assert.match(scheduled, /item4PulsePipelineStage\(env, "a2"/);
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
