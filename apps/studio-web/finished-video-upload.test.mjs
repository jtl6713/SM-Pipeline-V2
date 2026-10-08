import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");

test("finished-video quick publish offers exact optional copy", () => {
  const details = html.slice(
    html.indexOf('class="az-optional-fields"'),
    html.indexOf('id="azFinishedZone"'),
  );
  assert.ok(details.indexOf('id="azFinishedCaption"') < details.indexOf('id="azFinishedLocation"'));
  assert.match(details, /id="azFinishedNotes"/);
  assert.match(app, /azFinishedCaption[\s\S]*ezCaptionMode"\)\.value = "Force exact"/);
  assert.match(app, /azFinishedLocation[\s\S]*primaryLocationUserEdited = true/);
});

test("finished-video quick publish uploads before workspace refreshes", () => {
  const start = app.slice(
    app.indexOf("async function startEzProduction"),
    app.indexOf("function bindEzWizard"),
  );
  const upload = start.indexOf("await uploadItem4Files(nextFiles");
  const outputRefresh = start.indexOf("await loadProductionRequestOutputs(created.record)");
  assert.ok(upload > 0 && outputRefresh > upload);
  assert.match(start, /visibleError[\s\S]*The video did not finish uploading/);
});

test("every finished video uses resumable multipart upload", () => {
  const decision = app.slice(
    app.indexOf("function item4ShouldUseLargeFinishedUpload"),
    app.indexOf("async function postItem4MasterFile"),
  );
  assert.match(decision, /ezIsFinishedVideo\(\) \|\| ezIsAzFinishedPath\(\)/);
  assert.doesNotMatch(decision, /ITEM4_DIRECT_UPLOAD_MAX_BYTES/);
  assert.match(app, /Array\.isArray\(result\?\.assets\)[\s\S]*item4ApplyAssetsLocally\(result\.assets\)/);
});


test("finished-video production save keeps a video content type", () => {
  const infer = app.slice(
    app.indexOf("function inferredMasterContentType"),
    app.indexOf("function syncHiddenMasterContentType"),
  );
  assert.match(infer, /ezIsFinishedVideo\(\) \|\| ezIsClipRequest\(\)/);
  assert.match(infer, /return "Vertical Short Video"/);
});

test("finished-video production player can use the persisted public MP4", () => {
  const playable = app.slice(
    app.indexOf("function item4PlayableClipSrc"),
    app.indexOf("function item4ClipDurationBadgeHtml"),
  );
  assert.match(playable, /preview_public_url \|\| asset\?\.url/);
  assert.match(playable, /media\\\.chicagoshining\\\.com/);
});
