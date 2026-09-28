import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Production slide-count validation accepts attached still counts beyond 20", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("async function cleanProductionRequestPayload");
  const end = worker.indexOf("function productionRequestFields", start);
  assert.ok(start >= 0 && end > start);
  const handler = worker.slice(start, end);
  assert.match(handler, /nullableInt\(slideExactCoerced, 1, Number\.MAX_SAFE_INTEGER, "Exact carousel slide count"\)/);
  assert.match(handler, /nullableInt\(payload\?\.carousel_slide_count_min, 1, Number\.MAX_SAFE_INTEGER, "Minimum carousel slide count"\)/);
  assert.match(handler, /nullableInt\(payload\?\.carousel_slide_count_max, 1, Number\.MAX_SAFE_INTEGER, "Maximum carousel slide count"\)/);
});


test("bridge preflight accepts carousel counts above 20", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("function productionRequestCompatibilityIssues");
  const end = worker.indexOf("function productionRequestFields", start);
  const handler = worker.slice(start, end > start ? end : start + 12000);
  assert.ok(start >= 0);
  assert.match(handler, /if \(!Number\.isInteger\(exact\) \|\| exact < 1\)/);
  assert.match(handler, /Enter a valid exact carousel slide count of 1 or more/);
  assert.doesNotMatch(handler, /exact > 20/);
  assert.doesNotMatch(handler, /max > 20/);
  assert.doesNotMatch(handler, /from 1 through 20/);
});
