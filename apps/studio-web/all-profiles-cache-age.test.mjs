import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
const source = fs.readFileSync(fileURLToPath(new URL("./assets/all-profiles-overview-1007.js", import.meta.url)), "utf8");
test("cached overview indicates age based on persisted creation time", () => {
  assert.match(source, /at: Number\(parsed\.at\) \|\| 0/);
  assert.match(source, /function cacheAgeLabel\(/);
  assert.match(source, /Showing cached overview \(\$\{cacheAgeLabel\(\)\}\)/);
  assert.match(source, /if \(!data\?\.stale && !data\?\.cooling\) writeCache\(state\.rows\)/);
  assert.match(source, /state\.rows\.length \? \{ rows: state\.rows, at: state\.cacheAt \} : readCache\(\)/);
});
