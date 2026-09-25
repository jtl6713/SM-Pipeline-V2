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
  assert.match(worker, /autoListenOpenPhotoIdeas/);\n  assert.match(worker, /runWaitingIdeaPhotoMatches/);\n  assert.match(worker, /Studio media library/);
});
