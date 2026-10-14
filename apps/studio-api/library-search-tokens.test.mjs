import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("assetLibraryFilterFormula uses token OR FIND for unquoted search", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("function assetLibraryFilterFormula");
  assert.ok(start > 0);
  const fn = worker.slice(start, start + 1400);
  assert.match(fn, /Token OR/);
  assert.match(fn, /ideaLibrarySearchFilterKeys\(ideaLibraryTokens\(query\)\)/);
  assert.match(fn, /OR\(\$\{clauses\.join/);
  assert.doesNotMatch(fn, /const needle = String\(phrase \|\| query/);
  assert.doesNotMatch(fn, /FIND\("\$\{escaped\}", \$\{hay\}\)/);
  assert.match(worker, /version: "0.10.602-ten-ideas-per-hour"/);
});
