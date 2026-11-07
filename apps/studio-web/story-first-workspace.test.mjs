import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("./index.html");
const app = read("./assets/story-first-workspace.js");
const helper = read("../studio-api/worker-functions-01.mjs");
const propose = read("../studio-api/worker-functions-02.mjs");
test("Ideas exposes story-first choice, saved draft reopening, and per-shot AI/capture controls", () => {
  for (const id of ["scriptedShortStoryFirstJump","storyFirstPanel","storyFirstBrief","storyFirstSaved","storyFirstShots","storyFirstSave","storyFirstRefresh"]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(html, /assets\/story-first-workspace\.js\?v=0\.6\.901-story-first/);
  assert.match(html, /assets\/story-first-workspace\.css\?v=0\.6\.901-story-first/);
  assert.match(app, /Generate this AI image/);
  assert.match(app, /Save & open Asset Manager/);
  assert.match(app, /story_first/);
  assert.match(app, /storyboard:/);
  assert.match(app, /creative_first: true/);
});
test("Story is written with empty writer catalog and unverified candidates are not silently owned", () => {
  assert.match(propose, /creativeFirst \? \[\] : pool/);
  assert.match(propose, /candidate_asset_id: match\?\.id \|\| null/);
  assert.match(propose, /asset_id: "", shot_status: "suggestion"/);
});
test("Story-first revisions are in canonical Ideas with no photo auto-listen or publish mutation", () => {
  assert.match(helper, /normalizeStoryFirst\(payload\?\.storyboard, profile\.id\)/);
  assert.match(helper, /!vibeCut && ctx\?\.waitUntil && !storyFirst/);
  assert.match(helper, /fields\.Production_Config_Notes = upsertStoryFirstNotes/);
  assert.match(helper, /story_first: parseStoryFirstNotes/);
  assert.doesNotMatch(app, /\/api\/outputs\/.*\/publish|\/api\/production-requests\/.*\/approve/);
});
