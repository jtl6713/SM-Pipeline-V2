import test from "node:test";
import assert from "node:assert/strict";
import { adoptMintedPhase6MediaIds } from "./supabase-pipeline-reads.mjs";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-test-service-role",
  AIRTABLE_MEDIA_TABLE_ID: "tblMediaAssets123",
};
const provisional = {
  id: "recMINTED00000000",
  fields: {
    "Asset Name": "New Tribeca scene",
    "Google Drive File ID": "driveFile12345678",
    Studio_Transfer_ID: "LIB-scene-5",
    Content_Profile: ["recPROFILE0000000"],
  },
};
const canonical = {
  id: "recACTUAL00000000",
  fields: { ...provisional.fields },
};
const sourceRow = {
  id: "a918af71-2a44-49c2-a383-a2ed457ef2c8",
  airtable_record_id: provisional.id,
  asset_name: provisional.fields["Asset Name"],
  google_drive_file_id: provisional.fields["Google Drive File ID"],
  metadata: {
    studio_transfer_id: provisional.fields.Studio_Transfer_ID,
    content_profile_airtable_id: provisional.fields.Content_Profile[0],
  },
};
const reply = data => new Response(JSON.stringify(data), {
  status: 200, headers: { "Content-Type": "application/json" },
});

test("canonical Airtable media ID replaces the provisional identity in place before upsert", async () => {
  const priorFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const uri = new URL(url);
    const method = options.method || "GET";
    requests.push({ uri, method, body: options.body ? JSON.parse(options.body) : null });
    if (method === "GET") return reply([sourceRow]);
    assert.equal(method, "PATCH");
    assert.equal(uri.searchParams.get("airtable_record_id"), "eq." + provisional.id);
    assert.equal(uri.searchParams.get("google_drive_file_id"), "eq." + sourceRow.google_drive_file_id);
    assert.deepEqual(JSON.parse(options.body), { airtable_record_id: canonical.id });
    assert.equal(options.headers.Prefer, "return=representation");
    return reply([{ ...sourceRow, airtable_record_id: canonical.id }]);
  };
  try {
    const outcome = await adoptMintedPhase6MediaIds(env, env.AIRTABLE_MEDIA_TABLE_ID,
      [provisional], [canonical]);
    assert.deepEqual(outcome, { ok: true, count: 1, adopted: 1, already: 0 });
    assert.deepEqual(requests.map(row => row.method), ["GET", "PATCH"]);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("a prior successful adoption is idempotent and does not patch again", async () => {
  const priorFetch = globalThis.fetch;
  const methods = [];
  globalThis.fetch = async (url, options = {}) => {
    const uri = new URL(url);
    const method = options.method || "GET";
    methods.push(method);
    assert.equal(method, "GET");
    return reply(uri.searchParams.get("airtable_record_id") === "eq." + provisional.id
      ? [] : [{ ...sourceRow, airtable_record_id: canonical.id }]);
  };
  try {
    const outcome = await adoptMintedPhase6MediaIds(env, env.AIRTABLE_MEDIA_TABLE_ID,
      [provisional], [canonical]);
    assert.deepEqual(outcome, { ok: true, count: 1, adopted: 0, already: 1 });
    assert.deepEqual(methods, ["GET", "GET"]);
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("mismatched original Drive identity fails closed before any network writes", async () => {
  const priorFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("must not call network"); };
  try {
    const bad = { ...canonical, fields: { ...canonical.fields, "Google Drive File ID": "another-file" } };
    const outcome = await adoptMintedPhase6MediaIds(env, env.AIRTABLE_MEDIA_TABLE_ID,
      [provisional], [bad]);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, "immutable_media_identity_mismatch");
  } finally {
    globalThis.fetch = priorFetch;
  }
});

test("non-media Phase 6 creates remain unaffected", async () => {
  const result = await adoptMintedPhase6MediaIds(env, "tblOtherTable000", [provisional], [canonical]);
  assert.deepEqual(result, { skipped: true, reason: "not_media" });
});
