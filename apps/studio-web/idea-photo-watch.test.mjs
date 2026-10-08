import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");
const worker = fs.readFileSync(path.join(here, "..", "studio-api", "worker.js"), "utf8");

test("Ideas exposes one-click photo listening", () => {
  assert.match(html, /id="watchIdeaPhotosButton"[^>]*>Listen for photos</);
  assert.match(app, /\/watch-photos/);
  assert.match(app, /Listening for photos/);
});


test("Find images now is available from the Ideas row and bypasses only the temporary Manage pause", () => {
  assert.match(app, /data-idea-find-images/);
  assert.match(app, /Find images now/);
  assert.match(app, /body: JSON\.stringify\(\{ force: true \}\)/);
  assert.match(worker, /!force && ideaManagePhotoPauseActive/);
  assert.match(worker, /explicit Find images now request is user-directed/);
});

test("Photo listening stays in Ideas until enough matches and then surfaces in Production", () => {
  assert.match(worker, /isIdeaWatchPhotosRoute/);
  assert.match(worker, /Studio_Photo_Wait_Status:\s*"Waiting"/);
  assert.match(worker, /photo_watch_waiting_count/);
  assert.match(worker, /photoWaitStates\.get\(ideaId\) !== "Waiting"/);
  assert.match(worker, /autoListenOpenPhotoIdeas/);
  assert.match(worker, /runWaitingIdeaPhotoMatches/);
  assert.match(worker, /Studio media library/);
});


test("already-listening ideas are matched on every five-minute Worker tick", () => {
  const scheduledStart = worker.indexOf("async scheduled(event, env, ctx)");
  const scheduledBody = worker.slice(scheduledStart, worker.indexOf("class HttpError", scheduledStart));
  assert.match(
    scheduledBody,
    /if \(cadence\.heavy\) \{[\s\S]{0,700}?autoListenOpenPhotoIdeas[\s\S]{0,500}?\n\s*\}[\s\S]{0,250}?Existing listeners react[\s\S]{0,350}?runWaitingIdeaPhotoMatches\(env, \{ limit: 12 \}\)/
  );
});

test("generated media ideas start listening automatically and the cron can create their draft", () => {
  assert.match(worker, /created_record_ids/);
  assert.match(worker, /autoListenOpenPhotoIdeas/);
  assert.match(worker, /generated idea automatic photo listening failed/);
  assert.match(worker, /Vertical Short Video/);
  assert.match(worker, /const authorization = records\.length \? await resolveStudioCronAuthorization\(env\) : null/);
  assert.match(worker, /evaluateAndMaybeAttachWaitingIdeaPhotos\(env, idea, \{\s*authorization,/);
});

test("photo-wait cron cannot restore stills the operator deleted", () => {
  assert.match(worker, /wait \/ wait_batch must not rewrite a draft/);
  assert.match(worker, /shouldAttachPhotoWaitAssets/);
  assert.match(worker, /ez-photo-wait=off|withProductionPhotoWaitManual/);
  assert.match(worker, /action: "manual"/);
  assert.match(worker, /Studio_Photo_Wait_Status: "Not Needed"/);
});

test("Approve skips variant rewrite when crops are already Ready", () => {
  assert.match(worker, /37-still Bridge drafts already have Ready crops/);
  assert.match(worker, /if \(!autonomousPlanVariantsReady\(requestRecord\)\)/);
  assert.match(worker, /const variantsAlreadyReady = autonomousPlanVariantsReady\(requestRecord\)/);
  assert.match(worker, /if \(!variantsAlreadyReady\) \{\s*try \{\s*requestRecord = await item4RelinkVariantQueueOutputs/);
  assert.match(worker, /async function item4VariantQueueRows[\s\S]*?limit: 500/);
  assert.match(worker, /productionNotesForPromotionHandoff/);
});


test("Manage Idea pauses automatic photo listening and close resumes it", () => {
  assert.match(worker, /photo-listening-session/);
  assert.match(worker, /withIdeaManagePhotoPause/);
  assert.match(worker, /withoutIdeaManagePhotoPause/);
  assert.match(worker, /ideaManagePhotoPauseActive/);
  assert.match(app, /startIdeaPhotoManagePause/);
  assert.match(app, /stopIdeaPhotoManagePause/);
  assert.match(app, /Automatic photo listening is paused while Manage Idea is open/);
  assert.match(app, /setInterval\(pulse, 5 \* 60 \* 1000\)/);
});

test("Production open/list mappers never parse heavy Item 4 JSON on the critical path", () => {
  const lightStart = worker.indexOf("function mapProductionRequestLight");
  const lightEnd = worker.indexOf("function mapProductionRequestSummary", lightStart);
  const lightBody = worker.slice(lightStart, lightEnd);
  assert.doesNotMatch(lightBody, /mapProductionRequest\(/);
  assert.doesNotMatch(lightBody, /item4ParseJson/);
  assert.doesNotMatch(lightBody, /Studio_Master_Assets_JSON/);
  assert.doesNotMatch(lightBody, /Studio_Output_Plan_JSON/);
  assert.doesNotMatch(lightBody, /Studio_Variant_Manifest_JSON/);

  const summaryStart = worker.indexOf("function mapProductionRequestSummary");
  const summaryEnd = worker.indexOf("async function listProductionRequests", summaryStart);
  const summaryBody = worker.slice(summaryStart, summaryEnd);
  assert.match(summaryBody, /mapProductionRequestLight\(record, ideaTitle\)/);
  assert.doesNotMatch(summaryBody, /mapProductionRequest\(record, ideaTitle\)/);

  assert.match(app, /production-requests\/\$\{encodeURIComponent\(directId\)\}\?fields=light/);
  assert.match(worker, /url\.searchParams\.get\("fields"\)/);
});

test("Open Production prefers the existing draft and never blocks on photo hydration", () => {
  assert.match(app, /findExistingProductionRequestForIdea/);
  assert.match(app, /idea\?\.production_request_id/);
  assert.match(app, /opened_existing: true/);
  assert.match(app, /recovered_after_failure: true/);
  assert.match(app, /Number\(error\?\.status \|\| 0\) >= 500/);
  assert.match(app, /showProductionRequestWorkspace\(\)/);
  assert.match(app, /Promise\.allSettled\(\[/);
  assert.match(app, /stopIdeaPhotoListeningAfterProductionOpen/);
  assert.match(app, /action: "stop"/);
  assert.match(worker, /action must be pause, resume, or stop/);
  assert.match(worker, /Studio_Photo_Wait_Status: "Not Needed"/);

  const getStart = worker.indexOf("async function getProductionRequest");
  const getEnd = worker.indexOf("async function updateProductionRequest", getStart);
  const getBody = worker.slice(getStart, getEnd);
  assert.doesNotMatch(getBody, /queueIdeaProductionAfterOpen/);
  assert.doesNotMatch(getBody, /applyLibraryAssetsToProductionRequest/);

  const openStart = worker.indexOf("async function getOrCreateProductionRequestForIdea");
  const openEnd = worker.indexOf("async function createProductionRequestFromBody", openStart);
  const openBody = worker.slice(openStart, openEnd);
  assert.doesNotMatch(openBody, /queueIdeaProductionAfterOpen/);
  assert.doesNotMatch(openBody, /lockIdeaPhotoListeningForProduction/);
});


test("Manage Idea keeps the operator's unchecked photos authoritative during drawer refresh", () => {
  assert.match(app, /ideaLibrarySelected = new Set\(preserved\.selected \|\| \[\]\)/);
  assert.doesNotMatch(app, /ideaLibrarySelected = new Set\(\[\.\.\.\(preserved\.selected \|\| \[\]\), \.\.\.persisted\]\)/);
  assert.match(app, /async function openIdeaDrawer[\s\S]*?await startIdeaPhotoManagePause\(idea\)/);
});

test("Entering Production closes Manage Idea without resuming automatic photo listening", () => {
  assert.match(app, /closeIdeaDrawer\(\{ save: false, resumePhotoListening: false \}\)/);
  assert.match(app, /async function closeIdeaDrawer\(\{ save = true, resumePhotoListening = true \} = \{\}\)/);
  assert.match(app, /stopIdeaPhotoManagePause\(\{ resume: resumePhotoListening \}\)/);
});


test("Find images now is immediately visible beside the listening control", () => {
  assert.match(html, /id="watchIdeaPhotosButton"[\s\S]*?id="matchIdeaPhotosButton"[^>]*>Find images now</);
  assert.match(app, /Automatic matching runs every 5 minutes/);
});
