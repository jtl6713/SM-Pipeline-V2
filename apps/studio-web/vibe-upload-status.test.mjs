import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
  assert.match(markup, /Upload complete\. Saving/);
  assert.match(markup, /Processing \$\{fileName\}/);
  assert.match(markup, /\$\{fileName\} is ready/);
  assert.match(markup, /This upload may be stalled/);
  assert.match(markup, /failed to upload/);
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
  assert.match(state, /No recent transfer progress was confirmed/);

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
