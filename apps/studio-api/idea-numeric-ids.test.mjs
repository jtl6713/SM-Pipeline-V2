import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../../docs/supabase-migration/phase7/010_idea_candidate_numeric_ids.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
const ui = readFileSync(new URL("../studio-web/assets/story-first-workspace.js", import.meta.url), "utf8");

test("numeric Idea allocation is unique, preserves prior IDs and backfills in creation order", () => {
  assert.match(sql, /LOCK TABLE public\.idea_candidates/);
  assert.match(sql, /CREATE SEQUENCE IF NOT EXISTS public\.studio_idea_candidate_number_seq/);
  assert.match(sql, /MAX\(\(payload->>'Candidate_ID'\)::bigint\)/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF payload/);
  assert.match(sql, /preserved := OLD\.payload->>'Candidate_ID'/);
  assert.match(sql, /ORDER BY created_at, id/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idea_candidates_candidate_id_number_unique/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.studio_assign_idea_candidate_number\(\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /(?<!\w)DELETE\s+FROM|TRUNCATE\s+TABLE/i);
});

test("the Idea picker shows canonical numeric ID and keeps opaque record id as value", () => {
  assert.match(ui, /row\.candidate_id \|\| row\.id/);
  assert.match(ui, /new Option\(row\.title \+ " · Idea "/);
  assert.match(worker, /async function commitIdeaRecords/);
  assert.match(worker, /canonicalNumber = readback\?\.\[0\]\?\.payload\?\.Candidate_ID/);
});
