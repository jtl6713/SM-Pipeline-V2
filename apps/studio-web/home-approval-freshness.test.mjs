import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Home refuses out-of-order overview snapshots that would roll approval counters backward", async () => {
  const src = await readFile(new URL("./assets/all-profiles-overview-1007.js", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("function adoptOverview("), src.indexOf("function retrySoon("));
  assert.match(block, /if \(nextVersion > 0 && state\.summaryVersion > nextVersion\) return false/);
  assert.match(block, /snapshotAt < state\.cacheAt/);
  assert.ok(block.indexOf("snapshotAt < state.cacheAt") < block.indexOf("state.rows = mapRows(rows)"),
    "freshness fence must occur before overwriting Home rows");
  assert.match(block, /nextVersion === 0 \|\| nextVersion === state\.summaryVersion/);
});
