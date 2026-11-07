import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("./index.html");
const app = read("./assets/story-first-workspace.js");
const helper = read("../studio-api/worker-functions-01.mjs");
const propose = read("../studio-api/worker-functions-02.mjs");
const worker = read("../studio-api/worker.js");
const api = read("../studio-api/worker-functions-03.mjs");

test("Script a Short is the one visible story-first entry and can resume a saved Idea", () => {
  for (const id of ["storyFirstPanel","storyFirstBrief","storyFirstSaved","storyFirstShots",
    "storyFirstSave","storyFirstRefresh","storyFirstProduction"]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(html, /id="scriptedShortPanel"/);
  assert.doesNotMatch(html, /id="scriptedShortPanel" hidden/);
  assert.match(app, /originalShortForm\.addEventListener\("submit"/);
  assert.match(app, /appendChild\(panel\)/);
  assert.match(html, /<h2>Storyboard &amp; Scene Media<\/h2>/);
  assert.match(app, /studio\.story_first_resume\./);
  assert.match(app, /storyboard:/);
  assert.match(app, /creative_first: true/);
});
test("Idea is authored independently before no more than three verified-profile suggestions per scene", () => {
  assert.match(propose, /creativeFirst \? \[\] : pool/);
  assert.match(propose, /candidate_asset_id: match\?\.id \|\| null/);
  assert.match(propose, /asset_id: "", shot_status: "suggestion"/);
  assert.match(app, /function credibleMatches/);
  assert.match(app, /slice\(0,3\)|slice\(0, 3\)/);
  assert.match(app, /content_profile_id === current\.profile/);
  assert.match(app, /rights_status/);
  assert.match(app, /google_drive_file_id/);
  assert.match(app, /View preview/);
  assert.match(app, /selectSceneAsset\(asset\._index,asset\)/);
});
test("On-demand AI generation has preview, accept, decline, no premature production", () => {
  assert.match(app, /Generate AI Image/);
  assert.match(app, /Accept Image/);
  assert.match(app, /Decline Image/);
  assert.match(app, /Generate Again/);
  assert.match(app, /async function decideGenerated/);
  assert.match(api, /\/jobs\/studio-ai-image/);
  assert.match(api, /studio\/story-first\/pending/);
  assert.match(api, /promoteStudioAssetToDrive/);
  assert.match(api, /"AI Generated"/);
  assert.doesNotMatch(app.slice(app.indexOf("async function generateSceneImage"),app.indexOf("function render()")), /\/production-request/);
});
test("Self-service uploads, existing library browse and guarded production handoff", () => {
  assert.match(app, /Upload Image \/ Clip Here/);
  assert.match(app, /XMLHttpRequest/);
  assert.match(app, /\/api\/library\?profile=/);
  assert.match(app, /Choose Existing Asset/);
  assert.match(app, /Save (?:&|and) open Asset Manager/i);
  assert.match(app, /selectedCount\(\) !== current\.story\.scenes\.length/);
  assert.match(propose, /verifiedStoryFirstProduction/);
  assert.match(propose, /validateStoryFirstSelectedMedia/);
  assert.match(worker, /isStoryFirstSceneMediaRoute/);
  assert.doesNotMatch(app, /\/api\/outputs\/.*\/publish|\/api\/production-requests\/.*\/approve/);
});
test("Canonical Airtable Ideas remain the only writable story source, other Idea paths are gated", () => {
  assert.match(helper, /normalizeStoryFirst\(payload\?\.storyboard, profile\.id\)/);
  assert.match(helper, /!vibeCut && ctx\?\.waitUntil && !storyFirst/);
  assert.match(helper, /fields\.Production_Config_Notes = upsertStoryFirstNotes/);
  assert.match(helper, /story_first: parseStoryFirstNotes/);
  assert.match(worker, /assertWriteRequest\(request, env\)/);
});

test("Successful storyboard handoff opens the actual Production navigation route", () => {
  assert.match(html, /data-page="content">Production<\/button>/);
  assert.match(app, /button\.nav-item\[data-page="content"\]/);
  assert.doesNotMatch(app, /data-page="production"/);
  assert.match(app, /result\.created === false/);
  assert.match(app, /production_request_id/);
});
