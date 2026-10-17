import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(fileURLToPath(new URL("./assets/all-profiles-overview-1007.js", import.meta.url)), "utf8");

test("manual Refresh uses protected POST and durable status polling", () => {
  assert.match(source, /json\("\/api\/profiles\/overview\/refresh", \{/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /body: \{\}/);
  assert.match(source, /\/api\/profiles\/overview\/refresh-status\?_=/);
  assert.match(source, /REFRESH_POLL_MS = 1800/);
  assert.match(source, /writeRefreshIntent/);
  assert.match(source, /readRefreshIntent/);
});

test("refresh preserves prior rows and disables repeated clicks", () => {
  assert.match(source, /if \(state\.manualRefreshing\) return;/);
  assert.match(source, /const refreshText = state\.manualRefreshing \? "Refreshing…" : "Refresh"/);
  assert.match(source, /disabled aria-disabled/);
  assert.doesNotMatch(source, /state\.rows = \[\].*forceRefresh/s);
});

test("manual success requires the completed generation to be fetched", () => {
  assert.match(source, /function refreshMatchesSnapshot/);
  assert.match(source, /generation === state\.snapshotGeneration/);
  assert.match(source, /await load\(true\)/);
  assert.match(source, /if \(!refreshMatchesSnapshot\(refresh\)\)/);
  assert.match(source, /state\.refreshMessage = "Updated just now"/);
});

test("failure and cooldown retain old data with compact age messaging", () => {
  assert.match(source, /Refresh failed · Showing previous data/);
  assert.match(source, /Refreshing temporarily unavailable · Showing previous data/);
  assert.match(source, /cacheAgeLabel\(\)/);
});

test("normal five-second polling never calls the force-refresh POST", () => {
  const loadStart = source.indexOf("async function load(");
  const loadEnd = source.indexOf("const cachedNow", loadStart);
  const loadBody = source.slice(loadStart, loadEnd);
  assert.match(loadBody, /\/api\/profiles\/overview\?_=/);
  assert.doesNotMatch(loadBody, /profiles\/overview\/refresh"/);
  assert.match(source, /POLL_MS = 5000/);
});

test("durable refresh status continues independently of Home visibility", () => {
  assert.match(source, /Durable refresh[\s\S]*leaving Home does not cancel a refresh/);
  assert.match(source, /scheduleRefreshStatusPoll/);
  assert.match(source, /syncRefreshStatus\(\{ quiet: true \}\)/);
});
