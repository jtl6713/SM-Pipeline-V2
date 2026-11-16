import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Idea Batches commit to Supabase and do not reopen Airtable", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const reads = await readFile(path.join(here, "supabase-pipeline-reads.mjs"), "utf8");
  assert.doesNotMatch(worker, /studioAirtableArchiveStaysLive/);
  assert.doesNotMatch(worker, /airtableLiveRecord/);
  assert.match(worker, /0\.10\.981-tribeca-photos/);
  assert.match(reads, /table === "tblpCKSqcTpDtyst3" \|\| table === "Idea Batches"\) return "idea_batch"/);
  assert.match(reads, /commitIdeaBatchRecords/);
  assert.match(reads, /listOpenSupabaseIdeaBatches/);
});
