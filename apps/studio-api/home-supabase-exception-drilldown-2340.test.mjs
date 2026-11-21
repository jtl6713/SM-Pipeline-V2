import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabaseFocusedExceptionFilter } from "./supabase-pipeline-reads.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker-functions-03.mjs"), "utf8");
const source = fs.readFileSync(path.join(here, "supabase-pipeline-reads.mjs"), "utf8");

test("Home Past Due candidate scan is Supabase-only and time-scoped", () => {
  const filter = supabaseFocusedExceptionFilter("approved_past_due", "2026-11-21T01:25:00.000Z");
  assert.match(filter, /review_status=eq.Approved/);
  assert.match(filter, /do_not_publish=eq.false/);
  assert.match(filter, /scheduled_post_date=lte.2026-11-21T01%3A25%3A00.000Z/);
  assert.doesNotMatch(filter, /publish_status=eq.Ready|publish_retry_eligible|auto_publish_enabled/);
  assert.throws(() => supabaseFocusedExceptionFilter("approved_past_due", "unknown"), /clock/);
});

test("Home Missing Date and combined exceptions preserve their distinct scopes", () => {
  assert.match(supabaseFocusedExceptionFilter("approved_missing_date", "2026-11-21T01:25:00Z"), /scheduled_post_date=is.null/);
  assert.match(supabaseFocusedExceptionFilter("approved_exceptions", "2026-11-21T01:25:00Z"), /or=\(scheduled_post_date.is.null,scheduled_post_date.lte./);
});

test("Failed drill-down includes output, render, publish and derived stage failures", () => {
  const filter = supabaseFocusedExceptionFilter("failed");
  for (const clause of ["output_status.eq.Failed", "render_status.eq.Failed",
    "publish_status.eq.Failed", "error_messages->>Studio_State.eq.Failed"]) assert.ok(filter.includes(clause));
  assert.doesNotMatch(filter, /auto_publish_enabled|publish_retry_eligible|Publish_Next_Retry_At/);
  assert.throws(() => supabaseFocusedExceptionFilter("unscoped"), /Unknown/);
});

test("Complete-scanned exception candidates fail closed on incomplete pages", () => {
  const fn = source.slice(source.indexOf("export async function listSupabaseFocusedExceptionOutputs("),
    source.indexOf("Profile-scoped Manual Action candidates"));
  assert.match(fn, /resolveSupabaseProfileId/);
  assert.match(fn, /const maxCandidates = 5000/);
  assert.match(fn, /if \(!complete\) throw new Error/);
  assert.match(fn, /duplicated identity/);
  assert.doesNotMatch(fn, /airtableFetch|listRecords\(|fetch\(|method:\s*"POST"|method:\s*"PATCH"/);
});

test("P1 Pipeline drill-down applies Home classifiers after a Supabase scan, without Airtable fallback", () => {
  const start = worker.indexOf("if (!manualFocused) {", worker.indexOf("const focusedMode = String(url.searchParams.get"));
  const end = worker.indexOf("const profileFormula = contentProfileFilterFormula(profile);", start);
  assert.ok(start > 0 && end > start, "focused Supabase route must precede historic Airtable code");
  const branch = worker.slice(start, end);
  assert.match(branch, /studioPipelineReadSource\(env\) !== "supabase"/);
  assert.match(branch, /listSupabaseFocusedExceptionOutputs/);
  assert.match(branch, /homeApprovedExceptionKind\(output, observedAt\)/);
  assert.match(branch, /homeIsUnpublishedFailure\(output\)/);
  assert.match(branch, /read_source: "supabase"/);
  assert.match(branch, /complete: true/);
  assert.doesNotMatch(branch, /listRecords\(|airtableFetch|studioDispatchApprovedPublishNow|studioPulse|method:\s*["'](?:PATCH|POST)/);
});
