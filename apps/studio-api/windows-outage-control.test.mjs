import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { windowsOutageState, windowsOutagePublishBlock, windowsOutageProductionPaused, windowsOutageCronInventoryAllowed, WINDOWS_OUTAGE_STARTED_AT } from "./windows-outage-control.mjs";

const start = Date.parse(WINDOWS_OUTAGE_STARTED_AT);
const resume = "2026-11-26T15:00:00.000Z";
const resumed = Date.parse(resume);
test("outage is fail-closed until a valid recovery watermark", () => {
  for (const value of [null, "", "bad", "2026-11-26T08:59:59Z", "2026-11-27T00:00:00Z"]) {
    assert.equal(windowsOutageState(resumed, value).active, true);
    assert.equal(windowsOutagePublishBlock(start, resumed, value), "windows_outage_paused");
  }
  assert.equal(windowsOutageState(resumed, resume).active, false);
});
test("missed slots and old backlog stay blocked after recovery, future slots do not", () => {
  for (const due of [start-1,start,resumed-1,resumed]) {
    assert.equal(windowsOutagePublishBlock(due,resumed+3600000,resume), "outage_overdue_requires_mae_reschedule");
  }
  assert.equal(windowsOutagePublishBlock(resumed+1,resumed+3600000,resume),null);
  assert.equal(windowsOutagePublishBlock(NaN,resumed,resume),"schedule_required");
});
test("emergency guard runs before scheduled mutating work, direct enqueue/render and fresh provider fence", () => {
  const source = name => readFileSync(new URL(name,import.meta.url),"utf8");
  const worker=source("worker.js");
  const scheduled=worker.slice(worker.indexOf("async scheduled(event, env, ctx)"));
  assert.ok(scheduled.indexOf("WINDOWS_OUTAGE_SCHEDULED_ADMISSION_PAUSED") < scheduled.indexOf("resumeStaleStudioProductionJobs"));
  const producer=source("worker-functions-01.mjs").split("export async function enqueueStudioProductionJob")[1];
  assert.ok(producer.indexOf("windows_outage_paused") < producer.indexOf("options.force"));
  const render=source("worker-functions-02.mjs").split("export async function studioAdmitRenderQueue")[1];
  assert.ok(render.indexOf("windows_outage_paused") < render.indexOf("studioLoadRenderQueueCandidates"));
  const pub=source("worker-functions-04.mjs").split("export async function studioReconcileApprovedPublishes")[1];
  assert.ok(pub.indexOf("windowsOutagePublishBlock") < pub.indexOf("rows.push(candidate)"));
  assert.ok(pub.indexOf("windowsOutagePublishBlock",pub.indexOf("const preflight = assessFreshSupabasePublish")) < pub.indexOf("initial-publish-fence/v1/"));
});

test("common publisher defers before preparation and does not stamp outage deferrals", () => {
  const source=readFileSync(new URL("worker-functions-03.mjs",import.meta.url),"utf8");
  const primary=source.split("export async function studioDispatchApprovedPublishNow")[1];
  assert.ok(primary.indexOf("windowsOutagePublishBlock") < primary.indexOf("studioPromoteDuePublishStatus"));
  const schedule=source.split("export async function studioDispatchApprovedPublishAndSchedule")[1];
  assert.ok(schedule.indexOf("windowsOutagePublishBlock") < schedule.indexOf("studioPublishDispatchTarget"));
  const stamp=source.split("export async function studioStampPublishDispatch")[1];
  assert.ok(stamp.indexOf("windows_outage_paused|outage_overdue_requires_mae_reschedule") < stamp.indexOf("publishDispatchAttemptStampFields"));
});

test("staged production never unblocks publishing or other cron inventory", () => {
  assert.equal(windowsOutageProductionPaused(resumed,null,false),true);
  assert.equal(windowsOutageProductionPaused(resumed,null,true),false);
  assert.equal(windowsOutagePublishBlock(resumed+1,resumed,null),"windows_outage_paused");
  assert.equal(windowsOutageCronInventoryAllowed([],resumed,null,false),true);
  assert.equal(windowsOutageCronInventoryAllowed(["* * * * *"],resumed,null,false),false);
  assert.equal(windowsOutageCronInventoryAllowed(["* * * * *"],resumed,null,true),true);
  assert.equal(windowsOutageCronInventoryAllowed(["*/5 * * * *"],resumed,null,true),false);
  assert.equal(windowsOutageCronInventoryAllowed(["* * * * *","0 6 * * *"],resumed,null,true),false);
  const worker=readFileSync(new URL("worker.js",import.meta.url),"utf8");
  const block=worker.split('console.info("WINDOWS_OUTAGE_SCHEDULED_ADMISSION_PAUSED");')[1].split("// #2853: verified independent")[0];
  assert.match(block,/collectorCron === "\* \* \* \* \*"/);
  assert.match(block,/maxCandidates: 2/);
  assert.match(block,/studioReadyProductionCronResume/);
  assert.match(block,/factoryBatchCronResume/);
  assert.doesNotMatch(block,/studioReconcileApprovedPublishes|studioDispatchApprovedPublish/);
  assert.match(block,/studioPublicationRecoveryCron\(env, \{ stagedPublicReceipts: true \}\)/);
  assert.doesNotMatch(block,/studioPublicationRecoveryCron\(env\)/);
  assert.doesNotMatch(worker,/runStagedGalleryRecovery|staged-gallery-recovery\.mjs/);
  assert.match(worker,/native_gallery_recovery_enabled: false, public_receipt_recovery_enabled: true/);
  assert.match(block,/return;/);
});

test("stage two restores staggered render and read-only Quality work without publisher admission", () => {
  const worker=readFileSync(new URL("worker.js",import.meta.url),"utf8");
  const stage=worker.split('console.info("WINDOWS_OUTAGE_SCHEDULED_ADMISSION_PAUSED");')[1].split("// #2853: verified independent")[0];
  assert.match(stage,/collectorMinute % 5 === 1[\s\S]*?sweepR4TypedMetadataRecovery\(env, \{ limit: 2 \}\)/);
  assert.match(stage,/collectorMinute % 5 === 3 && r4CronAdmissionAllowed\([\s\S]*?studioAdmitRenderQueue\(env, \{ limit: 80 \}\)/);
  assert.match(stage,/collectorMinute % 5 === 4[\s\S]*?runQualityFactoryHandoffCron/);
  assert.match(stage,/QUALITY_FACTORY_HANDOFF_CRON_DISABLED !== "true"/);
  assert.match(stage,/sweepSchedulingApprovalPreflight\(env, \{ limit: 2 \}\)/);
  assert.doesNotMatch(stage,/repair:|canaryRecordId:|studioReconcileApprovedPublishes|studioDispatchApprovedPublish|studioReconcileInstagramCarousels|studioReconcileTiktokDrafts/);
  assert.equal(windowsOutagePublishBlock(resumed+1,resumed,null),"windows_outage_paused");
  assert.equal(windowsOutageCronInventoryAllowed(["* * * * *"],resumed,null,true),true);
  assert.equal(windowsOutageCronInventoryAllowed(["*/5 * * * *"],resumed,null,true),false);
});
