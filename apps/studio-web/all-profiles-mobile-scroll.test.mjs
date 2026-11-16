import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./assets/all-profiles-overview-1007.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("Home Dashboard has exactly three separate stage tables in requested order", () => {
  const scheduled = source.indexOf('aria-label="Scheduled content"');
  const issues = source.indexOf('aria-label="Issues requiring attention"');
  const pipeline = source.indexOf('aria-label="Production pipeline"');
  assert.ok(scheduled >= 0 && issues > scheduled && pipeline > issues);
  assert.match(source, /table\("scheduled"/);
  assert.match(source, /table\("issues"/);
  assert.match(source, /table\("pipeline"/);
  assert.match(html, /home-dashboard-three-sections\.css\?v=/);
});

test("Scheduled totals use only queued approved platform outputs, never Factory+future pipeline", () => {
  assert.match(source, /const scheduledTotal = platformOrder\.reduce\(\(sum, p\) => sum \+ \(Number\(r\.scheduled\?\.\[p\]\) \|\| 0\), 0\)/);
  assert.match(source, /Total scheduled/);
  assert.match(source, /Factory items are excluded/);
  assert.match(source, /calendar\.pastDue/);
  assert.match(source, /calendar\.missingDate/);
  assert.match(source, /"production", "unfinished production outputs"/);
  assert.match(source, /"approval", "Factory items awaiting your approval"/);
});

test("poll and refresh update each section without resetting its horizontal scrollport", () => {
  assert.match(source, /host\.querySelectorAll\("\.all-profiles-table-wrap tbody"\)/);
  assert.match(source, /visibleBodies\.length === ids\.length/);
  assert.match(source, /visibleBodies\.every\(\(tbody\) => tbody\.rows\.length === state\.rows\.length \+ 1\)/);
  assert.match(source, /const updatedBody = document\.createElement\("tbody"\)/);
  assert.match(source, /oldCells\[cellIndex\]\.innerHTML !== newCells\[cellIndex\]\.innerHTML/);
  assert.match(source, /oldCells\[cellIndex\]\.innerHTML = newCells\[cellIndex\]\.innerHTML/);
  assert.match(source, /tbody\.replaceWith\(updatedBody\)/);
});

test("action counts and refresh are delegated once and point to exact Factory review", () => {
  assert.equal((source.match(/host\.addEventListener\("click",/g) || []).length, 1);
  assert.match(source, /button\.id === "allProfilesRefresh"/);
  assert.match(source, /button\.classList\.contains\("overview-action-count"\)/);
  assert.match(source, /if \(kind === "approval"\)/);
  assert.match(source, /factoryLaneNeedsEyesHeading/);
  assert.match(source, /if \(kind === "production"\)/);
});

test("cached authoritative snapshots and 12-second polling remain intact", () => {
  assert.match(source, /POLL_MS = 12000/);
  assert.match(source, /validOverviewRows\(rows\)/);
  assert.match(source, /function refreshMatchesSnapshot/);
  assert.match(source, /function overviewViewActive/);
  assert.match(source, /studio\.allProfilesOverview\.v7/);
});
