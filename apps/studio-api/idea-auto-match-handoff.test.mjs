import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const root = new URL("./", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

test("manual Idea creation persists Waiting before async kickoff and retains successful create on error", () => {
  const source = read("worker-functions-01.mjs");
  const fn = source.split("export async function createIdea(")[1].split("/*__STUDIO_WORKER_END:createIdea__*/")[0];
  assert.match(fn, /Studio_Photo_Wait_Status: "Waiting"/);
  assert.match(fn, /Production_Carousel_Slide_Count_Min: 5/);
  assert.ok(fn.indexOf('Studio_Photo_Wait_Status: "Waiting"') < fn.indexOf("const created = await airtableFetch"));
  assert.match(fn, /ctx\\?\\.waitUntil\\(matchNewlyCreatedIdeaPhotos\\(env, created, authorization\\)/);
  assert.match(fn, /New Idea immediate photo match failed/);
  assert.match(read("worker.js"), /return createIdea\\(request, env, authorization, ctx\\);/);
});

test("assetless automatic generation receives same immediate matching without replacing chosen assets", () => {
  const source = read("worker-functions-04.mjs");
  const fn = source.split("export async function createAutonomousIdea(")[1]
    .split("/*__STUDIO_WORKER_END:createAutonomousIdea__*/")[0];
  assert.match(fn, /const missingLibraryAssets = !\\(pick\\.media_asset_ids/);
  assert.match(fn, /Studio_Photo_Wait_Status = "Waiting"/);
  assert.match(fn, /if \\(missingLibraryAssets && ctx\\?\\.waitUntil\\)/);
  assert.match(fn, /matchNewlyCreatedIdeaPhotos\\(env, created, authorization\\)/);
  assert.match(source, /createAutonomousIdea\\(env, profile, pick, ctx\\)/);
});

test("matching reuses the guarded evaluator and sends Ready into idempotent production queue", () => {
  const source = read("worker-functions-03.mjs");
  const fn = source.split("export async function matchNewlyCreatedIdeaPhotos(")[1]
    .split("/*__STUDIO_WORKER_END:matchNewlyCreatedIdeaPhotos__*/")[0];
  assert.match(fn, /Candidate_Status/);
  assert.match(fn, /Promoted_Content_Record_ID/);
  assert.match(fn, /force: false/);
  assert.match(fn, /evaluateAndMaybeAttachWaitingIdeaPhotos/);
  const evaluator = source.split("export async function evaluateAndMaybeAttachWaitingIdeaPhotos(")[1]
    .split("/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/")[0];
  assert.match(evaluator, /shouldAttachPhotoWaitAssets/);
  assert.match(evaluator, /readyProductionEnqueue\\(env\\.STUDIO_MEDIA/);
  assert.match(evaluator, /ideaId: ideaReady\\.id/);
  assert.match(evaluator, /Photo-ready production enqueue deferred/);
  const output = readStudioWorkerSource();
  assert.match(output, /matchNewlyCreatedIdeaPhotos/);
  assert.match(output, /readyProductionEnqueue/);
});

test("cron retains retry and human-only final publishing approval", () => {
  const source = read("worker-functions-04.mjs");
  const fn = source.split("async function studioReadyProductionCronResume(")[1]
    .split("export { studioReadyProductionCronResume };")[0];
  assert.match(fn, /readyProductionClaim/);
  assert.match(fn, /processReadyProductionClaim/);
  assert.match(fn, /final_approval: "human_only"/);
  const worker = read("worker.js");
  assert.match(worker, /studioReadyProductionCronResume\\(env, ctx\\)/);
  assert.match(worker, /runWaitingIdeaPhotoMatches\\(env, \\{ limit: 2 \\}\\)/);
});
