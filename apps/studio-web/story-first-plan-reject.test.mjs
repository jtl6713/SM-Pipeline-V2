import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("./index.html");
const app = read("./assets/story-first-workspace.js");

test("the active story-first review exposes whole-plan rejection above and below long scenes", () => {
  const first = html.indexOf('id="storyFirstReject"');
  const scenes = html.indexOf('id="storyFirstShots"');
  const bottom = html.indexOf('id="storyFirstRejectBottom"');
  assert.ok(first > 0 && first < scenes && scenes < bottom,
    "reject must be visible before the long shot list as well as after it");
  assert.match(html, /id="storyFirstReject"[^>]*>Reject Plan &amp; Start Over/);
  assert.match(html, /id="storyFirstDeleteSaved" hidden/);
  assert.match(app, /\$\("storyFirstReject"\)\?\.addEventListener\("click", rejectWholePlan\)/);
  assert.match(app, /\$\("storyFirstRejectBottom"\)\?\.addEventListener\("click", rejectWholePlan\)/);
});

test("reject clears the active draft and preserves the editable original brief and media", () => {
  const reset = app.slice(app.indexOf("function resetRejectedPlan()"), app.indexOf("function rejectWholePlan()"));
  assert.match(reset, /current\.planRequest \+= 1/);
  assert.match(reset, /current\.record = null/);
  assert.match(reset, /current\.story = null/);
  assert.match(reset, /current\.candidates = \{\}/);
  assert.match(reset, /current\.selectedAssetNames = \{\}/);
  assert.match(reset, /scriptedShortPrompt/);
  assert.match(reset, /render\(\)/);
  assert.doesNotMatch(reset, /method: "DELETE"|\/api\/production-requests|\/api\/library/);
  assert.match(app, /Saved Idea will remain in Airtable and can be reopened/);
});

test("saved storyboard has a separate guarded permanent delete, never a media or production delete", () => {
  const deletion = app.slice(app.indexOf("async function deleteSavedPlan()"), app.indexOf("function syncDeleteSavedPlan()"));
  assert.match(deletion, /record\.production_request_id/);
  assert.match(deletion, /record\.promoted_content_record_id/);
  assert.match(deletion, /record\.content_item_links\?\.length/);
  assert.match(deletion, /Permanently delete saved Idea/);
  assert.match(deletion, /method: "DELETE"/);
  assert.match(deletion, /\/api\/ideas\//);
  assert.doesNotMatch(deletion, /\/api\/library\/|\/api\/outputs\/|\/production-request\//);
  assert.match(app, /syncDeleteSavedPlan\(\)/);
});

test("reject and profile switch fence stale in-flight AI proposals", () => {
  const proposal = app.slice(app.indexOf("async function propose(e)"), app.indexOf('  $("scriptedShortStoryFirstJump")'));
  assert.match(proposal, /const request = \+\+current\.planRequest/);
  assert.match(proposal, /request !== current\.planRequest \|\| profileId\(\) !== id/);
  assert.match(proposal, /if \(request === current\.planRequest\)/);
  assert.match(app, /current\.planRequest \+= 1;\s*current\.profile = id/);
});
