import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("pre-hook Generated ideas are initialized in small guarded minute batches", () => {
  const worker = read("worker.js");
  const oneMinute = worker.slice(
    worker.indexOf('if (String(event?.cron || "").trim() === "* * * * *")'),
    worker.indexOf("// 2026-10-11 burn-kill:"),
  );
  assert.match(oneMinute, /autoListenOpenPhotoIdeas\(env, \{ limit: 2, initializeOnly: true \}\)/);
  assert.match(oneMinute, /airtableCooldownWaitMs\(\) <= AIRTABLE_SLOT_FAIL_FAST_MS/);
  assert.match(oneMinute, /scheduledMinuteMs \/ 60000/);
  assert.match(oneMinute, /studioReadyProductionCronResume\(env, ctx\)/);
  assert.match(oneMinute, /factoryBatchCronResume\(env, ctx\)/);
  const source = read("worker-functions-02.mjs");
  const listener = source.slice(
    source.indexOf("export async function autoListenOpenPhotoIdeas("),
    source.indexOf("/*__STUDIO_WORKER_END:autoListenOpenPhotoIdeas__*/"),
  );
  assert.match(listener, /initializeOnly = false/);
  assert.match(listener, /Production_Content_Type}=BLANK\(\)/);
  assert.match(listener, /Content Items}=BLANK\(\)/);
  assert.match(listener, /Test_Run_ID}=BLANK\(\)/);
  assert.match(listener, /Studio_Photo_Wait_Status: "Waiting"/);
  assert.match(listener, /if \(initializeOnly\)/);
  assert.ok(listener.indexOf('if (initializeOnly)') < listener.indexOf("createDraftForIdea"),
    "minute listener must not create a draft or attach assets");
});

test("approved ready-master requests reach the dispatcher without overriding manual holds", () => {
  const source = read("worker-functions-04.mjs");
  const eligibility = source.slice(
    source.indexOf("function readyProductionExistingDraftEligible("),
    source.indexOf("function readyProductionIdeaEligible("),
  );
  assert.match(eligibility, /Studio_Master_Asset_Status/);
  assert.match(eligibility, /Studio_Master_Asset_Count/);
  assert.match(eligibility, /linkedRecordIds\(f\(requestRecord, "Idea_Candidate"\)\)/);
  assert.match(eligibility, /productionNotesRevisionOpen\(notes\)/);
  assert.match(eligibility, /Candidate_Status/);
  assert.match(eligibility, /productionPhotoWaitAutoOff\(notes\)/);
  const discovery = source.slice(
    source.indexOf("async function discoverAssetReadyProductionDrafts("),
    source.indexOf("async function readyProductionRequestForIdea("),
  );
  assert.match(discovery, /Studio_Master_Asset_Status}='Ready'/);
  assert.doesNotMatch(discovery, /FIND\('origin=autonomous'/);
  const claim = source.slice(
    source.indexOf("async function processReadyProductionClaim("),
    source.indexOf("async function studioReadyProductionCronResume("),
  );
  assert.match(claim, /Autonomous_Produce_Enabled/);
  assert.match(claim, /profile_auto_produce_disabled/);
  assert.match(claim, /readyProductionIdeaEligible\(idea, requestRecord\)/);
  assert.doesNotMatch(claim, /Review_Status:\s*"Approved"/);
});

test("background matcher probes intake batches in bounded groups rather than 20 serial calls", () => {
  const source = read("worker-functions-03.mjs");
  const check = source.slice(
    source.indexOf("export async function unfinishedIntakeBatchIds("),
    source.indexOf("/*__STUDIO_WORKER_END:unfinishedIntakeBatchIds__*/"),
  );
  assert.match(check, /start \+= 4/);
  assert.match(check, /fields: \["Intake_Batch_ID"\]/);
  assert.match(check, /AND\(OR\(/);
  assert.match(check, /rows\.length >= 100/);
  assert.match(check, /pending\.add\(id\)/);
  assert.doesNotMatch(check, /for \(const batchId of unique\.slice\(0, 20\)\)/);
  const matcher = source.slice(
    source.indexOf("export async function evaluateAndMaybeAttachWaitingIdeaPhotos("),
    source.indexOf("/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/"),
  );
  assert.match(matcher, /force \? \[\] : await unfinishedIntakeBatchIds/);
  const sweep = source.slice(
    source.indexOf("export async function runWaitingIdeaPhotoMatches("),
    source.indexOf("/*__STUDIO_WORKER_END:runWaitingIdeaPhotoMatches__*/"),
  );
  assert.match(sweep, /error_http_status:/);
});
