import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { airtableShapedOutputFromSupabase } from "./supabase-pipeline-reads.mjs";
import { mapOutput } from "./worker-functions-01.mjs";
import { tiktokCompleteEligibility, tiktokNeedsUrlEntry } from "./tiktok-complete.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker03 = fs.readFileSync(path.join(dir, "worker-functions-03.mjs"), "utf8");
const worker04 = fs.readFileSync(path.join(dir, "worker-functions-04.mjs"), "utf8");
const app = fs.readFileSync(path.join(dir, "../studio-web/assets/app-item4-1008.js"), "utf8");

function nycSohoManual() {
  return mapOutput(airtableShapedOutputFromSupabase({
    airtable_record_id: "recrTrx0gg9rmpOx3",
    output_number: 5031,
    platform: "TikTok",
    output_status: null,
    publish_status: "Ready to Publish",
    tiktok_draft_status: "Ready for Delivery",
    render_status: "Rendered",
    do_not_publish: false,
    final_file_url: "https://drive.google.com/file/d/example",
    error_messages: {
      Music_Status: "Manual Action Required",
      Music_Handling_Mode: "Manual in Platform App",
    },
  }));
}

test("Music_Status Manual Action Required opens TikTok URL entry", () => {
  const mapped = nycSohoManual();
  assert.equal(mapped.studio_state, "Manual Action Required");
  assert.equal(tiktokCompleteEligibility(mapped), null);
  assert.equal(tiktokNeedsUrlEntry(mapped), true);
});

test("creative GET and TikTok complete prefer Supabase SoR", () => {
  assert.match(worker03, /export async function studioReadOutputRecord/);
  assert.match(worker03, /getOutputCreative[\s\S]{0,400}studioReadOutputRecord/);
  assert.match(worker04, /studioReadOutputRecordForManualComplete/);
  assert.match(worker04, /markStudioTiktokComplete[\s\S]{0,500}studioReadOutputRecordForManualComplete/);
  assert.match(app, /music\.includes\("manual action"\)/);
});

test("Instagram Manual_Fallback also has meta-complete route and creative card", () => {
  assert.match(worker04, /markStudioMetaComplete/);
  assert.match(app, /metaNeedsUrlEntry/);
  assert.match(app, /creativeMetaComplete/);
});

