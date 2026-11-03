import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("manual creation persists Waiting and schedules safe matching", () => {
  const source = read("worker-functions-01.mjs");
  const fn = source.split("export async function createIdea(")[1].split("/*__STUDIO_WORKER_END:createIdea__*/")[0];
  assert.ok(fn.includes('Studio_Photo_Wait_Status: "Waiting"'));
  assert.ok(fn.includes('Production_Carousel_Slide_Count_Min: 5'));
  assert.ok(fn.indexOf('Studio_Photo_Wait_Status: "Waiting"') < fn.indexOf('const created = await airtableFetch'));
  assert.ok(fn.includes('ctx.waitUntil(matchNewlyCreatedIdeaPhotos(env, created, authorization)'));
  assert.ok(fn.includes('New Idea immediate photo match failed'));
  assert.ok(read("worker.js").includes("return await createIdea(request, env, authorization, ctx);"));
});

test("assetless autonomous generation matches immediately but retains chosen media", () => {
  const source = read("worker-functions-04.mjs");
  const fn = source.split("export async function createAutonomousIdea(")[1]
    .split("/*__STUDIO_WORKER_END:createAutonomousIdea__*/")[0];
  assert.ok(fn.includes('const missingLibraryAssets = !(pick.media_asset_ids || []).length;'));
  assert.ok(fn.includes('Studio_Photo_Wait_Status = "Waiting"'));
  assert.ok(fn.includes('if (missingLibraryAssets && ctx?.waitUntil)'));
  assert.ok(fn.includes('matchNewlyCreatedIdeaPhotos(env, created, authorization)'));
  assert.ok(source.includes('createAutonomousIdea(env, profile, pick, ctx)'));
});

test("guarded matcher performs idempotent handoff to ready production queue", () => {
  const source = read("worker-functions-03.mjs");
  const fn = source.split("export async function matchNewlyCreatedIdeaPhotos(")[1]
    .split("/*__STUDIO_WORKER_END:matchNewlyCreatedIdeaPhotos__*/")[0];
  for(const key of ["Candidate_Status", "Promoted_Content_Record_ID", "force: false", "evaluateAndMaybeAttachWaitingIdeaPhotos"]) {
    assert.ok(fn.includes(key), key);
  }
  const evaluator = source.split("export async function evaluateAndMaybeAttachWaitingIdeaPhotos(")[1]
    .split("/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/")[0];
  for(const key of ["shouldAttachPhotoWaitAssets", "readyProductionEnqueue(env.STUDIO_MEDIA", "ideaId: ideaReady.id", "Photo-ready production enqueue deferred"]) {
    assert.ok(evaluator.includes(key), key);
  }
  const output = readStudioWorkerSource();
  assert.ok(output.includes("matchNewlyCreatedIdeaPhotos"));
  assert.ok(output.includes("readyProductionEnqueue"));
});

test("one-minute production dispatch retains leases and human approval gate", () => {
  const source = read("worker-functions-04.mjs");
  const fn = source.split("async function studioReadyProductionCronResume(")[1]
    .split("export { studioReadyProductionCronResume };")[0];
  for(const key of ["readyProductionClaim", "processReadyProductionClaim", 'final_approval: "human_only"']) {
    assert.ok(fn.includes(key), key);
  }
  const worker = read("worker.js");
  assert.ok(worker.includes("studioReadyProductionCronResume(env, ctx)"));
  assert.ok(worker.includes("runWaitingIdeaPhotoMatches(env, { limit: 2 })"));
});

test("Quality Agent monitors >2h unscanned, stale, and ready-without-handoff Ideas without changing them", async () => {
  const { ideaPhotoMatchingSlaFinding: classify } = await import("./idea-photo-wait.mjs");
  const nowMs = Date.parse("2026-10-24T01:30:00Z");
  const row = (fields = {}) => ({
    id: "rec12345678901234",
    createdTime: "2026-10-23T21:00:00Z",
    fields: { Candidate_Status: "Generated", Content_Profile: ["rec12345678901235"], ...fields },
  });
  assert.equal(classify(row(), { nowMs }).kind, "idea_photo_never_scanned");
  assert.equal(classify(row({ Studio_Photo_Wait_Status: "Waiting" }), { nowMs }).kind, "idea_photo_match_stale");
  assert.equal(classify(row({ Studio_Photo_Wait_Status: "Waiting", Studio_Photo_Match_JSON: JSON.stringify({
    evaluated_at: "2026-10-24T01:00:00Z",
  }) }), { nowMs }), null);
  assert.equal(classify(row({ Studio_Photo_Wait_Status: "Ready" }), { nowMs }).kind, "idea_photo_ready_no_handoff");
  assert.equal(classify(row({ Candidate_Status: "On Hold" }), { nowMs }), null);
  assert.equal(classify(row({ Candidate_Status: "Promoted" }), { nowMs }), null);
  assert.equal(classify(row({ Studio_Photo_Wait_Status: "Not Needed" }), { nowMs }), null);
  const worker = read("worker.js");
  assert.ok(worker.includes("scanIdeaPhotoMatchingQuality(env, { limit: 150 })"));
  assert.ok(worker.includes("autoListenOpenPhotoIdeas(env, { limit: 2 })"));
  const source = readStudioWorkerSource();
  assert.ok(source.includes("studio/state/quality/idea-photo-matching/latest.json"));
});
