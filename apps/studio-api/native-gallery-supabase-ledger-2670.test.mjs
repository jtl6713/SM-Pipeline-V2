import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
const runnerRead = readFileSync(new URL("../../services/pipeline-runner/supabase_reads.py", import.meta.url), "utf8");

test("Worker and Runner agree on Supabase C5/C6 job ledger identity", () => {
  assert.match(source, /tbl5sq9xBrF6bgPph/);
  assert.match(source, /native_gallery_jobs\?on_conflict=airtable_record_id/);
  assert.match(runnerRead, /tbl5sq9xBrF6bgPph.*native_gallery_jobs/);
});

test("native gallery Worker ledger requires exact filters and patch existence", () => {
  assert.match(source, /NATIVE_GALLERY_ALLOWED_FILTERS/);
  assert.match(source, /native_gallery_filter_not_allowlisted/);
  assert.match(source, /native_gallery_patch_requires_existing_row/);
  assert.match(source, /native_gallery_supabase_commit_unconfirmed/);
  assert.match(source, /resolution=merge-duplicates,return=representation/);
});

test("native gallery creative job ledger has independent RLS migration", () => {
  const sql = readFileSync(new URL("./migrations/20261123_native_gallery_job_ledger_2670.sql", import.meta.url), "utf8");
  assert.match(sql, /ALTER TABLE public.native_gallery_jobs ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON public.native_gallery_jobs FROM public, anon, authenticated/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS native_gallery_job_id_exact_uq/i);
});
