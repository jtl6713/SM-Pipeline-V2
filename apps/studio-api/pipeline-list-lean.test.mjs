import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Pipeline /api/outputs list stays lean and non-blocking", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-0625.js"), "utf8");
  const listFieldsMatch = worker.match(/const OUTPUT_LIST_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(listFieldsMatch, "OUTPUT_LIST_FIELDS present");
  const listFields = listFieldsMatch[1];
  assert.doesNotMatch(listFields, /"Selected_Assets_JSON"/);
  assert.doesNotMatch(listFields, /"Creative_Render_Manifest_JSON"/);
  assert.match(worker, /Return the Pipeline table immediately/);
  assert.match(worker, /version: "0.10.466-mae-28-day-schedule"/);
  assert.match(app, /BUILD_ID = "item4-0.6.519-mae-28-day-schedule"/);
  assert.match(app, /API_TRANSIENT_RETRY_MAX = 3/);
  assert.match(app, /api\("\/api\/health", \{ timeoutMs: 8000, retries: 1 \}/);
  assert.match(app, /api\("\/api\/outputs\?limit=250", \{ timeoutMs: 20000, retries: 2 \}/);
});
