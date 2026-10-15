import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Pipeline open-pack uses the stored Studio_Pipeline_Open index", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /studio_pipeline_open_index_v1: true/);
  assert.match(worker, /const STUDIO_PIPELINE_OPEN_FIELD_FORMULA = "\{Studio_Pipeline_Open\}=1"/);
  assert.match(worker, /legacy \? STUDIO_PIPELINE_OPEN_LEGACY_FORMULA : STUDIO_PIPELINE_OPEN_FIELD_FORMULA/);
  assert.match(worker, /allowRefresh: url.searchParams.get\("refresh"\) !== "0"/);
  assert.match(worker, /if \(allowRefresh && !fresh\) scheduleMappedListRefresh/);
  assert.match(worker, /version: "0.10.609-supabase-phase3-stable"/);
});

test("Home polls the snapshot without triggering an Airtable rebuild", async () => {
  const app = await readFile(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  assert.match(app, /BUILD_ID = "item4-0.6.687-platforms-frames-details"/);
  assert.match(app, /const DASHBOARD_POLL_MS = 60000/);
  assert.match(app, /loadDashboard\(true, \{ snapshotOnly: true \}\)/);
  assert.match(app, /api\(`\/api\/outputs\?limit=250\$\{snapshotOnly \? "&refresh=0" : ""\}/);
  assert.match(app, /async function loadDashboard\(force = false, \{ snapshotOnly = false \} = \{\}\)/);
});
