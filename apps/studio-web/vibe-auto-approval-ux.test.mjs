import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function section(start, stop) {
  const a = app.indexOf(start), b = app.indexOf(stop, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing ${start}/${stop}`);
  return app.slice(a, b);
}

test("verified Vibe status explains server-side progression and human-only approval", () => {
  const status = section("function vibeUploadProgressMarkup(", "function renderVibeUploadUi(");
  assert.match(status, /Studio automatically completes production, renders the Vibe Cut and routes it to your approval/);
  assert.match(status, /nothing publishes automatically/);
  assert.match(status, /Production > Drafts/);
  assert.match(status, /Approval Factory > Needs Eyes/);
  assert.match(status, /Studio continues production in the background after you leave/);
  assert.match(status, /1 of 1 uploaded/);
  assert.match(status, /Automatic handoff to rendering and human approval/);
});

test("ready-source gating remains server authoritative; Production view is optional", () => {
  const source = section("function vibeCutReadySource(", "function clearVibeUploadStallTimer(");
  assert.match(source, /assets_status !== "Ready"/);
  assert.match(source, /multipart_pending/);
  const actions = section("function renderVibeCutCommitAction(", "function ezPersistedKindCounts(");
  assert.match(actions, /wizard\.hidden = !source/);
  assert.match(actions, /wizard\.disabled = !source/);
  assert.match(actions, /View Production \(optional\)/);
  assert.doesNotMatch(actions, /Save Video & Continue to Production/);
});

test("new release version is consistently reflected in HTML and app", () => {
  assert.match(html, /UI build 0\.6\.835/);
  assert.match(html, /app-item4-1008\.js\?v=0\.6\.835-vibe-auto-approval-ux/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.835-vibe-auto-approval-ux"/);
});
