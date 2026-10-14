import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const section = (begin, end) => {
  const at = app.indexOf(begin);
  const stop = app.indexOf(end, at);
  assert.ok(at > 0 && stop > at, `Expected ${begin} before ${end}`);
  return app.slice(at, stop);
};
const finishedRequest = section("  function item4IsFinishedRequest(", "  function item4FileLooksLikeVideo(");
const finishedVideo = section("  function ezIsFinishedVideo()", "  function ezIsAzFinishedPath()");
const masterContentType = section("  function inferredMasterContentType()", "  function syncHiddenMasterContentType()");

function state(kind) {
  const notes = kind === "vibe-cut"
    ? 'origin=ez-wizard; ez-input=vibe-cut; ez-package=video\n[vibe-cut] {"target_seconds":45}'
    : kind === "finished-video" ? "origin=ez-wizard; ez-input=finished-video" : "origin=ez-wizard; ez-input=video-clips";
  const record = { production_notes: notes };
  const assets = [{ name: "Adler-Drone-View.mp4", mime_type: "video/mp4" }];
  const context = {
    activeProductionRequest: record,
    item4Workspace: { assets, production_notes: notes },
    ezIntakeKind: kind,
    ezWizardPending: null,
    ezWizardAnswers: null,
    ezIsVibeCut: () => kind === "vibe-cut",
    ezIsFinishedVideo: () => kind === "finished-video",
    ezIsClipRequest: () => kind === "video-clips",
    vibeCutApi: () => ({ isVibeCutNotes: (text) => /ez-input=vibe-cut/.test(text) }),
    item4AssetLooksLikeVideo: (asset) => /video\//.test(asset.mime_type),
    $: () => null,
  };
  return { record, context };
}

test("A single Vibe Cut MP4 must NOT be interpreted as completed passthrough", () => {
  const { record, context } = state("vibe-cut");
  assert.equal(vm.runInNewContext(finishedVideo + "\nezIsFinishedVideo()", context), false);
  assert.equal(vm.runInNewContext(finishedRequest + "\nitem4IsFinishedRequest(activeProductionRequest)", context), false);
  const reopened = { ...context, ezIsVibeCut: () => false, ezIntakeKind: "" };
  assert.equal(vm.runInNewContext(finishedRequest + "\nitem4IsFinishedRequest(activeProductionRequest)", reopened), false, "saved Vibe Cut notes remain authoritative");
  assert.match(app, /const variantStatus = status\?\.variant_status \|\| "None"/);
  assert.match(app, /if \(item4Workspace\?\.assets\?\.length && !item4IsFinishedRequest\(\)/);
});

test("Completed video stays passthrough, while clip-built videos do not", () => {
  for (const [kind, expected] of [["finished-video", true], ["video-clips", false]]) {
    const { context } = state(kind);
    assert.equal(vm.runInNewContext(finishedVideo + "\nezIsFinishedVideo()", context), expected);
    assert.equal(vm.runInNewContext(finishedRequest + "\nitem4IsFinishedRequest(activeProductionRequest)", context), expected);
  }
});

test("Vibe Cut uses longform when YouTube Standard is in the saved plan", () => {
  const { context } = state("vibe-cut");
  Object.assign(context, {
    item4YouTubeLongformSelected: () => true,
    ezStagedFiles: [],
    ezPlanApi: () => null,
  });
  assert.equal(vm.runInNewContext(masterContentType + "\ninferredMasterContentType()", context), "Longform Video");
  context.item4YouTubeLongformSelected = () => false;
  assert.equal(vm.runInNewContext(masterContentType + "\ninferredMasterContentType()", context), "Vertical Short Video");
  assert.match(app, /!ezIsClipRequest\(\) && !ezIsVibeCut\(\) && productionOutputSelectionIsVideoPhotoSet\(\)/);
});

test("Vibe Cut routing is preserved and output configuration cache is refreshed", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.676-factory-revision-unlock"/);
  assert.match(html, /app-item4-1008\.js\?v=0\.6\.676-factory-revision-unlock/);
  assert.match(app, /const originKind = ezIsVibeCut\(\) \? "vibe-cut" : "finished-video"/);
  assert.match(app, /if \(ezIsFinishedVideo\(\)\) \{[\s\S]*?Studio skips crops and Remotion/);
  assert.match(app, /const video = ezIsFinishedVideo\(\) \|\| ezIsVibeCut\(\)/);
});
