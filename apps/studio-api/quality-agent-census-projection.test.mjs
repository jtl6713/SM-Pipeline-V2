import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QA_CENSUS_OUTPUT_SELECT } from "./supabase-pipeline-reads.mjs";

test("Quality Agent Supabase census keeps all status, timing, profile and publication evidence", () => {
  const fields=QA_CENSUS_OUTPUT_SELECT.split(",");
  for(const name of ["airtable_record_id","output_number","content_item_id","content_profile_id",
    "platform","platform_output_type","output_status","render_status","review_status",
    "publish_status","do_not_publish","test_run_id","scheduled_post_date",
    "published_at","platform_post_url","publish_next_retry_at",
    "ig_carousel_status","tiktok_draft_status","fb_publish_status",
    "error_messages","content_items(airtable_record_id","content_profiles(airtable_record_id)"]) {
    assert.ok(QA_CENSUS_OUTPUT_SELECT.includes(name),name);
  }
  for(const name of ["output_caption","output_hashtags","thumbnail_url","studio_preview_url",
    "remotion_job_id","selected_clip_count"]) assert.ok(!fields.includes(name),name);
});
test("Full-list and all-profile APIs retain their existing projections", async () => {
  const source=await readFile(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
  assert.match(source,/const OUTPUT_SELECT = \[/);
  assert.match(source,/const OVERVIEW_OUTPUT_SELECT = \[/);
  assert.match(source,/const orderLimit = `select=\$\{QA_CENSUS_OUTPUT_SELECT\}/);
  assert.match(source,/if \(failure\) records = records\.filter/);
});

test("the Quality Agent census has a unique stable order across null output numbers", async () => {
  const source = await readFile(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  assert.match(source, /order=output_number\.asc\.nullslast,airtable_record_id\.asc&limit=\$\{capped\}&offset=\$\{start\}/);
  assert.match(source, /if \(failure\) records = records\.filter/);
  assert.match(source, /batch\.length === capped && next < 12000/);
});
