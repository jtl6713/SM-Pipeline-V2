import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapAirtableContentToSupabase, contentTimestampUpsertGroups, homogenizeUpsertRows } from "./supabase-pipeline-reads.mjs";

const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");

test("new Content Item with no client time delegates to database created_at default", () => {
  const row = mapAirtableContentToSupabase({
    id: "recContent1234567",
    fields: { Content_ID: 3001, Content_Title: "Original", Content_Profile: [] },
  }, "profile-id");
  assert.equal(Object.hasOwn(row, "created_at"), false);
  assert.equal(row.content_number, 3001);
});

test("migration source timestamps are preserved when known on Content Item create", () => {
  const instant = "2026-11-14T09:20:00.000Z";
  assert.equal(mapAirtableContentToSupabase({
    id: "recContent1234567",
    createdTime: instant,
    fields: { Content_ID: 3001 },
  }, "profile-id").created_at, instant);
  const explicit = "2026-11-13T07:10:00.000Z";
  assert.equal(mapAirtableContentToSupabase({
    id: "recContent1234567",
    createdTime: instant,
    fields: { Content_ID: 3001, Created_At: explicit },
  }, "profile-id").created_at, explicit);
});

test("Content Item sparse PATCH never writes created_at, even with missing legacy Created_At", () => {
  const start = source.indexOf("export async function syncAirtableContentRowToSupabase");
  const end = source.indexOf("export async function syncAirtableProductionRequestRowToSupabase", start);
  assert.ok(start >= 0 && end > start);
  const code = source.slice(start, end);
  const patchSection = code.slice(code.indexOf("const patch = {};"));
  assert.doesNotMatch(patchSection, /patch\.created_at\s*=/);
  assert.match(code, /Never upsert a sparse PATCH/);
});

test("mixed Content Item batches cannot invent explicit null created_at", () => {
  const original = [
    { airtable_record_id: "recKnown000000001", created_at: "2026-11-20T00:00:00Z", content_title: "Known" },
    { airtable_record_id: "recNew00000000001", content_title: "No client timestamp" },
    { airtable_record_id: "recNull0000000001", created_at: null, content_title: "Explicit null legacy" },
  ];
  const groups = contentTimestampUpsertGroups(original);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 1);
  assert.equal(groups[1].length, 2);
  assert.equal(groups[0][0].created_at, original[0].created_at);
  for (const row of homogenizeUpsertRows(groups[1])) {
    assert.equal(Object.hasOwn(row, "created_at"), false);
  }
  assert.equal(original[2].created_at, null, "never mutate original input");
});
