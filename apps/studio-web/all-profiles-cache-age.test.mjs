import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(fileURLToPath(new URL("./assets/all-profiles-overview-1007.js", import.meta.url)), "utf8");

test("overview cache age comes from the authoritative server snapshot timestamp", () => {
  assert.match(source, /at: Number\(parsed\.at\) \|\| 0/);
  assert.match(source, /snapshotAt = Number\(data\?\.snapshot_at \|\| 0\)/);
  assert.match(source, /if \(authoritativeAt > 0\) state\.cacheAt = authoritativeAt/);
  assert.match(source, /writeCache\(state\.rows, \{/);
  assert.doesNotMatch(source, /state\.cacheAt = Date\.now\(\)/);
  assert.match(source, /function cacheAgeLabel\(/);
  assert.match(source, /Showing cached overview/);
});

test("unchanged snapshot fetch cannot make old data look newly refreshed", () => {
  assert.match(source, /generation: String\(parsed\.generation \|\| ""\)/);
  assert.match(source, /state\.snapshotGeneration = String\(data\.snapshot_generation \|\| ""\)/);
  assert.match(source, /generation: state\.snapshotGeneration/);
  assert.doesNotMatch(source, /writeCache\(state\.rows\);/);
});
