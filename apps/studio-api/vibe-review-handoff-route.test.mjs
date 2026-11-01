import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const logic = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
const source = readStudioWorkerSource();

test("Vibe recovery route is authenticated, named, and included in Worker reconstruction", () => {
  assert.match(worker, /isVibeCutToReviewRoute/);
  assert.match(worker, /isVibeCutToReviewWrite\s*\|\|/);
  assert.match(worker, /requirePermission\(authorization, "ideas_promote"\)/);
  assert.match(worker, /requirePermission\(authorization, "production_configure"\)/);
  assert.match(worker, /STUDIO_WORKER_EXTRACT:advanceVibeCutToReview/);
  assert.match(source, /function advanceVibeCutToReview\(/);
});

test("exact manual handoff requires verified persisted source and respects revisions", () => {
  const a = logic.indexOf("export async function advanceVibeCutToReview(");
  const b = logic.indexOf("/*__STUDIO_WORKER_END:advanceVibeCutToReview__*/", a);
  assert.ok(a > -1 && b > a);
  const route = logic.slice(a,b);
  assert.match(route, /loadAuthorizedProductionRequest\(env, requestId, authorization\)/);
  assert.match(route, /productionNotesRevisionOpen\(notes\)/);
  assert.match(route, /vibeAutoReviewVerifiedSource\(/);
  assert.match(route, /Studio_Master_Asset_Status/);
  assert.match(route, /Studio_Master_Asset_Count/);
  assert.match(route, /linkedRecordIds\(f\(record, "Idea_Candidate"\)\)/);
  assert.match(route, /readyProductionEnqueue\(env.STUDIO_MEDIA/);
  assert.match(route, /monitorReadyProductionRequest\(env, record\)/);
  assert.match(route, /publishing: false/);
  assert.doesNotMatch(route, /finishAutonomousProductionRequest|approveOutputRecordForPublishing|publish-kick/);
});

test("manual recovery uses the exact same durable queue and still requires human approval", () => {
  const a = logic.indexOf("export async function advanceVibeCutToReview(");
  const b = logic.indexOf("/*__STUDIO_WORKER_END:advanceVibeCutToReview__*/",a);
  const route=logic.slice(a,b);
  assert.match(route, /readyProductionEnqueue\(/);
  assert.match(route, /already_started: !queued.created/);
  assert.match(route, /final human approval|human approval/);
});
