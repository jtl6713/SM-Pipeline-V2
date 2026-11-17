import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
test("Factory active approval progress refresh is bounded, transparent, and uses one snapshot", async () => {
  const factory = await readFile(path.join(here, "assets/factory-desk.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(factory, /function updateFactoryBatchFreshness\(/);
  assert.match(factory, /Status delayed · last updated/);
  assert.match(factory, /lastBatchSuccessMs = Date\.now\(\)/);
  assert.match(factory, /timeoutMs: 12000/);
  assert.match(factory, /\}, 3000\);/);
  assert.match(factory, /batchActivityLoading\s*\|\|/);
  assert.match(factory, /aggregateDone = batches\.reduce/);
  assert.match(factory, /const completed = Number\(row\.done_count/);
  assert.match(factory, /state\.batchActivityError = String\(error/);
  assert.doesNotMatch(factory, /"Live · batches needing action"/);
  assert.match(html, /activity=global-parent-child-v6-freshness/);
});
