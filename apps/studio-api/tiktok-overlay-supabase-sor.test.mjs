import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { overlayLiveTikTokPublishRows } from "./worker-functions-03.mjs";

const root = dirname(fileURLToPath(import.meta.url));

test("Airtable TikTok overlay is skipped when Studio write source is supabase", async () => {
  let airtableCalls = 0;
  const env = {
    STUDIO_WRITE_SOURCE: "supabase",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    AIRTABLE_OUTPUT_TABLE_ID: "tblOutputs",
    // If overlay incorrectly opens Airtable, this getter will throw.
    get AIRTABLE_API_KEY() {
      airtableCalls += 1;
      throw new Error("Airtable must not be consulted for TikTok overlay under supabase SoR");
    },
  };
  const rows = [{
    id: "recTNabZBAAFSC3N5",
    platform: "TikTok",
    studio_state: "Manual Action Required",
    output_status: "Approved for Publishing",
    publish_status: "Ready to Publish",
    tiktok_draft_status: "Draft Delivered — Manual Action Required",
    manual_completion_status: "Required",
  }];
  const next = await overlayLiveTikTokPublishRows(env, rows);
  assert.equal(airtableCalls, 0);
  assert.equal(next, rows);
  assert.equal(next[0].studio_state, "Manual Action Required");
});

test("overview select includes typed tiktok_draft_status for Manual Action", () => {
  const reads = readFileSync(join(root, "supabase-pipeline-reads.mjs"), "utf8");
  const start = reads.indexOf("const OVERVIEW_OUTPUT_SELECT = [");
  const end = reads.indexOf("].join(\",\");", start);
  assert.ok(start > 0 && end > start);
  const select = reads.slice(start, end);
  assert.match(select, /tiktok_draft_status/);
  assert.match(
    readFileSync(join(root, "worker-functions-03.mjs"), "utf8"),
    /studioWriteSource\(env\) === "supabase"\) return rows/,
  );
});
