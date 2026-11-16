import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const reads = readFileSync(join(here, "supabase-pipeline-reads.mjs"), "utf8");
const wf02 = readFileSync(join(here, "worker-functions-02.mjs"), "utf8");
const wf03 = readFileSync(join(here, "worker-functions-03.mjs"), "utf8");
const worker = readStudioWorkerSource();

test("Phase 6 SoR exposes open Production Requests by idea_candidate_id", () => {
  assert.match(reads, /export async function listSupabaseOpenProductionRequestsForIdea/);
  assert.match(reads, /idea_candidate_id=eq\.\$\{encodeURIComponent\(ideaUuid\)\}/);
  assert.match(reads, /request_status=in\.\(Draft,Ready,Submitted\)/);
  assert.match(reads, /export async function listSupabaseIdeaIdsWithOpenProductionRequests/);
  assert.match(reads, /export async function appendIdeaProductionRequestLink/);
});

test("Production Request create densifies the Idea Production Requests link bag", () => {
  assert.match(reads, /appendIdeaProductionRequestLink\(env, ideaAirtableId, record\.id\)/);
  assert.match(reads, /Airtable no longer writes the reciprocal Idea link under Phase 6 SoR/);
});

test("Idea single-record reads densify hollow Production Requests from the FK", () => {
  const start = reads.indexOf("async function readIdeaRow(env, id)");
  const end = reads.indexOf("async function readRequestRow(env, id)", start);
  const block = reads.slice(start, end);
  assert.match(block, /listSupabaseOpenProductionRequestsForIdea\(env, shaped\.id\)/);
  assert.match(block, /shaped\.fields\["Production Requests"\] = open\.map/);
});

test("photo_unconfigured lane excludes ideas that already have open PRs via FK", () => {
  const start = reads.indexOf("export async function listSupabaseIdeaLane");
  const end = reads.indexOf("export async function listSupabaseMusicRecords", start);
  const block = reads.slice(start, end);
  assert.match(block, /listSupabaseIdeaIdsWithOpenProductionRequests/);
  assert.match(block, /openIdeaIds\.has\(row\.id\)/);
});

test("existingDraftForIdea and findDraft fall back to the FK before minting", () => {
  assert.match(wf02, /listSupabaseOpenProductionRequestsForIdea\(env, ideaRecordId\)/);
  assert.match(wf03, /listSupabaseOpenProductionRequestsForIdea\(env, ideaRecordId\)/);
  const existing = wf02.slice(
    wf02.indexOf("export async function existingDraftForIdea"),
    wf02.indexOf("/*__STUDIO_WORKER_END:existingDraftForIdea__*/"),
  );
  const find = wf03.slice(
    wf03.indexOf("export async function findDraftProductionRequestForIdea"),
    wf03.indexOf("/*__STUDIO_WORKER_END:findDraftProductionRequestForIdea__*/"),
  );
  assert.match(existing, /Phase 6 SoR/);
  assert.match(find, /Phase 6 SoR/);
  assert.ok(existing.indexOf("listSupabaseOpenProductionRequestsForIdea")
    < existing.indexOf("if (!linkedIds.length) return null"));
  assert.ok(find.indexOf("listSupabaseOpenProductionRequestsForIdea")
    < find.indexOf("if (!ids.length) return null"));
});

test("Worker version bumps for Phase 6 duplicate-draft fix", () => {
  assert.match(worker, /0\.10\.992-queue-payload-merge/);
});
