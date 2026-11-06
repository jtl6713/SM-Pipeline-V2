import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");

test("Vibe Idea and Production draft route errors stay in HTTP catch boundary", () => {
  for (const call of [
    "createIdea(request, env, authorization, ctx)",
    "createProductionRequestFromBody(request, env, authorization, url, ctx)",
    "getOrCreateProductionRequestForIdea(request, env, url, authorization, ctx)",
  ]) {
    assert.ok(entry.includes(`return await ${call};`), `missing await around ${call}`);
    assert.ok(!entry.includes(`return ${call};`), `unawaited handler bypasses error boundary: ${call}`);
  }
  assert.match(entry, /catch \(error\) \{\s*console\.error\(error\);\s*return respond\(request, env, \{[\s\S]*?error\?\.status \|\| 500/);
});

function draftHarness({ target, fields, existing = null, failOnRead = false } = {}) {
  const start = source.indexOf("export async function createProductionRequestFromBody(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:createProductionRequestFromBody__*/", start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const original = { id: "recIdea", fields: { ...fields, Idea_Summary: "[vibe-cut] {}" } };
  const dependencies = {
    HttpError: class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } },
    loadAuthorizedIdea: async () => {
      if (failOnRead) throw Object.assign(new Error("Airtable: RATE_LIMIT_REACHED"), { status: 429 });
      return original;
    },
    promotionCompleted: () => false,
    requestedProfileId: () => "recProfile",
    existingDraftForIdea: async () => existing,
    respond: (_req, _env, obj, status = 200) => ({ ...obj, status }),
    mapProductionRequestLight: record => ({ id: record.id }),
    PHASE6_DEFAULT_VOICE_ID: "default",
    cleanProductionRequestPayload: async payload => ({ ...payload, production_notes: "[vibe-cut] {}" }),
    studioIsVibeCut: () => true,
    isVibeCutNotes: () => true,
    f: (record, key) => record.fields[key],
    vibeCutIdeaFields: () => target,
    isHorizontalVibeCutAspect: () => false,
    parseVibeCutDirective: () => ({ target_seconds: 30 }),
    airtableFetch: async (_env, _table, id, options) => {
      calls.push({ method: options?.method, id });
      return { ...original, fields: { ...original.fields, ...JSON.parse(options.body).fields } };
    },
    createDraftForIdea: async (_env, idea) => {
      calls.push({ method: "CREATE_DRAFT", idea: idea.id });
      return { id: "recDraft" };
    },
  };
  const names = Object.keys(dependencies);
  const run = new Function(...names, source.slice(start, end).replace("export ", "") +
    "\nreturn createProductionRequestFromBody;")(...Object.values(dependencies));
  return {
    calls,
    run: () => run({ json: async () => ({ idea_record_id: "recIdea" }) }, {}, {}, new URL("https://studio.example/api/production-requests")),
  };
}

test("already-canonical Vibe Idea proceeds to multipart-ready draft without redundant PATCH", async () => {
  const target = {
    Production_Content_Type: "Vertical Short Video",
    Studio_Matched_Media_Assets: [],
    Production_Carousel_Slide_Count: null,
  };
  const h = draftHarness({ target, fields: { Production_Content_Type: "Vertical Short Video" } });
  const response = await h.run();
  assert.equal(response.record.id, "recDraft");
  assert.deepEqual(h.calls.map(call => call.method), ["CREATE_DRAFT"]);
});

test("legacy photo-classified Idea is repaired before Vibe draft", async () => {
  const target = { Production_Content_Type: "Vertical Short Video", Studio_Matched_Media_Assets: [] };
  const h = draftHarness({ target, fields: {
    Production_Content_Type: "Carousel", Studio_Matched_Media_Assets: ["recPhoto"],
  } });
  await h.run();
  assert.deepEqual(h.calls.map(call => call.method), ["PATCH", "CREATE_DRAFT"]);
});

test("an existing linked draft is reused without writes", async () => {
  const h = draftHarness({ existing: { id: "recExisting" } });
  assert.equal((await h.run()).record.id, "recExisting");
  assert.equal(h.calls.length, 0);
});

test("429 from authoritative read propagates as 429; no duplicate draft is written", async () => {
  const h = draftHarness({ failOnRead: true });
  await assert.rejects(h.run(), error => error.status === 429);
  assert.equal(h.calls.length, 0);
});
