import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  studioReadSource,
  studioSupabaseConfigured,
  airtableShapedOutputFromSupabase,
  mapAirtableOutputToSupabase,
  STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
} from "./supabase-pipeline-reads.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("studioReadSource defaults to airtable and requires supabase secrets", () => {
  assert.equal(studioReadSource({}), "airtable");
  assert.equal(studioReadSource({ STUDIO_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioSupabaseConfigured({}), false);
  assert.equal(
    studioReadSource({
      STUDIO_READ_SOURCE: "supabase",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    }),
    "supabase",
  );
});

test("airtable-shaped output preserves rec id for approve/creative routes", () => {
  const shaped = airtableShapedOutputFromSupabase({
    airtable_record_id: "recOutput123456789",
    output_number: 42,
    platform: "Instagram",
    output_status: "Ready for Review",
    do_not_publish: false,
    content_item_airtable_id: "recContent12345678",
  });
  assert.equal(shaped.id, "recOutput123456789");
  assert.equal(shaped.fields.Output_ID, 42);
  assert.deepEqual(shaped.fields.Content_Item, ["recContent12345678"]);
});

test("mapAirtableOutputToSupabase maps lean Pipeline fields", () => {
  const row = mapAirtableOutputToSupabase(
    {
      id: "recOutABCDEFGHIJK",
      fields: {
        Output_ID: 99,
        Platform: "TikTok",
        Output_Status: "Published",
        Content_Item: ["recContentABCDEFGH"],
        Do_Not_Publish: false,
      },
    },
    {
      profileUuid: "11111111-1111-1111-1111-111111111111",
      contentUuidByAirtableId: new Map([
        ["recContentABCDEFGH", "22222222-2222-2222-2222-222222222222"],
      ]),
    },
  );
  assert.equal(row.airtable_record_id, "recOutABCDEFGHIJK");
  assert.equal(row.platform, "TikTok");
  assert.equal(row.content_item_id, "22222222-2222-2222-2222-222222222222");
  assert.equal(row.content_profile_id, "11111111-1111-1111-1111-111111111111");
});

test("supabase read-route inventory is explicit", () => {
  assert.ok(STUDIO_SUPABASE_PIPELINE_READ_ROUTES.includes("GET /api/outputs"));
  assert.ok(STUDIO_SUPABASE_PIPELINE_READ_ROUTES.includes("GET /api/outputs/schedule-grid"));
});

test("worker wires supabase pipeline reads behind a flag", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /version: "0\.10\.609-supabase-phase3-stable"/);
  assert.match(worker, /studio_supabase_pipeline_reads_v1: true/);
  assert.match(worker, /studio_supabase_phase3_stable_v1: true/);
  assert.match(worker, /from "\.\/supabase-pipeline-reads\.mjs"/);
  assert.match(worker, /buildPipelineOutputsPayloadFromSupabase/);
  assert.match(worker, /listSupabaseScheduleGrid/);
  assert.match(worker, /\/api\/ops\/supabase\/sync/);
  assert.match(worker, /studioSyncSupabasePipelineReads/);
  assert.match(worker, /listOpenOutputs/);
  assert.match(worker, /getStudioSupabaseSyncStatus/);
  assert.match(worker, /studio_read_source: studioReadSource\(env\)/);
  assert.match(worker, /studio_supabase_last_sync_at/);
});
