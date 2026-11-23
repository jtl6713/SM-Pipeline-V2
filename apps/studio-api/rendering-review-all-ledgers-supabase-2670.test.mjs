import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RENDER_REVIEW_TABLES} from "./rendering-review-airtable.mjs";

const worker = readFileSync(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
const read = readFileSync(new URL("../../services/pipeline-runner/supabase_reads.py",import.meta.url),"utf8");
const sql = readFileSync(new URL("./migrations/20261123_rendering_review_auxiliary_ledgers_2670.sql",import.meta.url),"utf8");
const tables = ["sessions","messages","plans","attempts","requirements","jobs"];

test("all six canonical Rendering Review identities are mapped for Worker and Runner",()=>{
  for(const kind of tables){
    const id=RENDER_REVIEW_TABLES[kind];
    assert.match(id,/^tbl[A-Za-z0-9]+$/);
    assert.ok(worker.includes(id), "Worker missing "+kind);
    assert.ok(read.includes(id), "Runner missing "+kind);
  }
});
test("Worker refuses unknown reviews, invented PATCHes and missing CAS version",()=>{
  assert.match(worker,/rendering_review_filter_not_allowlisted/);
  assert.match(worker,/rendering_review_patch_requires_existing_row/);
  assert.match(worker,/rendering_review_row_version_advance_required/);
  assert.match(worker,/rendering_review_supabase_commit_unconfirmed/);
});
test("auxiliary tables have RLS and service-role-only permissions",()=>{
  for(const table of ["messages","requirements"]){
    assert.ok(sql.includes("ALTER TABLE public.rendering_review_"+table+" ENABLE ROW LEVEL SECURITY"));
    assert.ok(sql.includes("REVOKE ALL ON public.rendering_review_"+table+" FROM PUBLIC, anon, authenticated"));
  }
});
