import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Home, Pipeline, and Ideas list reads never block on a live Airtable scan", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

  assert.match(worker, /studio_list_read_snapshot_v2: true/);
  assert.match(worker, /function respondStudioMappedList/);
  assert.match(worker, /async function warmOldestStudioReadSnapshot/);
  assert.match(worker, /studio\/state\/ideas-list-/);
  assert.match(worker, /Never wait on a live/);
  assert.match(worker, /studioMarkMappedListDirty/);
  assert.doesNotMatch(worker, /raceStudioOverviewBudget\(pending, 12000, "pipeline-list"\)/);

  const scheduled = worker.slice(
    worker.indexOf("async scheduled(event, env, ctx)"),
    worker.indexOf("class HttpError"),
  );
  const heavyGate = scheduled.indexOf("if (!cadence.heavy) return;");
  assert.ok(heavyGate > 0);
  assert.doesNotMatch(scheduled.slice(0, heavyGate), /warmOldestStudioReadSnapshot/);
  assert.match(scheduled.slice(heavyGate), /await warmOldestStudioReadSnapshot\(env\)/);

  const listIdeas = worker.slice(
    worker.indexOf("async function listIdeas"),
    worker.indexOf("function airtableFormulaEscape"),
  );
  assert.match(listIdeas, /respondStudioMappedList/);
  assert.doesNotMatch(listIdeas, /await listRecords\(env, env\.AIRTABLE_IDEA_TABLE_ID/);

  const listOutputs = worker.slice(
    worker.indexOf("async function listOutputs"),
    worker.indexOf("async function listMusic"),
  );
  assert.match(listOutputs, /respondStudioMappedList/);
  assert.doesNotMatch(listOutputs, /raceStudioOverviewBudget/);

  assert.match(app, /BUILD_ID = "item4-0.6.672-content-id-data"/);
  assert.match(app, /api\("\/api\/outputs\?limit=250", \{ timeoutMs: 8000, retries: 1 \}/);
  assert.match(app, /api\("\/api\/ideas\?limit=100", \{ timeoutMs: 8000, retries: 1 \}/);
  assert.match(app, /outputsSettled\.value\?\.refreshing && !outputs\.length/);
});
