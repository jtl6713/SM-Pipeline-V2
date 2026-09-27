import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
const worker = fs.readFileSync(path.join(here, "..", "studio-api", "worker.js"), "utf8");

test("Ideas exposes one-click photo listening", () => {
  assert.match(html, /id="watchIdeaPhotosButton"[^>]*>Listen for photos</);
  assert.match(app, /\/watch-photos/);
  assert.match(app, /Listening for photos/);
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

test("Entering Production permanently disables photo listening without rematching deleted photos", () => {
  assert.match(worker, /lockIdeaPhotoListeningForProduction/);
  assert.match(worker, /Studio_Photo_Wait_Status: "Not Needed"/);
  assert.match(worker, /withProductionPhotoWaitManual\(requestNotes\)/);
  assert.match(worker, /Transfer the exact set the operator sees in Manage Idea once/);
  assert.doesNotMatch(worker, /photo-wait rehydrate on open failed/);
});
