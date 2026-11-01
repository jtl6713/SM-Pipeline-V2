import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./assets/all-profiles-overview-1007.js", import.meta.url), "utf8");

test("poll and refresh updates preserve the existing horizontal scroll container", () => {
  assert.match(source, /host\.querySelector\("\.all-profiles-table-wrap tbody"\)/);
  assert.match(source, /visibleBody\.rows\.length === state\.rows\.length \+ 1/);
  assert.match(source, /const updatedBody = document\.createElement\("tbody"\)/);
  assert.match(source, /oldCells\[cellIndex\]\.innerHTML !== newCells\[cellIndex\]\.innerHTML/);
  assert.match(source, /oldCells\[cellIndex\]\.innerHTML = newCells\[cellIndex\]\.innerHTML/);
  assert.match(source, /\n      return;\n    }\n\n    host\.innerHTML =/);
});

test("action counts and manual refresh are delegated once, not re-bound on each redraw", () => {
  const clickDelegation = source.match(/host\.addEventListener\("click",/g) || [];
  assert.equal(clickDelegation.length, 1);
  assert.match(source, /button\.id === "allProfilesRefresh"/);
  assert.match(source, /button\.classList\.contains\("overview-action-count"\)/);
  assert.doesNotMatch(source, /host\.querySelectorAll\("\.overview-action-count"\)\.forEach/);
});

test("cached snapshots and automatic 12-second polling stay intact", () => {
  assert.match(source, /POLL_MS = 12000/);
  assert.match(source, /validOverviewRows\(rows\)/);
  assert.match(source, /function refreshMatchesSnapshot/);
  assert.match(source, /function overviewViewActive/);
});

test("pipeline total is the first metric column and uses the same style as platforms", () => {
  const profileHeader = source.indexOf('>Profile</th>');
  const totalHeader = source.indexOf('>Pipeline · Total</th>');
  const platformGroup = source.indexOf('>Future + Review platform outputs</th>');
  assert.ok(profileHeader >= 0 && profileHeader < totalHeader && totalHeader < platformGroup);
  const totalCell = '<td data-label="Pipeline total">${calendar.pipelineTotal}</td>';
  const platformCells = '${platformOrder.map((p) => `<td data-label="${p} future and review outputs">';
  const totalPosition = source.indexOf(totalCell);
  const platformPosition = source.indexOf(platformCells);
  assert.ok(totalPosition >= 0 && platformPosition > totalPosition);
  assert.doesNotMatch(source, /<td data-label="Pipeline total" class="overview-tone-ok">/);
});
