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
