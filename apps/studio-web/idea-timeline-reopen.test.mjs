import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");

const first = app.indexOf("function selectIdeaProductionRequest(");
const last = app.indexOf("async function openOrCreateIdeaTimeline(", first);
assert.ok(first >= 0 && last > first, "production-request selector is present");
const selectRequest = vm.runInNewContext("(" + app.slice(first, last).trim() + ")");

function request(id, status, createdAt, notes = "") {
  return { id, status, created_at: createdAt, production_notes: notes };
}
const sevenScenes = '[timed-script] {"mode":"timed_script","duration_seconds":41.2,"segments":[1,2,3,4,5,6,7]}';
const eightScenes = '[timed-script] {"mode":"timed_script","duration_seconds":53.2,"segments":[1,2,3,4,5,6,7,8]}';

test("Pilsen opens original seven-scene timeline instead of later generated duplicate", () => {
  const records = [
    request("first-blank", "Draft", "2026-10-08T12:34:28Z"),
    request("later-eight", "Ready", "2026-10-09T12:52:35Z", eightScenes),
    request("original-seven", "Ready", "2026-10-09T06:45:20Z", sevenScenes),
  ];
  assert.equal(selectRequest(records).id, "original-seven");
});

test("existing Ready production request is reopened even when it has no timed-script directive", () => {
  const records = [
    request("draft", "Draft", "2026-10-08T00:00:00Z"),
    request("ready", "Ready", "2026-10-09T00:00:00Z"),
  ];
  assert.equal(selectRequest(records).id, "ready");
});

test("published or unusable Production requests are never selected for another timeline", () => {
  assert.equal(selectRequest([request("published", "Promoted", "2026-10-08T00:00:00Z")]), null);
  assert.equal(selectRequest([]), null);
});

test("all three Ideas timeline actions route through one safe open-or-create path", () => {
  const action = app.slice(app.indexOf('scope.querySelectorAll("[data-idea-timeline]")'),
    app.indexOf('scope.querySelectorAll("[data-idea-id]")'));
  assert.match(action, /openOrCreateIdeaTimeline\(idea/);
  assert.match(app, /openOrCreateIdeaTimeline\(activeIdea, \{ heading: true \}\)/);
  assert.match(app, /openOrCreateIdeaTimeline\(activeIdea, \{ button: \$\("createIdeaTimelineButton"\) \}\)/);
  const helper = app.slice(first, app.indexOf('$("createIdeaTimelineButton")?.addEventListener', first));
  assert.match(helper, /if \(knownIds\.length\)/);
  assert.match(helper, /Promise\.allSettled/);
  assert.match(helper, /If this read fails, fail closed/);
  assert.match(helper, /strict: true/);
  assert.match(helper, /await createIdeaTimedScript\(idea/);
  assert.doesNotMatch(action, /background:\s*true/);
});

test("photo-wait shell production requests still run Create timeline instead of opening an empty draft", () => {
  const opener = app.slice(
    app.indexOf("async function openOrCreateIdeaTimeline("),
    app.indexOf('$("createIdeaTimelineButton")?.addEventListener'),
  );
  assert.match(opener, /productionRequestNotesHaveTimedScript\(existing\.production_notes\)/);
  assert.match(opener, /if \(!hasTimeline\)/);
  assert.match(opener, /silentPromoted/);
  assert.match(opener, /await createIdeaTimedScript\(idea, \{ button, heading \}\)/);
  assert.match(opener, /\?fields=light/);
  assert.match(app, /function ideaDraftNeedsTimeline\(idea\)/);
  const row = app.slice(app.indexOf("function ideaTimelineRowButtonLabel("), app.indexOf("function ideaCanPromote("));
  assert.match(row, /wait === "Waiting" \|\| wait === "Ready"/);
  assert.match(row, /return "Create VO timeline"/);
});
