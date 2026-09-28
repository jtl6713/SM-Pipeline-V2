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
