import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  studioReadSource,
  studioSupabaseConfigured,
  airtableShapedOutputFromSupabase,
  airtableShapedContentFromSupabase,
  airtableShapedIdeaFromSupabase,
  airtableShapedProductionRequestFromSupabase,
  mapAirtableOutputToSupabase,
  mapAirtableContentToSupabase,
  mapAirtableIdeaToSupabase,
  mapAirtableProductionRequestToSupabase,
  packOutputListFields,
  supabaseRestAll,
  STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
  STUDIO_SUPABASE_PHASE4_READ_ROUTES,
  STUDIO_SUPABASE_READ_ROUTES,
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
    error_messages: {
      Publish_Retry_Eligible: true,
      YouTube_Video_ID: "abc123",
    },
  });
  assert.equal(shaped.id, "recOutput123456789");
  assert.equal(shaped.fields.Output_ID, 42);
  assert.deepEqual(shaped.fields.Content_Item, ["recContent12345678"]);
  assert.equal(shaped.fields.Publish_Retry_Eligible, true);
  assert.equal(shaped.fields.YouTube_Video_ID, "abc123");
});

test("packOutputListFields drops typed and huge JSON columns", () => {
  const bag = packOutputListFields({
    Output_ID: 1,
    Platform: "TikTok",
    Publish_Retry_Eligible: true,
    Selected_Assets_JSON: "{\"huge\":true}",
    Manual_Fallback_Required: true,
  });
  assert.equal(bag.Output_ID, undefined);
  assert.equal(bag.Platform, undefined);
  assert.equal(bag.Selected_Assets_JSON, undefined);
  assert.equal(bag.Publish_Retry_Eligible, true);
  assert.equal(bag.Manual_Fallback_Required, true);
});

test("mapAirtableOutputToSupabase maps lean Pipeline fields into projection bag", () => {
  const row = mapAirtableOutputToSupabase(
    {
      id: "recOutABCDEFGHIJK",
      fields: {
        Output_ID: 99,
        Platform: "TikTok",
        Output_Status: "Published",
        Content_Item: ["recContentABCDEFGH"],
        Do_Not_Publish: false,
        Publish_Retry_Eligible: true,
        TikTok_Draft_Status: "Draft Delivered",
        Selected_Assets_JSON: "{\"skip\":1}",
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
  assert.equal(row.error_messages.Publish_Retry_Eligible, true);
  assert.equal(row.error_messages.TikTok_Draft_Status, "Draft Delivered");
  assert.equal(row.error_messages.Selected_Assets_JSON, undefined);
});

test("content / idea / request shapings keep Airtable ids", () => {
  const content = airtableShapedContentFromSupabase({
    airtable_record_id: "recContentABCDEFGH",
    content_number: 12,
    content_title: "Navy Pier",
    content_status: "Ready",
    extras: { Content_Type: "Vertical Short Video", Asset_Match_Status: "Matched" },
    content_profile_airtable_id: "recProfileABCDEFGH",
  });
  assert.equal(content.id, "recContentABCDEFGH");
  assert.equal(content.fields.Content_Type, "Vertical Short Video");
  assert.deepEqual(content.fields.Content_Profile, ["recProfileABCDEFGH"]);

  const idea = airtableShapedIdeaFromSupabase({
    airtable_record_id: "recIdeaABCDEFGHIJK",
    candidate_title: "Sunset walk",
    status: "Ready",
    payload: {
      Promoted_Content_Record_ID: null,
      "Content Items": [],
      Studio_Photo_Wait_Status: "Waiting",
    },
    content_profile_airtable_id: "recProfileABCDEFGH",
  });
  assert.equal(idea.id, "recIdeaABCDEFGHIJK");
  assert.equal(idea.fields.Studio_Photo_Wait_Status, "Waiting");

  const request = airtableShapedProductionRequestFromSupabase({
    airtable_record_id: "recRequestABCDEFG",
    production_request_id: "PR-9",
    request_status: "Submitted",
    production_job: { step: "audio", percent: 40 },
    publish_status: {
      idea_candidate_airtable_id: "recIdeaABCDEFGHIJK",
      promoted_content_airtable_id: "recContentABCDEFGH",
      Target_Platforms: ["Instagram"],
    },
  });
  assert.equal(request.id, "recRequestABCDEFG");
  assert.deepEqual(request.fields.Idea_Candidate, ["recIdeaABCDEFGHIJK"]);
  assert.match(String(request.fields.Studio_Production_Job_JSON), /"step":"audio"/);
});

test("mapAirtableContent/Idea/Request helpers populate jsonb bags", () => {
  const content = mapAirtableContentToSupabase({
    id: "recContentABCDEFGH",
    fields: {
      Content_ID: 7,
      Content_Title: "Riverwalk",
      Content_Type: "Carousel",
      Asset_Match_Status: "Matched",
    },
  }, "11111111-1111-1111-1111-111111111111");
  assert.equal(content.extras.Content_Type, "Carousel");

  const idea = mapAirtableIdeaToSupabase({
    id: "recIdeaABCDEFGHIJK",
    fields: {
      Candidate_Title: "Bridge lights",
      Candidate_Status: "Ready",
      Content_Profile: ["recProfileABCDEFGH"],
      Studio_Photo_Wait_Status: "Waiting",
    },
  }, "11111111-1111-1111-1111-111111111111");
  assert.equal(idea.payload.Studio_Photo_Wait_Status, "Waiting");

  const request = mapAirtableProductionRequestToSupabase({
    id: "recRequestABCDEFG",
    fields: {
      Request_Status: "WeirdStatus",
      Idea_Candidate: ["recIdeaABCDEFGHIJK"],
      Studio_Production_Job_JSON: "{\"step\":\"blocked\"}",
    },
  });
  assert.equal(request.request_status, "Draft");
  assert.equal(request.publish_status.idea_candidate_airtable_id, "recIdeaABCDEFGHIJK");
});

test("supabase read-route inventory includes Phase 3 and Phase 4", () => {
  assert.ok(STUDIO_SUPABASE_PIPELINE_READ_ROUTES.includes("GET /api/outputs"));
  assert.ok(STUDIO_SUPABASE_PIPELINE_READ_ROUTES.includes("GET /api/outputs/schedule-grid"));
  assert.ok(STUDIO_SUPABASE_PHASE4_READ_ROUTES.includes("GET /api/content"));
  assert.ok(STUDIO_SUPABASE_PHASE4_READ_ROUTES.includes("GET /api/profiles/overview"));
  assert.ok(STUDIO_SUPABASE_PHASE4_READ_ROUTES.includes("GET /api/factory/desk"));
  assert.ok(STUDIO_SUPABASE_PHASE4_READ_ROUTES.includes("GET /api/operations/queue"));
  assert.equal(STUDIO_SUPABASE_READ_ROUTES.length, STUDIO_SUPABASE_PIPELINE_READ_ROUTES.length + STUDIO_SUPABASE_PHASE4_READ_ROUTES.length);
});

test("supabaseRestAll pages past PostgREST max-rows so overview counts stay complete", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const offset = Number(new URL(url).searchParams.get("offset") || 0);
    const limit = Number(new URL(url).searchParams.get("limit") || 0);
    const start = offset + 1;
    const rows = [];
    for (let i = 0; i < limit && start + i <= 2500; i += 1) {
      rows.push({ id: start + i });
    }
    return {
      ok: true,
      async text() { return JSON.stringify(rows); },
    };
  };
  try {
    const rows = await supabaseRestAll(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      "platform_outputs?select=id&order=output_number.desc.nullslast&limit=10000",
      { pageSize: 1000, maxRows: 10000 },
    );
    assert.equal(rows.length, 2500);
    assert.equal(calls.length, 3);
    assert.match(calls[0], /limit=1000&offset=0/);
    assert.match(calls[1], /limit=1000&offset=1000/);
    assert.match(calls[2], /limit=1000&offset=2000/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker wires supabase phase4 reads behind the same flag", async () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /version: "0.10.643-tiktok-inbox-hold"/);
  assert.match(worker, /studio_supabase_pipeline_reads_v1: true/);
  assert.match(worker, /studio_supabase_phase3_stable_v1: true/);
  assert.match(worker, /studio_supabase_phase4_reads_v1: true/);
  assert.match(worker, /studio_supabase_schedule_writethrough_v1: true/);
  assert.match(worker, /studio_supabase_approve_writethrough_v1: true/);
  assert.match(worker, /from "\.\/supabase-pipeline-reads\.mjs"/);
  assert.match(worker, /listSupabaseContentItems/);
  assert.match(worker, /listSupabaseOverviewPack/);
  assert.match(worker, /listSupabaseFactoryDeskPack/);
  assert.match(worker, /buildPipelineOutputsPayloadFromSupabase/);
  assert.match(worker, /listSupabaseScheduleGrid/);
  assert.match(worker, /syncAirtableOutputRowToSupabase/);
  assert.match(worker, /studioSupabaseWriteThroughOutput/);
  assert.match(worker, /supabase \$\{label\} write-through failed/);
  assert.match(worker, /\/api\/ops\/supabase\/sync/);
  assert.match(worker, /studioSyncSupabasePipelineReads/);
  assert.match(worker, /listOpenOutputs/);
  assert.match(worker, /getStudioSupabaseSyncStatus/);
  assert.match(worker, /studio_read_source: studioReadSource\(env\)/);
  assert.match(worker, /studio_supabase_last_sync_at/);
  assert.match(worker, /STUDIO_SUPABASE_READ_ROUTES/);
  assert.match(worker, /supabase content list read failed/);
  assert.match(worker, /supabase profiles overview read failed/);
  assert.match(worker, /supabase factory\/ops queue read failed/);
  assert.match(worker, /schemaVersion: 3/);
  assert.match(worker, /ideaLimit: options\.ideaLimit \?\? 2000/);
  assert.match(worker, /usedSupabaseOutputs/);
  assert.match(worker, /Ideas column from Airtable/);
  const reads = await readFile(path.join(here, "supabase-pipeline-reads.mjs"), "utf8");
  assert.match(reads, /export async function supabaseRestAll/);
  assert.match(reads, /listSupabaseOverviewPack[\s\S]*supabaseRestAll/);
});

test("phase4 docs exist", async () => {
  const readme = await readFile(path.join(here, "../../docs/supabase-migration/phase4/README.md"), "utf8");
  assert.match(readme, /Phase 4/);
  assert.match(readme, /GET \/api\/content/);
  assert.match(readme, /GET \/api\/profiles\/overview/);
  assert.match(readme, /GET \/api\/factory\/desk/);
});
