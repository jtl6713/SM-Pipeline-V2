import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { supabaseOutputMatchesHomeFailure } from "./supabase-pipeline-reads.mjs";

const sql = readFileSync(new URL("./migrations/20261123_platform_output_home_failure_candidate_2670.sql", import.meta.url), "utf8");
const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");

const typed = ["Output_Status", "Render_Status", "Publish_Status",
  "IG_Carousel_Status", "TikTok_Draft_Status", "FB_Publish_Status"];
const bagStatuses = ["Asset_Selection_Status", "IG_Carousel_Status",
  "FB_Slideshow_Status", "YouTube_Package_Status",
  "YouTube_Upload_Status", "YouTube_Processing_Status"];
const errors = ["Publish_Error_Message", "Remotion_Error_Message",
  "Final_File_Error_Message", "IG_Carousel_Error_Message",
  "Music_Error_Message", "FB_Slideshow_Error_Message",
  "YouTube_Error_Message", "YouTube_Processing_Failure_Reason",
  "YouTube_Rejection_Reason"];
const snake = name => name.replace(/[A-Z]/g, (c, i) => (i ? "_" : "") + c).toLowerCase();

test("all six typed failure statuses share exact SQL+JS predicate", () => {
  for(const name of typed){
    assert.equal(supabaseOutputMatchesHomeFailure({[name]:"Retry error"}), true, name);
    assert.equal(supabaseOutputMatchesHomeFailure({[name]:"FAILED"}), true, name);
    assert.ok(sql.includes(snake(name)), name);
  }
});
test("all six densified JSONB statuses share exact SQL+JS predicate", () => {
  for(const name of bagStatuses){
    assert.equal(supabaseOutputMatchesHomeFailure({[name]:"failed"}), true, name);
    assert.equal(supabaseOutputMatchesHomeFailure({[name]:"error"}), true, name);
    assert.ok(sql.includes("error_messages->>'"+name+"'"), name);
  }
});
test("all nine nonblank error fields are included and whitespace excluded", () => {
  for(const name of errors){
    assert.equal(supabaseOutputMatchesHomeFailure({[name]:"Invalid media"}), true, name);
    assert.equal(supabaseOutputMatchesHomeFailure({[name]:"   "}), false, name);
    assert.ok(sql.includes("nullif(btrim(coalesce(error_messages->>'"+name+"'"), name);
  }
});
test("indexed canonical failure candidate replaces pathological 30-field OR", () => {
  assert.match(sql,/home_failure_candidate boolean\s+GENERATED ALWAYS AS/);
  assert.match(sql,/WHERE home_failure_candidate = TRUE AND test_run_id IS NULL/);
  assert.match(source,/platform_outputs\?test_run_id=is.null&home_failure_candidate=eq.true/);
  assert.doesNotMatch(source,/path = `platform_outputs\?test_run_id=is.null&\$\{homeFailureCensusOrFilter\(\)\}/);
});
test("no publish/hold fields, broad-table cache or Airtable fallback", () => {
  assert.doesNotMatch(sql,/UPDATE\s+public\.platform_outputs/i);
  assert.doesNotMatch(sql,/DO_NOT_PUBLISH\s*=/i);
  assert.doesNotMatch(sql,/AUTO_PUBLISH_ENABLED\s*=/i);
  assert.equal(supabaseOutputMatchesHomeFailure({Output_Status:"Rendered",Publish_Status:"Ready to Publish"}), false);
});
