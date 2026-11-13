import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Factory approve and schedule regen skip the in-lock mirror and keep one afterCommit owner", async () => {
  const functions04 = await readFile(path.join(here, "worker-functions-04.mjs"), "utf8");
  const worker = readStudioWorkerSource();

  assert.match(worker, /skipSupabaseWriteThrough !== true/);
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);

  const approveStart = functions04.indexOf("export async function approveOutputRecordForPublishing");
  const approveEnd = functions04.indexOf("/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/", approveStart);
  const approve = functions04.slice(approveStart, approveEnd);
  assert.match(approve, /skipSupabaseWriteThrough: true/);
  assert.match(approve, /studioSupabaseWriteThroughOutput\(env, updated, "approve"\)/);
  const write = await readFile(path.join(here, "worker-functions-01.mjs"), "utf8");
  assert.match(write, /outputRecordHasDensifiedIdentity\(record\)/);
  const reads = await readFile(path.join(here, "supabase-pipeline-reads.mjs"), "utf8");
  assert.match(reads, /export function outputRecordHasDensifiedIdentity/);
  assert.match(reads, /options\.fullRecord === true && outputRecordHasDensifiedIdentity\(record\)/);

  assert.match(functions04, /skipSupabaseWriteThrough: true/);
  assert.match(functions04, /"schedule-regen"/);
  assert.match(functions04, /studioSupabaseWriteThroughOutput\(env, updated, "schedule"\)/);
  assert.match(functions04, /"schedule-vacate"/);
  assert.equal((functions04.match(/skipSupabaseWriteThrough: true/g) || []).length >= 4, true);
});

test("heavy Supabase sync and write-through respect the pool circuit", async () => {
  const sync = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  const write = await readFile(path.join(here, "worker-functions-01.mjs"), "utf8");
  const reads = await readFile(path.join(here, "supabase-pipeline-reads.mjs"), "utf8");
  assert.match(sync, /if \(supabaseCircuitOpen\(\)\) return \{ skipped: true, reason: "supabase_circuit_open" \}/);
  assert.match(write, /if \(supabaseCircuitOpen\(\)\) return \{ skipped: true, reason: "supabase_circuit_open" \}/);
  assert.match(reads, /PGRST003\|57014/);
  assert.match(reads, /assertSupabaseCircuitAllowsTraffic/);
});

test("production_request_outputs platform_output index SQL exists", async () => {
  const sql = await readFile(
    path.join(here, "../../docs/supabase-migration/phase1/002_production_request_output_fk_index.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS production_request_outputs_platform_output_idx/);
  assert.match(sql, /platform_outputs_pipeline_open_idx/);
});
