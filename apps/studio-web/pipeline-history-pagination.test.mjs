import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../studio-api/worker-functions-03.mjs", import.meta.url), "utf8");
const reads = readFileSync(new URL("../studio-api/supabase-pipeline-reads.mjs", import.meta.url), "utf8");

test("Pipeline requests exactly one content page from Supabase", () => {
  const start = ui.indexOf("async function refreshPipelineOutputs(");
  const end = ui.indexOf("async function loadOutputs()", start);
  const body = ui.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /pipelineContentPageApiPath\(\)/);
  assert.doesNotMatch(body, /mode=history&offset=|\/api\/outputs\?limit=250/);
  assert.match(ui, /per_page: String\(pipelineContentPageSize\)/);
  assert.match(ui, /pipelineContentHasMore = Boolean\(outputsResult.has_more\)/);
});

test("History endpoint is Supabase-only and provides an explicit next offset", () => {
  const start = api.indexOf('if (focusedMode === "history")');
  const end = api.indexOf('if (["approved_exceptions"', start);
  const body = api.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /studioPipelineReadSource\(env\) !== "supabase"/);
  assert.match(body, /listSupabasePipelineHistoryPage/);
  assert.match(body, /has_more: packed\.has_more, next_offset: packed\.next_offset/);
});

test("Supabase history is profile scoped, excludes test runs and uses stable server ordering", () => {
  const start = reads.indexOf("export async function listSupabasePipelineHistoryPage(");
  const end = reads.indexOf("export async function listSupabasePipelineOutputs(", start);
  const body = reads.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /content_profile_id=eq/);
  assert.match(body, /test_run_id=is\.null/);
  assert.match(body, /production_approved_at\.desc\.nullslast,created_at\.desc\.nullslast,output_number\.desc\.nullslast,id\.desc/);
  assert.match(body, /next_offset:/);
  assert.doesNotMatch(body, /scheduled_post_date/);
});

test("Production approval comes from request Submitted_At, never Factory approval", () => {
  const start = reads.indexOf("export async function listSupabasePipelineHistoryPage(");
  const end = reads.indexOf("export async function listSupabasePipelineOutputs(", start);
  const body = reads.slice(start, end);
  assert.match(body, /production_approved_at\.desc\.nullslast/);
  assert.match(body, /OUTPUT_SELECT \+ ",production_approved_at"/);
  assert.doesNotMatch(body, /Review_Decision_At/);
  assert.match(api, /production_approved_at: f\(record, "Production_Approved_At"\)/);
  assert.match(ui, /Production approved/);
  assert.match(ui, /contentNumber\(b\) - contentNumber\(a\)/);
});
