import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function section(a, b) {
  const start = app.indexOf(a);
  const end = app.indexOf(b, start + a.length);
  assert.ok(start !== -1 && end > start, `Expected ${a} before ${b}`);
  return app.slice(start, end);
}

test("Vibe Cut paints the selected filename before draft creation or upload begins", () => {
  const receive = section("function receiveMasterPhotos(", "async function startEzFromFiles(");
  assert.match(receive, /beginVibeUploadFeedback\(files\[0\]\)/);
  assert.ok(receive.indexOf("beginVibeUploadFeedback(files[0])") < receive.indexOf("startEzProduction"));

  const feedback = section("function beginVibeUploadFeedback(", "function syncVibeUploadUiFromWorkspace(");
  assert.match(feedback, /paintItem4LocalPreviews\(\[file\]/);
  assert.match(feedback, /setVibeUploadUi\("selected"/);
});

test("Vibe Cut reports truthful selection, upload, save, process, ready, stall, and failure states", () => {
  const markup = section("function vibeUploadProgressMarkup(", "function renderVibeUploadUi(");
  assert.match(markup, /Selected \$\{fileName\}/);
  assert.match(markup, /Uploading \$\{fileName\}/);
  assert.match(markup, /Upload transfer finished/);
  assert.match(markup, /Upload complete:/);
  assert.match(markup, /Video ready:/);
  assert.match(markup, /This upload may be stalled/);
  assert.match(markup, /failed to upload/);
  assert.match(markup, /Video uploaded; preparation needs attention/);
  assert.match(markup, /Your original upload remains saved/);
  assert.match(markup, /1 selected · 0 ready/);
  assert.match(markup, /1 uploaded · 0 ready/);
  assert.match(markup, /1 of 1 ready/);
  assert.doesNotMatch(markup, /0 of 1 saved/);
});

test("Vibe Cut exposes stalled feedback and a non-destructive recovery path", () => {
  assert.match(html, /id="ezUploadRetryActions" hidden/);
  assert.match(html, /id="ezUploadRetry">Retry video upload/);

  const state = section("function setVibeUploadUi(", "function beginVibeUploadFeedback(");
  assert.match(state, /VIBE_UPLOAD_STALL_MS/);
  assert.match(state, /phase: "stalled"/);
  assert.match(state, /No segment progress was confirmed/);
  assert.match(state, /Production draft creation has not completed/);

  const retry = section("function retryVibeUpload(", "function receiveMasterPhotos(");
  assert.match(retry, /vibeUploadAbortController\.abort\(\)/);
  assert.match(retry, /replaceIncompleteVibeSourceAndUpload/);
  assert.doesNotMatch(retry, /method: "DELETE"/);
  assert.match(retry, /snapshot=1/);
  assert.match(retry, /uploadItem4Files\(files/);

  const workspaceRetry = section('$("item4VibeRetryVideo")', "let item4LibraryItems");
  assert.match(workspaceRetry, /retryVibeUpload\("item4ClipInput"\)/);
  assert.match(workspaceRetry, /ezIsVibeCut\(\) && vibeUploadRetryRequested\) receiveMasterPhotos/);
});

test("Vibe Cut consumes backend upload authority and keeps Continue disabled until Ready", () => {
  const upload = section("async function uploadItem4Files(", "const item4PendingRemoves");
  assert.match(upload, /assetsStatus: result\.authority_status/);
  assert.match(upload, /result\?\.compression_pending/);

  const apply = section("function item4ApplyAssetsLocally(", "function item4RemoveAssetCardsFromDom(");
  assert.match(apply, /acknowledgedStatus/);

  const action = section("function renderVibeCutCommitAction(", "function ezPersistedKindCounts(");
  assert.match(action, /wizard\.hidden = !source/);
  assert.match(action, /wizard\.disabled = !source/);

  const create = section("async function startEzProduction(", "function bindEzWizard(");
  assert.match(create, /action\.hidden = !vibeCutReadySource\(\)/);
  assert.match(create, /continueBtn\.disabled = ezIsVibeCut\(\) \? !vibeCutReadySource\(\) : false/);
  assert.doesNotMatch(create, /action\.hidden = false/);
});

test("Vibe Cut processing status explains actual steps and when it is safe to leave", () => {
  const markup = section("function vibeUploadProgressMarkup(", "function renderVibeUploadUi(");
  assert.match(markup, /What Studio is doing|Original upload verified and saved/);
  assert.match(markup, /Creating a video optimized for editing/);
  assert.match(markup, /Waiting for server-side video processing/);
  assert.match(markup, /Checking the prepared video, Drive copy, and preview/);
  assert.match(markup, /server-side preparation continues without this tab/);
  assert.match(markup, /Production > Drafts/);
  assert.match(markup, /Not yet\. Keep this screen open/);
  assert.match(markup, /uploadConfirmed/);
  assert.match(markup, /multipart_pending/);
  assert.match(markup, /upload_status/);
  assert.match(markup, /compression_status/);
  assert.match(markup, /compression_progress/);
  const render = section("function updateItem4MasterProgress(", "function mergeItem4WorkspaceStatus(");
  assert.match(render, /vibe-upload-guidance-steps/);
  assert.match(render, /Can I leave\?/);
  assert.match(render, /Where will I find it\?/);
  assert.match(render, /escapeHtml\(step.label\)/);
  assert.match(render, /escapeHtml\(guide.leave\)/);
});

test("Vibe processing stage and leave guidance cannot falsely confirm a partial upload", () => {
  const block = section("function vibeUploadProgressMarkup(", "function renderVibeUploadUi(");
  const code = block + "\n globalThis.testMarkup = vibeUploadProgressMarkup;";
  function scenario({ phase = "processing", upload = "complete", time = "2026-11-01T20:00:00Z", compression = "queued", pct = 0, uploading = false, ready = false } = {}) {
    const status = { assets_status: ready ? "Ready" : "Processing", assets: [{
      id: "asset-1", name: "video.mov", media_kind: "video",
      upload_status: upload, uploaded_at: time,
      compression_status: compression, compression_progress: pct,
    }] };
    const context = vm.createContext({
      globalThis: {},
      item4Workspace: status,
      item4Uploading: uploading,
      vibeUploadUi: { phase, fileName: "video.mov", detail: "Transfer complete" },
      ezIsVibeCut: () => true,
      vibeCutReadySource: () => ready ? status.assets[0] : null,
      vibeCutPersistedSource: () => status.assets[0],
      vibeUploadFileSizeLabel: () => "10 MB",
      item4CompressionProgressLabel: () => "Queued",
    });
    vm.runInContext(code, context);
    return context.globalThis.testMarkup(status);
  }
  assert.match(scenario().guidance.leave, /Yes\. You can close/);
  assert.match(scenario({ compression: "compressing", pct: 38 }).guidance.steps[1].label, /38%/);
  assert.match(scenario({ upload: "multipart_pending", time: "", phase: "processing" }).guidance.leave, /Not yet/);
  assert.match(scenario({ upload: "multipart_pending", time: "" }).count, /confirmation pending/);
  assert.match(scenario({ upload: "complete", time: "", uploading: true }).guidance.leave, /Not yet/);
  assert.match(scenario({ ready: true }).guidance.steps[2].state, /done/);
  assert.doesNotMatch(scenario({ upload: "multipart_pending", time: "" }).body, /safely uploaded/);
});
