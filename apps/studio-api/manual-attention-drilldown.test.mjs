import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { airtableShapedOutputFromSupabase } from "./supabase-pipeline-reads.mjs";
import { normalizedOutputState } from "./worker-functions-01.mjs";
import { homeOutputContribution } from "./profile-summary-classification.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(dir, "worker-functions-03.mjs"), "utf8");
const reads = fs.readFileSync(path.join(dir, "supabase-pipeline-reads.mjs"), "utf8");
const app = fs.readFileSync(path.join(dir, "../studio-web/assets/app-item4-1008.js"), "utf8");
const overview = fs.readFileSync(path.join(dir, "../studio-web/assets/all-profiles-overview-1007.js"), "utf8");

function shaped(partial) {
  return airtableShapedOutputFromSupabase({
    airtable_record_id: partial.id || "recManualDrill0001",
    output_number: partial.output_number || 4988,
    platform: partial.platform || "TikTok",
    output_status: partial.output_status ?? null,
    publish_status: partial.publish_status || "Ready to Publish",
    tiktok_draft_status: partial.tiktok_draft_status || "Ready for Delivery",
    render_status: "Rendered",
    review_status: partial.review_status || null,
    do_not_publish: false,
    test_run_id: null,
    platform_post_url: partial.platform_post_url || null,
    published_at: null,
    error_messages: partial.error_messages || {},
  });
}

test("Music_Status Manual Action Required still counts on Home", () => {
  const record = shaped({
    error_messages: { Music_Status: "Manual Action Required" },
  });
  const studio_state = normalizedOutputState(record);
  assert.equal(studio_state, "Manual Action Required");
  assert.equal(homeOutputContribution({
    studio_state,
    platform: "TikTok",
    publish_status: "Ready to Publish",
  }).manual_action_required, 1);
});

test("Instagram Manual_Fallback Failed paints Manual Action Required", () => {
  const record = shaped({
    id: "recIgFallback00001",
    output_number: 4692,
    platform: "Instagram",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    tiktok_draft_status: null,
    review_status: "Approved",
    error_messages: {
      Manual_Fallback_Required: true,
      Publish_Error_Message: "Instagram Reel result ambiguous",
    },
  });
  assert.equal(normalizedOutputState(record), "Manual Action Required");
});

test("Worker exposes supabase manual rescue and focused modes", () => {
  assert.match(reads, /export async function listSupabaseManualActionOutputs/);
  assert.match(reads, /output_status\.is\.null,and\(output_status\.neq\.Published/);
  assert.match(worker, /listSupabaseManualActionOutputs/);
  assert.match(worker, /studioPipelineReadSource\(env\) === "supabase"/);
  const start = worker.indexOf('const focusedMode = String(url.searchParams.get("mode")');
  const end = worker.indexOf("  // QA-PIPELINE-NEWEST-MISSING", start);
  assert.ok(start >= 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /"manual", "attention"/);
  assert.match(route, /listSupabaseManualActionOutputs/);
  assert.match(route, /studio_state \|\| ""\) === "Manual Action Required"/);
});

test("Pipeline Manual and attention use focused /api/outputs?mode= fetch", () => {
  assert.match(app, /\["approved_past_due", "approved_missing_date", "failed", "manual", "attention"\]/);
  assert.match(overview, /kind === "approval" \? "approval" : kind === "failed" \? "failed" : "attention"/);
});
