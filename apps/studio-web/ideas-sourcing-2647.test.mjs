import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("./index.html");
const app = read("./assets/app-item4-1008.js");
const api = read("../studio-api/worker-functions-04.mjs");
const maps = read("../studio-api/worker-functions-01.mjs");
const runner = read("../../services/pipeline-runner/i1/durable_jobs.py");

test("#2647 manual sourcing has exactly three distinct choices with Balanced default", () => {
  const form = html.slice(html.indexOf('<form id="ideaGenerateForm"'),
    html.indexOf("</form>", html.indexOf('<form id="ideaGenerateForm"')));
  assert.match(form, /id="ideaGenerateCount"/);
  assert.match(form, /id="ideaGenerateQuality"/);
  assert.match(form, /id="ideaGenerateSourcing"/);
  assert.match(form, /value="balanced" selected>Balanced mix/);
  assert.match(form, /value="existing">Use existing assets first/);
  assert.match(form, /value="explore">Explore new topics/);
  assert.equal((html.match(/id="ideaGenerateSourcing"/g) || []).length, 1);
});

test("#2647 sourcing mode is independent from quality and uses no retry on uncertain POST", () => {
  const from = app.indexOf('$("ideaGenerateForm")?.addEventListener("submit"');
  const submit = app.slice(from, from + 2300);
  assert.ok(from >= 0);
  assert.match(submit, /String\(\$\("ideaGenerateQuality"\)\?\.value/);
  assert.match(submit, /String\(\$\("ideaGenerateSourcing"\)\?\.value \|\| "balanced"\)/);
  assert.match(submit, /asset_sourcing_mode: sourcingMode/);
  assert.match(submit, /retries: 0/);
});

test("#2647 Worker validates and records sourcing mode on canonical batch and durable admission", () => {
  const create = api.slice(api.indexOf("export async function studioIdeaCreateBatch("),
    api.indexOf("export async function studioIdeaUpdateBatch("));
  const handler = api.slice(api.indexOf("export async function startStudioIdeaGeneration("),
    api.indexOf("export async function studioIdeaGenerationStatus("));
  assert.match(create, /Asset_Sourcing_Mode: sourcingMode/);
  assert.match(handler, /\["existing", "balanced", "explore"\]/);
  assert.match(handler, /studioIdeaCreateBatch\(env, profile, count, quality, authorization, sourcingMode\)/);
  assert.match(handler, /asset_sourcing_mode: sourcingMode/);
  assert.match(handler, /studioIdeaRunPythonBatch\(env, authorization, profile, batch, count, quality, sourcingMode\)/);
  assert.match(runner, /asset_sourcing_mode TEXT NOT NULL DEFAULT 'balanced'/);
  assert.match(runner, /row\["asset_sourcing_mode"\]/);
});

test("#2647 new-media ideas display a user action, not a false ready-to-render claim", () => {
  const row = app.slice(app.indexOf("function ideaRowHtml("),
    app.indexOf("function upsertIdeaInCache("));
  assert.match(row, /Asset plan:/);
  assert.match(row, /Required_Asset_Checklist|required_asset_checklist/);
  assert.match(row, /Add media \/ pre-production/);
  assert.match(row, /data-idea-timeline/);
  const map = maps.slice(maps.indexOf("export function mapIdea("),
    maps.indexOf("/*__STUDIO_WORKER_END:mapIdea__*/"));
  assert.match(map, /asset_sourcing_mode:/);
  assert.match(map, /asset_readiness:/);
  assert.match(map, /required_asset_checklist:/);
  assert.match(map, /suggested_library_asset_ids:/);
});
