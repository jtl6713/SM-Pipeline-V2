import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("production draft falls back to Suggested_Platforms when explicit targets are absent", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("function productionRequestDefaultsFromIdea");
  const end = worker.indexOf("function suggestPrimaryLocationFromIdea", start);
  const fn = worker.slice(start, end);
  assert.match(fn, /Production_Target_Platforms/);
  assert.match(fn, /if \(productionPlatforms\.length\) return productionPlatforms/);
  assert.match(fn, /Suggested_Platforms/);
});
