import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reads = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
const worker = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");

test("Pipeline newest fetch includes newly created outputs without assigned output numbers", () => {
  const start = reads.indexOf("export async function listSupabasePipelineOutputs(");
  const end = reads.indexOf("export function pipelineTitleSearchTokens(", start);
  assert.ok(start >= 0 && end > start);
  const source = reads.slice(start, end);
  assert.match(source, /order=created_at\.desc\.nullslast/);
  assert.match(source, /Date\.parse\(b\.created_at/);
  assert.match(source, /contentByAirtableId/);
});

test("Pipeline output projection retains createdTime for client newest-first ordering", () => {
  const start = worker.indexOf("function mapOutput(");
  const end = worker.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start);
  assert.match(worker.slice(start, end), /created_at: record\.createdTime/);
});
