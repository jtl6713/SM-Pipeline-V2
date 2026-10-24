import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("blank-state legacy Ideas get a separate bounded cron listener even when five-minute light runs are skipped", () => {
  const worker = source("worker.js");
  const minute = worker.slice(
    worker.indexOf('if (String(event?.cron || "").trim() === "* * * * *")'),
    worker.indexOf("// 2026-10-11 burn-kill"),
  );
  assert.match(minute, /autoListenOpenPhotoIdeas\(env, \{ limit: 2, initializeOnly: true \}\)/);
  assert.match(minute, /airtableCooldownWaitMs\(\) <= AIRTABLE_SLOT_FAIL_FAST_MS/);
  assert.match(minute, /studioReadyProductionCronResume\(env, ctx\)/);
  assert.match(minute, /factoryBatchCronResume\(env, ctx\)/);
});

test("listener excludes manually configured and operator-managed Ideas before applying query limit", () => {
  const code = source("worker-functions-02.mjs");
  const listener = code.slice(
    code.indexOf("export async function autoListenOpenPhotoIdeas("),
    code.indexOf("/*__STUDIO_WORKER_END:autoListenOpenPhotoIdeas__*/"),
  );
  assert.match(listener, /initializeOnly = false/);
  for (const token of [
    "{Production Requests}=BLANK()", "{Content Items}=BLANK()",
    "{Production_Content_Type}=BLANK()", "{Production_Carousel_Image_Mode}=BLANK()",
    "{Production_Carousel_Slide_Count}=BLANK()", "{Test_Run_ID}=BLANK()",
  ]) assert.ok(listener.includes(token), token);
  assert.match(listener, /ideaManagePhotoPauseActive/);
  assert.match(listener, /if \(initializeOnly\)/);
  assert.ok(listener.indexOf("if (initializeOnly)") < listener.indexOf("createDraftForIdea("),
    "the minute listener must not mint production requests");
  assert.match(listener, /Studio_Photo_Wait_Status: "Waiting"/);
});

test("Approved ready-master requests join idempotent dispatch without overriding configured platforms or human holds", () => {
  const code = source("worker-functions-04.mjs");
  const eligibility = code.slice(
    code.indexOf("function readyProductionExistingDraftEligible("),
    code.indexOf("async function readyProductionRequestForIdea("),
  );
  assert.match(eligibility, /Studio_Master_Asset_Status/);
  assert.match(eligibility, /Studio_Master_Asset_Count/);
  assert.match(eligibility, /productionNotesRevisionOpen/);
  assert.match(eligibility, /Candidate_Status/);
  assert.match(eligibility, /productionPhotoWaitAutoOff/);
  assert.doesNotMatch(eligibility, /FIND\('origin=autonomous'/);
  const plan = code.slice(
    code.indexOf("function readyProductionIdeaPlan("),
    code.indexOf("async function monitorReadyProductionRequest("),
  );
  assert.match(plan, /f\(requestRecord, "Target_Platforms"\)/);
  assert.match(plan, /f\(requestRecord, "Master_Content_Type"\)/);
  const claim = code.slice(
    code.indexOf("async function processReadyProductionClaim("),
    code.indexOf("async function studioReadyProductionCronResume("),
  );
  assert.match(claim, /Autonomous_Produce_Enabled/);
  assert.match(claim, /profile_auto_produce_disabled/);
  assert.match(claim, /readyProductionRequestForIdea/);
  assert.match(claim, /readyProductionFinishClaim/);
});
