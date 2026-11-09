import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  studioReadSource,
  studioPipelineReadSource,
  studioContentReadSource,
  studioFactoryOpsReadSource,
  studioHomeReadSource,
  studioSupabaseConfigured,
  supabaseCircuitOpen,
  noteSupabaseCircuitFailure,
  noteSupabaseCircuitSuccess,
  resetSupabaseCircuitForTests,
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
  listSupabaseFactoryDeskPack,
  listSupabaseOverviewPack,
  syncAirtableContentRowToSupabase,
  syncAirtableProductionRequestRowToSupabase,
  syncAirtableMediaAssetRowToSupabase,
  syncProfilePipelineToSupabase,
  enqueueStudioSideEffectOutbox,
  purgeDeletedDuplicatePackages,
  stripDeletedDuplicateOutputRecords,
  STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
  STUDIO_SUPABASE_PHASE4_READ_ROUTES,
  STUDIO_SUPABASE_READ_ROUTES,
} from "./supabase-pipeline-reads.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("deleted Instagram 7894 cannot resurrect from Supabase while sibling variants remain", () => {
  const rows = [
    { id: "recAlU4bLFmWDBV4H", content_item_id: "recPOI2nA8AwzLCfS" },
    { id: "recCqQ25AvLeysIlS", content_item_id: "recPOI2nA8AwzLCfS" },
    { id: "reck9cu90TsGp9JxI", content_item_id: "recPOI2nA8AwzLCfS" },
    { id: "rectXNIdVeJEQo4tZ", content_item_id: "recPOI2nA8AwzLCfS" },
  ];
  assert.deepEqual(stripDeletedDuplicateOutputRecords(rows).map(row => row.id), [
    "recCqQ25AvLeysIlS", "reck9cu90TsGp9JxI", "rectXNIdVeJEQo4tZ"
  ]);
});


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
    "airtable",
  );
});

test("studioPipelineReadSource restores Phase 3 only when flagged and configured", () => {
  const configured = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  };
  assert.equal(studioPipelineReadSource({}), "airtable");
  assert.equal(studioPipelineReadSource({ STUDIO_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioPipelineReadSource({ ...configured }), "airtable");
  assert.equal(
    studioPipelineReadSource({ ...configured, STUDIO_READ_SOURCE: "supabase" }),
    "supabase",
  );
  assert.equal(
    studioPipelineReadSource({ ...configured, STUDIO_PIPELINE_READ_SOURCE: "supabase" }),
    "supabase",
  );
  assert.equal(
    studioPipelineReadSource({
      ...configured,
      STUDIO_READ_SOURCE: "supabase",
      STUDIO_PIPELINE_READ_SOURCE: "airtable",
    }),
    "airtable",
  );
  // Global pause still covers Factory/Ops/Home even when Pipeline is restored.
  assert.equal(
    studioReadSource({ ...configured, STUDIO_READ_SOURCE: "supabase" }),
    "airtable",
  );
  assert.equal(
    studioContentReadSource({ ...configured, STUDIO_PIPELINE_READ_SOURCE: "supabase", STUDIO_READ_SOURCE: "supabase" }),
    "airtable",
  );
});

test("studioContentReadSource restores the content list only when its own flag is set", () => {
  const configured = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  };
  assert.equal(studioContentReadSource({}), "airtable");
  assert.equal(studioContentReadSource({ ...configured, STUDIO_CONTENT_READ_SOURCE: "supabase" }), "supabase");
  assert.equal(studioContentReadSource({ STUDIO_CONTENT_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(
    studioContentReadSource({ ...configured, STUDIO_CONTENT_READ_SOURCE: "airtable" }),
    "airtable",
  );
  assert.equal(
    studioPipelineReadSource({ ...configured, STUDIO_CONTENT_READ_SOURCE: "supabase" }),
    "airtable",
  );
  assert.equal(
    studioFactoryOpsReadSource({ ...configured, STUDIO_CONTENT_READ_SOURCE: "supabase", STUDIO_PIPELINE_READ_SOURCE: "supabase", STUDIO_READ_SOURCE: "supabase" }),
    "airtable",
  );
});

test("studioFactoryOpsReadSource restores Factory desk and Ops queue only when its own flag is set", () => {
  const configured = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  };
  assert.equal(studioFactoryOpsReadSource({}), "airtable");
  assert.equal(studioFactoryOpsReadSource({ STUDIO_FACTORY_OPS_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioFactoryOpsReadSource({ ...configured, STUDIO_FACTORY_OPS_READ_SOURCE: "supabase" }), "supabase");
  assert.equal(
    studioFactoryOpsReadSource({ ...configured, STUDIO_FACTORY_OPS_READ_SOURCE: "airtable" }),
    "airtable",
  );
  assert.equal(
    studioFactoryOpsReadSource({ ...configured, STUDIO_READ_SOURCE: "supabase", STUDIO_PIPELINE_READ_SOURCE: "supabase", STUDIO_CONTENT_READ_SOURCE: "supabase" }),
    "airtable",
  );
  assert.equal(
    studioContentReadSource({ ...configured, STUDIO_FACTORY_OPS_READ_SOURCE: "supabase" }),
    "airtable",
  );
  assert.equal(
    studioReadSource({ ...configured, STUDIO_FACTORY_OPS_READ_SOURCE: "supabase" }),
    "airtable",
  );
  assert.equal(
    studioHomeReadSource({ ...configured, STUDIO_FACTORY_OPS_READ_SOURCE: "supabase" }),
    "airtable",
  );
});

test("studioHomeReadSource restores Home overview only when its own flag is set", () => {
  const configured = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  };
  assert.equal(studioHomeReadSource({}), "airtable");
  assert.equal(studioHomeReadSource({ STUDIO_HOME_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioHomeReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: "supabase" }), "supabase");
  assert.equal(studioHomeReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: " Supabase " }), "supabase");
  assert.equal(studioHomeReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: "airtable" }), "airtable");
  assert.equal(
    studioHomeReadSource({
      ...configured,
      STUDIO_READ_SOURCE: "supabase",
      STUDIO_PIPELINE_READ_SOURCE: "supabase",
      STUDIO_CONTENT_READ_SOURCE: "supabase",
      STUDIO_FACTORY_OPS_READ_SOURCE: "supabase",
    }),
    "airtable",
  );
  assert.equal(studioReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioContentReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioFactoryOpsReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: "supabase" }), "airtable");
  assert.equal(studioPipelineReadSource({ ...configured, STUDIO_HOME_READ_SOURCE: "supabase" }), "airtable");
});

test("supabase circuit opens on repeated pool or statement timeouts", () => {
  resetSupabaseCircuitForTests();
  assert.equal(supabaseCircuitOpen(), false);
  noteSupabaseCircuitFailure(new Error("PGRST003 Timed out acquiring connection from connection pool."));
  assert.equal(supabaseCircuitOpen(), false);
  noteSupabaseCircuitFailure(new Error("canceling statement due to statement timeout 57014"));
  assert.equal(supabaseCircuitOpen(), true);
  noteSupabaseCircuitSuccess();
  assert.equal(supabaseCircuitOpen(), true);
  resetSupabaseCircuitForTests();
  assert.equal(supabaseCircuitOpen(), false);
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

test("overview pack pages open rows and keeps blank statuses", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ href, prefer: init?.headers?.Prefer || "", signal: init?.signal || null });
    const path = new URL(href).pathname;
    if (path.endsWith("/content_profiles")) {
      const id = href.includes("recF7UAn0LkMZZrWZ")
        ? "aa4b857d-e588-46aa-97ba-77cdd3c25dff"
        : "3d0d5221-9e53-4513-972c-67b70963a97d";
      return { ok: true, async text() { return JSON.stringify([{ id }]); } };
    }
    if (path.endsWith("/platform_outputs")) {
      if (!href.includes("aa4b857d-e588-46aa-97ba-77cdd3c25dff")) {
        return { ok: true, async text() { return "[]"; } };
      }
      return {
        ok: true,
        async text() {
          return JSON.stringify([{
            airtable_record_id: "recOpenOutput00001",
            content_profile_id: "aa4b857d-e588-46aa-97ba-77cdd3c25dff",
            output_number: 411,
            output_status: null,
            publish_status: "Scheduled",
            platform: "Instagram",
          }]);
        },
      };
    }
    return { ok: true, async text() { return "[]"; } };
  };
  try {
    const pack = await listSupabaseOverviewPack(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      {
        profileAirtableIds: ["recF7UAn0LkMZZrWZ", "recpNlNn6U6eq0M9r"],
        includeIdeas: false,
      },
    );
    const profileCalls = calls.filter((call) => call.href.includes("/content_profiles"));
    assert.equal(profileCalls.length, 2);
    for (const profileCall of profileCalls) {
      assert.equal(profileCall.prefer, "count=none");
      assert.ok(profileCall.signal);
    }
    const outputCalls = calls.filter((call) => call.href.includes("/platform_outputs"));
    assert.equal(outputCalls.length, 2);
    for (const outputCall of outputCalls) {
      assert.equal(outputCall.prefer, "count=none");
      assert.match(outputCall.href, /content_profile_id=eq\./);
      assert.match(outputCall.href, /do_not_publish=eq\.false/);
      assert.match(outputCall.href, /output_status\.is\.null/);
      assert.match(outputCall.href, /output_status\.neq\.Published/);
      assert.match(outputCall.href, /output_status\.neq\.Cancelled/);
      assert.match(outputCall.href, /publish_status\.is\.null/);
      assert.match(outputCall.href, /publish_status\.neq\.Published/);
      assert.doesNotMatch(outputCall.href, /output_caption/);
      assert.doesNotMatch(outputCall.href, /content_items\(/);
    }
    assert.equal(calls.some((call) => call.href.includes("idea_candidates")), false);
    assert.equal(pack.profilesMissing, false);
    assert.equal(pack.outputs.length, 1);
    assert.equal(pack.outputs[0].id, "recOpenOutput00001");
    assert.deepEqual(pack.outputs[0].fields.Content_Profile, ["recF7UAn0LkMZZrWZ"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("overview pack ideas query excludes promoted status and blank promotion ids", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push(href);
    const path = new URL(href).pathname;
    if (path.endsWith("/content_profiles")) {
      return { ok: true, async text() { return JSON.stringify([{ id: "aa4b857d-e588-46aa-97ba-77cdd3c25dff" }]); } };
    }
    if (path.endsWith("/platform_outputs")) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([{
            airtable_record_id: "recOpenOutput00001",
            content_profile_id: "aa4b857d-e588-46aa-97ba-77cdd3c25dff",
            output_number: 411,
            output_status: "Ready for Review",
            publish_status: null,
            platform: "Instagram",
          }]);
        },
      };
    }
    if (path.endsWith("/idea_candidates")) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([{
            airtable_record_id: "recOpenIdea0000001",
            content_profile_id: "aa4b857d-e588-46aa-97ba-77cdd3c25dff",
            status: "Generated",
            promoted: null,
            content_items: [],
          }]);
        },
      };
    }
    return { ok: true, async text() { return "[]"; } };
  };
  try {
    const pack = await listSupabaseOverviewPack(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      { profileAirtableIds: ["recF7UAn0LkMZZrWZ"], includeIdeas: true },
    );
    const ideaCall = calls.find((href) => href.includes("/idea_candidates"));
    assert.ok(ideaCall);
    assert.match(ideaCall, /status\.neq\.Promoted/);
    assert.match(ideaCall, /payload-%3E%3EPromoted_Content_Record_ID\.is\.null/);
    assert.match(ideaCall, /select=.*status/);
    assert.equal(pack.ideas.length, 1);
    assert.equal(pack.ideas[0].fields.Candidate_Status, "Generated");
    assert.equal(pack.ideas[0].fields.Promoted_Content_Record_ID, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("overview pack aborts a hung profile lookup before the 26s race", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      reject(error);
      return;
    }
    signal.addEventListener("abort", () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
  try {
    const pending = listSupabaseOverviewPack(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" },
      { profileAirtableIds: ["recF7UAn0LkMZZrWZ"], includeIdeas: false },
    );
    const rejected = assert.rejects(pending, /supabase overview pack timed out after 18s/);
    mock.timers.tick(18000);
    await rejected;
  } finally {
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  }
});

test("worker wires supabase phase4 reads behind the same flag", async () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);
  assert.match(worker, /skipSupabaseWriteThrough/);
  assert.match(worker, /supabaseCircuitOpen/);
  assert.match(worker, /studio_supabase_pipeline_reads_v1: true/);
  assert.match(worker, /studio_supabase_phase3_stable_v1: true/);
  assert.match(worker, /studio_supabase_phase4_reads_v1: true/);
  assert.match(worker, /studio_supabase_schedule_writethrough_v1: true/);
  assert.match(worker, /studio_supabase_approve_writethrough_v1: true/);
  assert.match(worker, /studio_supabase_phase5_writes_v1: true/);
  assert.match(worker, /studio_supabase_phase6_writes_v1: true/);
  assert.match(worker, /studioSupabaseWriteThroughAirtableMutation/);
  assert.match(worker, /syncAirtableContentRowToSupabase/);
  assert.match(worker, /syncAirtableProductionRequestRowToSupabase/);
  assert.match(worker, /enqueueStudioSideEffectOutbox/);
  assert.match(worker, /phase5_writes: "airtable_sor_write_through"/);
  assert.match(worker, /phase6_writes: "airtable_sor_write_through"/);
  assert.match(worker, /phase6_write_tables: \["production_requests", "media_assets"\]/);
  assert.match(worker, /syncAirtableMediaAssetRowToSupabase/);
  assert.match(worker, /supabase airtable write-through failed/);
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
  assert.match(worker, /studio_pipeline_read_source: studioPipelineReadSource\(env\)/);
  assert.match(worker, /studio_content_read_source: studioContentReadSource\(env\)/);
  assert.match(worker, /studio_factory_ops_read_source: studioFactoryOpsReadSource\(env\)/);
  assert.match(worker, /studio_home_read_source: studioHomeReadSource\(env\)/);
  assert.match(worker, /studio_supabase_pipeline_read_routes: STUDIO_SUPABASE_PIPELINE_READ_ROUTES/);
  const release = /version: "0\.10\.(\d+)-[^"]+"/.exec(worker);
  assert.ok(release, "Worker /health must identify a versioned release");
  assert.ok(Number(release[1]) >= 789, "Phase 6 media write-through cannot regress behind Worker 0.10.789");
  const pipelineFns = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  assert.match(pipelineFns, /studioPipelineReadSource\(env\) === "supabase"/);
  assert.match(pipelineFns, /studioContentReadSource\(env\) === "supabase"/);
  assert.match(pipelineFns, /factory_ops_read_source: studioFactoryOpsReadSource\(env\)/);
  assert.match(pipelineFns, /home_read_source: studioHomeReadSource\(env\)/);
  const factoryFns = await readFile(path.join(here, "worker-functions-04.mjs"), "utf8");
  const queueStart = factoryFns.indexOf("export async function getStudioOperationsQueue");
  const queueEnd = factoryFns.indexOf("export async function getFactoryDesk");
  assert.match(factoryFns.slice(queueStart, queueEnd), /studioFactoryOpsReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(factoryFns.slice(queueStart, queueEnd), /studioReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(factoryFns.slice(queueStart, queueEnd), /studioHomeReadSource\(env\) === "supabase"/);
  const overviewStart = factoryFns.indexOf("export async function buildStudioProfilesOverviewRows");
  const overviewEnd = factoryFns.indexOf("/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/");
  assert.match(factoryFns.slice(overviewStart, overviewEnd), /studioHomeReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(factoryFns.slice(overviewStart, overviewEnd), /if \(false &&/);
  assert.doesNotMatch(factoryFns.slice(overviewStart, overviewEnd), /studioReadSource\(env\) === "supabase"/);
  const deskFns = await readFile(path.join(here, "worker-functions-02.mjs"), "utf8");
  const ideaStart = deskFns.indexOf("export async function loadFactoryIdeaCandidates");
  const ideaEnd = deskFns.indexOf("/*__STUDIO_WORKER_END:loadFactoryIdeaCandidates__*/");
  assert.match(deskFns.slice(ideaStart, ideaEnd), /studioFactoryOpsReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(deskFns.slice(ideaStart, ideaEnd), /studioReadSource\(env\) === "supabase"/);
  assert.doesNotMatch(
    pipelineFns.slice(pipelineFns.indexOf("listOutputScheduleGrid"), pipelineFns.indexOf("buildPipelineOutputsPayloadFromSupabase")),
    /studioReadSource\(env\) === "supabase"/,
  );
  assert.match(worker, /studio_supabase_last_sync_at/);
  assert.match(worker, /STUDIO_SUPABASE_READ_ROUTES/);
  assert.match(worker, /supabase content list read failed/);
  assert.match(worker, /supabase profiles overview read failed/);
  assert.match(worker, /supabase factory\/ops queue read failed/);
  assert.match(worker, /schemaVersion: 6/);
  assert.match(worker, /ideaLimit: options\.ideaLimit \?\? 2000/);
  assert.match(worker, /usedSupabaseOutputs/);
  assert.match(worker, /Reuse last-good Ideas counts/);
  assert.match(worker, /must not block that output rebuild/);
  assert.match(worker, /includeIdeas/);
  const factoryFnsHome = await readFile(path.join(here, "worker-functions-04.mjs"), "utf8");
  const homePack = factoryFnsHome.slice(
    factoryFnsHome.indexOf("export async function buildStudioProfilesOverviewRows"),
    factoryFnsHome.indexOf("/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/"),
  );
  assert.match(homePack, /includeIdeas: missingIdeaCounts/);
  assert.match(homePack, /ideasSource = "supabase"/);
  assert.match(homePack, /listStudioOverviewUnpromotedIdeas/);
  const reads = await readFile(path.join(here, "supabase-pipeline-reads.mjs"), "utf8");
  assert.match(reads, /export async function supabaseRestAll/);
  assert.match(reads, /listSupabaseOverviewPack[\s\S]*supabaseRestAll/);
  assert.match(reads, /output_status\.is\.null,and\(output_status\.neq\.Published,output_status\.neq\.Cancelled\)/);
  assert.match(reads, /publish_status\.is\.null,publish_status\.neq\.Published/);
  assert.match(reads, /Prefer: "count=none"/);
  assert.match(reads, /OVERVIEW_OUTPUT_SELECT/);
  assert.match(reads, /OVERVIEW_OPEN_IDEA_FILTER/);
  assert.match(reads, /status\.neq\.Promoted/);
  assert.match(reads, /payload-%3E%3EPromoted_Content_Record_ID\.is\.null/);
  assert.match(reads, /supabase overview pack timed out after 18s/);
  assert.match(reads, /const controller = new AbortController\(\);[\s\S]*resolveSupabaseProfileId\(env, airtableId, \{ signal/);
  assert.match(reads, /export async function resolveSupabaseProfileId\(env, airtableProfileId, options = \{\}\)/);
  assert.match(reads, /promoted:payload-%3E%3EPromoted_Content_Record_ID/);
  assert.match(reads, /"status"/);
  assert.match(reads, /const \[outputGroups, ideaResult\] = await Promise\.all/);
  assert.match(reads, /Keep promotion keys even on the lean fallback/);
  assert.match(reads, /"Promoted_Content_Record_ID",\s*"Content Items"/);
});

test("phase4 docs exist", async () => {
  const readme = await readFile(path.join(here, "../../docs/supabase-migration/phase4/README.md"), "utf8");
  assert.match(readme, /Phase 4/);
  assert.match(readme, /GET \/api\/content/);
  assert.match(readme, /GET \/api\/profiles\/overview/);
  assert.match(readme, /GET \/api\/factory\/desk/);
});

const supabaseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
  AIRTABLE_OUTPUT_TABLE_ID: "tblOutputs",
  AIRTABLE_CONTENT_TABLE_ID: "tblContent",
};

test("phase 5 content write-through patches present columns when profile is unresolved", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return { ok: true, async text() { return ""; } };
  };
  try {
    const result = await syncAirtableContentRowToSupabase(supabaseEnv, {
      id: "recContent1",
      fields: { Content_ID: 12, Content_Status: "Thumbnail Ready", Content_Title: "Pier" },
    });
    assert.equal(result.mode, "patch");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "PATCH");
    assert.match(calls[0].url, /content_items\?airtable_record_id=eq\.recContent1/);
    const body = JSON.parse(calls[0].body);
    assert.equal(body.content_number, 12);
    assert.equal(body.content_title, "Pier");
    assert.equal(body.content_status, "Thumbnail Ready");
    assert.equal(body.content_profile_id, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 5 content write-through upserts when the profile uuid resolves", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    if (String(url).includes("content_profiles")) {
      return { ok: true, async text() { return JSON.stringify([{ id: "prof-uuid", airtable_record_id: "recProfile1" }]); } };
    }
    return { ok: true, async text() { return ""; } };
  };
  try {
    const result = await syncAirtableContentRowToSupabase(supabaseEnv, {
      id: "recContent2",
      fields: {
        Content_ID: 44,
        Content_Title: "Walk",
        Content_Status: "Ready",
        Content_Profile: ["recProfile1"],
      },
    });
    assert.equal(result.mode, "upsert");
    const post = calls.find((call) => call.method === "POST" && call.url.includes("content_items"));
    assert.ok(post);
    const rows = JSON.parse(post.body);
    assert.equal(rows[0].airtable_record_id, "recContent2");
    assert.equal(rows[0].content_profile_id, "prof-uuid");
    assert.equal(rows[0].content_number, 44);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 5 outbox insert skips when the table is not created yet", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    async text() {
      return JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.studio_side_effect_outbox' in the schema cache" });
    },
  });
  try {
    const result = await enqueueStudioSideEffectOutbox(supabaseEnv, {
      airtable_table: "platform_outputs",
      airtable_record_id: "recOutput1",
      mutation: "PATCH",
      payload: { publish_status: "Scheduled" },
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "outbox_table_missing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 5 airtable mutation mirrors an output PATCH and ignores GET", async () => {
  const { studioSupabaseWriteThroughAirtableMutation } = await import("./worker-functions-01.mjs");
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, method: init?.method || "GET", body: init?.body || "" });
    if (href.includes("content_profiles")) {
      return { ok: true, async text() { return JSON.stringify([{ id: "prof-uuid" }]); } };
    }
    if (href.includes("studio_side_effect_outbox")) {
      return {
        ok: false,
        status: 404,
        async text() { return JSON.stringify({ code: "PGRST205", message: "schema cache" }); },
      };
    }
    return { ok: true, async text() { return "[]"; } };
  };
  try {
    const skipped = await studioSupabaseWriteThroughAirtableMutation(supabaseEnv, "tblOutputs", "GET", {
      id: "recOutput1",
      fields: { Output_ID: 9, Platform: "Instagram" },
    });
    assert.equal(skipped.reason, "read");
    assert.equal(calls.length, 0);
    const result = await studioSupabaseWriteThroughAirtableMutation(supabaseEnv, "tblOutputs", "PATCH", {
      records: [{
        id: "recOutput1",
        fields: {
          Output_ID: 9,
          Platform: "Instagram",
          Publish_Status: "Scheduled",
          Content_Profile: ["recProfile1"],
        },
      }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.kind, "output");
    assert.equal(result.count, 1);
    assert.equal(result.results[0].outbox.reason, "outbox_table_missing");
    assert.ok(calls.some((call) => call.method === "POST" && call.url.includes("platform_outputs")));
    const incomplete = await studioSupabaseWriteThroughAirtableMutation(supabaseEnv, "tblOutputs", "PATCH", {
      id: "recPartial",
      fields: { Error_Message: "only a note" },
    });
    assert.equal(incomplete.reason, "no_records");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 6 production request write-through patches one present column", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return { ok: true, async text() { return ""; } };
  };
  try {
    const result = await syncAirtableProductionRequestRowToSupabase(supabaseEnv, {
      id: "recRequest1",
      fields: { Request_Status: "Submitted" },
    });
    assert.equal(result.mode, "patch");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "PATCH");
    assert.match(calls[0].url, /production_requests\?airtable_record_id=eq\.recRequest1/);
    assert.deepEqual(JSON.parse(calls[0].body), { request_status: "Submitted" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 6 production request write-through upserts identity fields without omitted columns", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return { ok: true, async text() { return ""; } };
  };
  try {
    const result = await syncAirtableProductionRequestRowToSupabase(supabaseEnv, {
      id: "recRequest2",
      fields: {
        Production_Request_ID: 480,
        Request_Status: "Ready",
        Requested_Title: "Pier lights",
      },
    });
    assert.equal(result.mode, "upsert");
    const post = calls.find((call) => call.method === "POST" && call.url.includes("production_requests"));
    assert.ok(post);
    assert.match(post.url, /on_conflict=airtable_record_id/);
    const rows = JSON.parse(post.body);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      airtable_record_id: "recRequest2",
      production_request_id: "480",
      request_status: "Ready",
      requested_title: "Pier lights",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 6 production request mutation skips other tables and a supabase failure", async () => {
  const { studioSupabaseWriteThroughAirtableMutation } = await import("./worker-functions-01.mjs");
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET" });
    return {
      ok: false,
      status: 500,
      async text() { return JSON.stringify({ message: "upsert failed" }); },
    };
  };
  try {
    const other = await studioSupabaseWriteThroughAirtableMutation(supabaseEnv, "tblMedia", "PATCH", {
      id: "recMedia1",
      fields: { Request_Status: "Ready", Production_Request_ID: 1 },
    });
    assert.equal(other.reason, "table");
    assert.equal(calls.length, 0);
    const notesOnly = await studioSupabaseWriteThroughAirtableMutation(supabaseEnv, "Production Requests", "PATCH", {
      id: "recRequestNotes",
      fields: { Production_Notes: "only a note" },
    });
    assert.equal(notesOnly.reason, "no_records");
    assert.equal(calls.length, 0);
    const failed = await studioSupabaseWriteThroughAirtableMutation(supabaseEnv, "Production Requests", "POST", {
      id: "recRequest3",
      fields: { Production_Request_ID: 481, Request_Status: "Draft" },
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.kind, "request");
    assert.equal(failed.count, 1);
    assert.equal(failed.results[0].synced.ok, false);
    assert.match(failed.results[0].synced.error, /upsert failed/);
    assert.equal(failed.results[0].outbox.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 6 media write-through patches a favorite without blanking the Drive id", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return { ok: true, async text() { return ""; } };
  };
  try {
    const result = await syncAirtableMediaAssetRowToSupabase(supabaseEnv, {
      id: "recMedia1",
      fields: { Studio_Favorite: true },
    });
    assert.equal(result.mode, "patch");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "PATCH");
    assert.match(calls[0].url, /media_assets\?airtable_record_id=eq\.recMedia1/);
    assert.deepEqual(JSON.parse(calls[0].body), { studio_favorite: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 6 media write-through upserts metadata and drops a non-Drive URL", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return { ok: true, async text() { return ""; } };
  };
  try {
    const result = await syncAirtableMediaAssetRowToSupabase(supabaseEnv, {
      id: "recMedia2",
      fields: {
        "Asset Name": "Pier lights",
        Media_Class: "Image",
        Asset_Role: "Other",
        "Google Drive File ID": "drive-file-1",
        "Google Drive URL": "https://media.chicagoshining.com/studio/library/pier.jpg",
        File_Size_Bytes: 1200,
      },
    });
    assert.equal(result.mode, "upsert");
    const post = calls.find((call) => call.method === "POST" && call.url.includes("media_assets"));
    assert.ok(post);
    assert.match(post.url, /on_conflict=airtable_record_id/);
    assert.deepEqual(JSON.parse(post.body), [{
      airtable_record_id: "recMedia2",
      asset_name: "Pier lights",
      media_class: "Image",
      asset_role: "Other",
      google_drive_file_id: "drive-file-1",
      file_size_bytes: 1200,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase 6 media mutation ignores a description-only body and a supabase failure", async () => {
  const { studioSupabaseWriteThroughAirtableMutation } = await import("./worker-functions-01.mjs");
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls.push(1);
    return {
      ok: false,
      status: 500,
      async text() { return JSON.stringify({ message: "media upsert failed" }); },
    };
  };
  try {
    const notes = await studioSupabaseWriteThroughAirtableMutation(
      { ...supabaseEnv, AIRTABLE_MEDIA_TABLE_ID: "tblMedia" },
      "tblMedia",
      "PATCH",
      { id: "recMediaNotes", fields: { Asset_Description: "only a note" } },
    );
    assert.equal(notes.reason, "no_records");
    assert.equal(calls.length, 0);
    const failed = await studioSupabaseWriteThroughAirtableMutation(
      { ...supabaseEnv, AIRTABLE_MEDIA_TABLE_ID: "tblMedia" },
      "tblMedia",
      "POST",
      {
        id: "recMedia3",
        fields: { "Asset Name": "Lake", "Google Drive File ID": "drive-file-3" },
      },
    );
    assert.equal(failed.ok, true);
    assert.equal(failed.kind, "media");
    assert.equal(failed.results[0].synced.ok, false);
    assert.match(failed.results[0].synced.error, /media upsert failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("profile sync refreshes Supabase rows that left the Airtable open pack", async () => {
  const posts = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const method = init?.method || "GET";
    if (method === "POST" && href.includes("platform_outputs")) posts.push(JSON.parse(init.body));
    if (href.includes("content_profiles") && method === "GET") {
      return { ok: true, async text() { return JSON.stringify([{ id: "prof-uuid", airtable_record_id: "recProfile1" }]); } };
    }
    if (method === "GET" && href.includes("do_not_publish=eq.false")) {
      return { ok: true, async text() { return JSON.stringify([{ airtable_record_id: "recStaleSkip00001" }]); } };
    }
    return { ok: true, async text() { return method === "GET" ? "[]" : ""; } };
  };
  try {
    const result = await syncProfilePipelineToSupabase(supabaseEnv, {
      id: "recProfile1",
      fields: { Active: true, Profile_Name: "Miami" },
    }, {
      listRecords: async (_env, _table, opts) => {
        const formula = String(opts?.filterFormula || "");
        if (!formula.includes("recStaleSkip00001")) return [];
        return [{
          id: "recStaleSkip00001",
          fields: {
            Output_ID: 3750,
            Platform: "YouTube",
            Output_Status: "Skipped",
            Publish_Status: "Not Ready",
            Review_Status: "Skipped",
            Do_Not_Publish: true,
            Output_Title: "Little Havana, Miami 3",
            Content_Profile: ["recProfile1"],
          },
        }];
      },
      f: (record, name) => record?.fields?.[name],
      contentProfileFilterFormula: () => '{Content_Profile}="recProfile1"',
    });
    assert.equal(result.reconciled_outputs, 1);
    const skipped = posts.flat().find((row) => row.airtable_record_id === "recStaleSkip00001");
    assert.ok(skipped);
    assert.equal(skipped.output_status, "Skipped");
    assert.equal(skipped.do_not_publish, true);
    assert.equal(skipped.publish_status, "Not Ready");
    assert.equal(skipped.scheduled_post_date, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("purge deletes the removed duplicate packages from Supabase and the Pipeline snapshot", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const stored = new Map();
  stored.set("studio/state/pipeline-list-recF7UAn0LkMZZrWZ-250-full.json", JSON.stringify({
    at: 1,
    payload: { records: [{ id: "recKihcIDRMvDub6c", output_title: "Huntington Beach, California" }, { id: "recKeepOutput0001", output_title: "Tar Pits To LACMA" }] },
  }));
  globalThis.fetch = async (url, init) => {
    calls.push({ method: init?.method || "GET", url: String(url) });
    return { ok: true, async text() { return JSON.stringify([{ airtable_record_id: "gone" }]); } };
  };
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    STUDIO_MEDIA: {
      async get(key) {
        const text = stored.get(key);
        return text ? { async json() { return JSON.parse(text); } } : null;
      },
      async put(key, body) { stored.set(key, body); },
    },
  };
  try {
    assert.deepEqual(
      stripDeletedDuplicateOutputRecords([
        { id: "recKihcIDRMvDub6c" },
        { id: "recKeepOutput0001" },
        { id: "recMissedSibling0001", content_item_id: "recWNbnAIsxpYNbkJ" },
        { id: "recHLNWWMarl0u2BE", content_item_id: "recxihGa49aULvnHG" },
      ]).map((row) => row.id),
      ["recKeepOutput0001"],
    );
    const result = await purgeDeletedDuplicatePackages(env);
    assert.ok(result.outputs >= 1);
    assert.ok(calls.some((call) => call.method === "DELETE" && call.url.includes("platform_outputs?airtable_record_id=in.(") && call.url.includes("recKihcIDRMvDub6c")));
    assert.ok(calls.some((call) => call.method === "DELETE" && call.url.includes("content_items?airtable_record_id=in.(") && call.url.includes("recWNbnAIsxpYNbkJ")));
    const snapshot = JSON.parse(stored.get("studio/state/pipeline-list-recF7UAn0LkMZZrWZ-250-full.json"));
    assert.deepEqual(snapshot.payload.records.map((row) => row.id), ["recKeepOutput0001"]);
    assert.equal(result.snapshots, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phase5 docs keep Airtable as write source of truth", async () => {
  const readme = await readFile(path.join(here, "../../docs/supabase-migration/phase5/README.md"), "utf8");
  assert.match(readme, /Phase 5/);
  assert.match(readme, /Airtable remains the write source of truth/);
  assert.match(readme, /platform_outputs/);
  assert.match(readme, /content_items/);
  assert.match(readme, /studio_side_effect_outbox/);
  assert.match(readme, /legacy export/);
  assert.match(readme, /Phase 6 Production Request write-through/);
  const phase6 = await readFile(path.join(here, "../../docs/supabase-migration/phase6/README.md"), "utf8");
  const handoff = await readFile(path.join(here, "../../docs/handoffs/supabase-phase6-handoff.md"), "utf8");
  const index = await readFile(path.join(here, "../../docs/supabase-migration/README.md"), "utf8");
  for (const doc of [phase6, handoff, index]) {
    assert.match(doc, /Airtable remains the write source of truth|Writes are still Airtable|Airtable is still the write source of truth/);
    assert.match(doc, /not started|Not started/);
    assert.match(doc, /STUDIO_WRITE_SOURCE/);
  }
  assert.match(handoff, /0\.10\.784-supabase-phase6-request-writes/);
  assert.match(phase6, /production_requests/);
  assert.match(phase6, /Media asset metadata write-through/);
  assert.match(phase6, /The transfer queue and cron writers are not started/);
  assert.match(index, /Phase 7/);
  const sql = await readFile(path.join(here, "../../docs/supabase-migration/phase5/003_side_effect_outbox.sql"), "utf8");
  assert.match(sql, /create table if not exists studio_side_effect_outbox/);
});


test("Factory Needs eyes loads older review outputs beyond 800 newer scheduled posts", async () => {
  const oldFetch = globalThis.fetch;
  const urls = [];
  const newer = Array.from({ length: 800 }, (_, i) => ({
    airtable_record_id: `recSched${String(i).padStart(9, "0")}`,
    output_number: 6000 - i, output_status: "Scheduled",
    render_status: "Rendered", do_not_publish: false,
    platform: "Instagram", studio_output_type: "Reel",
  }));
  const olderReview = Array.from({ length: 30 }, (_, i) => ({
    airtable_record_id: `recReview${String(i).padStart(8, "0")}`,
    output_number: 4700 - i, output_status: "Ready for Review",
    review_status: "Review Sent", render_status: "Rendered",
    do_not_publish: false, platform: "Instagram", studio_output_type: "Reel",
    final_file_url: "https://example.test/ready.mp4",
  }));
  globalThis.fetch = async (url) => {
    const href = String(url);
    urls.push(href);
    let rows = [];
    if (href.includes("platform_outputs?") && href.includes("&or=(")) {
      const q = new URL(href).searchParams;
      rows = olderReview.slice(Number(q.get("offset") || 0),
        Number(q.get("offset") || 0) + Number(q.get("limit") || 500));
    } else if (href.includes("platform_outputs?")) {
      rows = newer;
    }
    return { ok: true, async text() { return JSON.stringify(rows); } };
  };
  try {
    const pack = await listSupabaseFactoryDeskPack(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" },
      { outputLimit: 800 },
    );
    assert.equal(pack.outputs.length, 830);
    assert.equal(pack.reviewOutputs.length, 30);
    assert.equal(pack.outputs.filter((row) => row.fields.Output_Status === "Ready for Review").length, 30);
    assert.equal(pack.reviewOutputs[0].fields.Output_ID, 4700);
    assert.ok(urls.some((url) => url.includes("or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)")));
    assert.ok(urls.some((url) => url.includes("&offset=0")));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("Factory review-ready query errors must not become a misleading empty lane", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("&or=(")) {
      return { ok: false, status: 503, async text() { return '{"message":"review scan unavailable"}'; } };
    }
    return { ok: true, async text() { return "[]"; } };
  };
  try {
    await assert.rejects(
      listSupabaseFactoryDeskPack({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" }),
      /review scan unavailable/,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});
