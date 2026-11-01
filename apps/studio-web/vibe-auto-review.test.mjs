import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

function section(a, b) {
  const start = app.indexOf(a), end = app.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, `Expected ${a} before ${b}`);
  return app.slice(start, end);
}

test("verified Vibe video is auto-advanced exactly once with no publishing", () => {
  const trigger = section("function syncVibeUploadUiFromWorkspace(", "function renderVibeCutCommitAction(");
  assert.match(trigger, /if \(vibeCutReadySource\(status\)\)/);
  assert.match(trigger, /maybeAutoAdvanceVibeCutToReview\(status\)/);
  const handoff = section("async function maybeAutoAdvanceVibeCutToReview(", "function syncVibeUploadUiFromWorkspace(");
  assert.match(handoff, /vibeCutReadySource\(status\)/);
  assert.match(handoff, /item4Uploading \|\| ezStarting/);
  assert.match(handoff, /vibeAutoReviewInFlight\.has\(id\)/);
  assert.match(handoff, /vibeAutoReviewAttempted\.has\(id\)/);
  assert.match(handoff, /vibe-to-review/);
  assert.match(handoff, /method: "POST", body: "\{\}", timeoutMs: 30000, retries: 0/);
  assert.match(handoff, /origin=prepare-to-review/);
  assert.match(handoff, /do not upload it again/);
  assert.doesNotMatch(handoff, /\/publish|\/approve-all/);
});

test("the automatic trigger runs after uploading and draft setup clear", () => {
  const start = section("async function startEzProduction(", "function bindEzWizard(");
  assert.match(start, /ezStarting = false;[\s\S]*maybeAutoAdvanceVibeCutToReview/);
  const uploads = section("async function uploadItem4Files(", "const item4PendingRemoves");
  assert.match(uploads, /item4Uploading = false;[\s\S]*maybeAutoAdvanceVibeCutToReview/);
});

test("ready state is for review, not manual production, and fallback is safe", () => {
  const action = section("function renderVibeCutCommitAction(", "function ezPersistedKindCounts(");
  assert.match(action, /Advance to Approval/);
  assert.match(action, /Retry advance to approval/);
  assert.match(action, /vibeAutoReviewQueued\.has\(id\)/);
  const handler = section('  $("item4VibeSaveContinue")?.addEventListener("click", async (event) => {',
    '  $("item4ChooseMedia")?.addEventListener(');
  assert.match(handler, /maybeAutoAdvanceVibeCutToReview\(item4Workspace, \{ manual: true \}\)/);
  assert.doesNotMatch(handler, /saveActiveProductionRequest|buildItem4Plan/);
  const progress = section("function vibeUploadProgressMarkup(", "function renderVibeUploadUi(");
  assert.match(progress, /human approval/);
  assert.match(progress, /nothing publishes automatically|Nothing publishes automatically|no publishing occurs/);
  assert.match(progress, /Factory > Needs Eyes/);
  const render = section("function updateItem4MasterProgress(", "function mergeItem4WorkspaceStatus(");
  assert.match(render, /Can I leave\\?/);
});

test("a verified upload is required even with an old persisted draft", () => {
  const source = section("function vibeCutReadySource(", "function clearVibeUploadStallTimer(");
  assert.match(source, /assets_status !== "Ready"/);
  assert.match(source, /multipart_pending/);
  assert.match(source, /compression_status/);
});
