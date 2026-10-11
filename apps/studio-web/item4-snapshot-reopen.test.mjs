import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const start = app.indexOf("async function loadItem4Workspace(");
const end = app.indexOf("\n  function item4UploadFileExtension", start);
const handler = app.slice(start, end);

test("opening Ready production uses lightweight saved-state snapshot", () => {
  assert.match(handler, /snapshotReady/);
  assert.match(handler, /record\.status/);
  assert.match(handler, /record\.studio_master_assets/);
  assert.match(handler, /\?snapshot=1/);
});

test("photo listening stop cannot block loading existing media", () => {
  assert.match(handler, /stopIdeaPhotoListeningAfterProductionOpen/);
  assert.match(handler, /Promise\.resolve\(\)\.then/);
  assert.doesNotMatch(handler, /await stopIdeaPhotoListeningAfterProductionOpen/);
  assert.match(handler, /isAirtableCooldownFailure/);
  assert.match(handler, /Airtable is busy — retrying\. Photos are safe\./);
  assert.match(handler, /Could not load saved media \(/);
});
