import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Idea Batches stay on Airtable under Supabase write source", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const ideas = await readFile(path.join(here, "worker-functions-04.mjs"), "utf8");
  assert.match(worker, /function studioAirtableArchiveStaysLive\(tableId\)/);
  assert.match(worker, /tblpCKSqcTpDtyst3/);
  assert.match(worker, /method === "GET"\s*&& !studioAirtableArchiveStaysLive\(tableId\)/);
  assert.match(worker, /method !== "GET"\s*&& studioWriteSource\(env\) === "supabase"\s*&& !studioAirtableArchiveStaysLive\(tableId\)/);
  assert.match(worker, /0\.10\.975-idea-batch-live/);
  assert.match(ideas, /async function studioMirrorGeneratedIdeas/);
  assert.match(ideas, /await studioMirrorGeneratedIdeas\(env, linkedRecordIds\(f\(record, "Idea Candidates"\)\)\)/);
});
