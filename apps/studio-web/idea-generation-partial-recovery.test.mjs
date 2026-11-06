import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const list = readFileSync(new URL("../studio-api/worker-functions-01.mjs", import.meta.url), "utf8");
const runner = readFileSync(new URL("../../services/pipeline-runner/i1/durable_jobs.py", import.meta.url), "utf8");

function functionBody(name, next) {
  const start = ui.indexOf("async function " + name + "(");
  assert.ok(start >= 0, name + " missing");
  const end = next ? ui.indexOf(next, start + 1) : start + 10000;
  assert.ok(end > start, next + " missing");
  return ui.slice(start, end);
}

test("failed partial NYC I1 batch automatically loads saved candidates from authoritative Airtable", () => {
  const body = functionBody("pollIdeaGenerationBatch", '  $("ideasRunAutonomous")');
  assert.match(body, /batch\.status === "Failed"/);
  assert.match(body, /generated > 0 && generated < requested/);
  assert.match(body, /await Promise\.allSettled\(\[loadIdeas\(\), loadDashboard\(true\)\]\)/);
  assert.match(body, /Review them before requesting another batch/);
  assert.match(body, /View \$\{generated\} saved ideas/);
  assert.match(body, /ideaGenerateMore"\)\) \$\("ideaGenerateMore"\)\.hidden = partial/);
  assert.doesNotMatch(body, /textContent = "Retry"/);
  assert.match(list, /forceFresh: url\.searchParams\.get\("fresh"\) === "1"/);
  assert.match(ui, /\/api\/ideas\?limit=100&fresh=1/);
});

test("an ambiguous generation POST is never repeated automatically", () => {
  const start = ui.indexOf('  $("ideaGenerateForm")?.addEventListener("submit"');
  const end = ui.indexOf("  function setIdeaFormOpen(", start);
  assert.ok(start >= 0 && end > start);
  const body = ui.slice(start, end);
  assert.match(body, /api\("\/api\/ideas\/generate"/);
  assert.match(body, /retries: 0/);
  assert.match(body, /Check Current ideas before starting a new batch/);
  assert.doesNotMatch(body, /textContent = "Retry"/);
});

test("durable Runner uses bounded readback-controlled missing-count refill", () => {
  assert.match(runner, /_MAX_CONFIRMED_SHORTFALL_PASSES = 5/);
  assert.match(runner, /for _ in range\(_MAX_CONFIRMED_SHORTFALL_PASSES\)/);
  assert.match(runner, /missing = max\(0, expected - existing\)/);
  assert.match(runner, /requested_count=missing/);
  assert.match(runner, /if result\.get\("partial_failure"\) or result\.get\("retry_requires_reconciliation"\)/);
  assert.match(runner, /if actual < existing:/);
  assert.match(runner, /if actual == existing:/);
  assert.match(runner, /if result\.get\("created_count"\) or result\.get\("created_record_ids"\):/);
  assert.match(runner, /_MAX_ZERO_WRITE_PASSES = 3/);
  assert.match(runner, /excluded_titles=tuple\(rejected_titles\[-24:\]\)/);
  assert.match(runner, /zero_write_passes >= _MAX_ZERO_WRITE_PASSES/);
});
