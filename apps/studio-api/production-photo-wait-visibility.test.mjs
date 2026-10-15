import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const worker = readStudioWorkerSource();
const start = worker.indexOf("function productionRequestPhotoWaitHidden(");
const end = worker.indexOf("\nasync function listProductionRequests(", start);
assert.ok(start > 0 && end > start, "Worker must include the standalone photo-wait visibility guard");
const code = worker.slice(start, end);
const hide = vm.runInNewContext(code + "\nproductionRequestPhotoWaitHidden;", {
  f: (record, name) => record[name],
  productionPhotoWaitAutoOff: notes => /ez-photo-wait=off/i.test(notes),
  timedScriptFromNotes: notes => {
    const match = /\[timed-script\]\s*(\{[^\n]+\})/.exec(notes);
    return match ? JSON.parse(match[1]) : null;
  },
});
const draft = (notes = "", assets = 0) => ({
  Production_Notes: notes,
  Studio_Master_Asset_Count: assets,
});

test("unfulfilled photo-wait shells stay hidden", () => {
  assert.equal(hide(draft(), "Waiting"), true);
  assert.equal(hide(draft("", 4), "Waiting"), true);
  assert.equal(hide(draft('[timed-script] {"segments":[{"voiceover_text":"Hi"}]}', 0), "Waiting"), true);
});
test("explicit request photo-wait lock overrides stale linked Idea Waiting", () => {
  assert.equal(hide(draft("ez-photo-wait=off", 5), "Waiting"), false);
});
test("five assigned photo scenes with saved narration remain visible even when Idea Waiting is stale", () => {
  const notes = '[timed-script] {"segments":[{"asset_id":"still1","voiceover_text":"The Windy City nickname has several proposed origins."}]}';
  assert.equal(hide(draft(notes, 5), "Waiting"), false);
});
test("ordinary non-waiting drafts are always visible", () => {
  assert.equal(hide(draft(), "Not Needed"), false);
  assert.equal(hide(draft(), "Ready"), false);
});
test("Production list invokes request-aware guard instead of raw linked Idea flag", () => {
  const route = worker.slice(worker.indexOf("async function listProductionRequests("), worker.indexOf("async function getProductionRequest("));
  assert.match(route, /!productionRequestPhotoWaitHidden\(record, photoWaitStates\.get\(ideaId\)\)/);
  assert.doesNotMatch(route, /return !ideaId \|\| photoWaitStates\.get\(ideaId\) !== "Waiting"/);
});
