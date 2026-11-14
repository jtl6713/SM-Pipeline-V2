import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergePresentOutputBagFields, packOutputListFields } from "./supabase-pipeline-reads.mjs";

test("Phase 7 TikTok resend removes stale publish and handoff receipts without removing media", () => {
  const existing = {
    _runner_record_projection: "v1",
    _airtable_links: { Content_Item: "recabcdefghijklmn" },
    TikTok_Draft_Publish_ID: "old-publish-id",
    TikTok_Draft_Delivered_At: "2026-11-13T20:55:01Z",
    TikTok_Draft_Email_Sent_At: "2026-11-13T20:55:07Z",
    TikTok_Draft_Response_JSON: '{"status":"SEND_TO_USER_INBOX"}',
    Operational_Email_Key: "TTD3:old-publish-id",
    Operational_Email_Sent_At: "2026-11-13T20:55:07Z",
    TikTok_Draft_Public_Post_IDs_JSON: '["7707658179408055000"]',
    TikTok_Draft_Assets_JSON: '["https://media.chicagoshining.com/asset.jpg"]',
    Manual_Completion_Status: "Required",
    Output_Notes: "Earlier TikTok dispatch confirmed.",
  };
  const patch = {
    TikTok_Draft_Publish_ID: "",
    TikTok_Draft_Delivered_At: null,
    TikTok_Draft_Email_Sent_At: null,
    TikTok_Draft_Response_JSON: "",
    Operational_Email_Key: "",
    Operational_Email_Sent_At: null,
    TikTok_Draft_Public_Post_IDs_JSON: "",
    Publish_Error_Message: "",
    Output_Notes: "Studio TikTok draft resend requested.",
    TikTok_Draft_Status: "Ready for Delivery", // typed column; not a bag key
  };
  const result = mergePresentOutputBagFields(existing, patch);
  for (const key of [
    "TikTok_Draft_Publish_ID", "TikTok_Draft_Delivered_At",
    "TikTok_Draft_Email_Sent_At", "TikTok_Draft_Response_JSON",
    "Operational_Email_Key", "Operational_Email_Sent_At",
    "TikTok_Draft_Public_Post_IDs_JSON", "Publish_Error_Message",
  ]) {
    assert.equal(Object.hasOwn(result, key), false, key + " must be removed");
  }
  assert.equal(result.Output_Notes, patch.Output_Notes);
  assert.equal(result.TikTok_Draft_Assets_JSON, existing.TikTok_Draft_Assets_JSON);
  assert.equal(result.Manual_Completion_Status, "Required");
  assert.equal(result._runner_record_projection, "v1");
  assert.deepEqual(result._airtable_links, existing._airtable_links);
  assert.equal(Object.hasOwn(result, "TikTok_Draft_Status"), false);
  // Full-record catalog packing still excludes blanks, not deletes.
  assert.deepEqual(packOutputListFields({ Operational_Email_Key: "" }), {});
  assert.equal(existing.TikTok_Draft_Publish_ID, "old-publish-id");
});

test("missing vs explicit clears are different in partial Output writes", () => {
  const existing = { Operational_Email_Key: "preserve", Publish_Locked_At: "old", Output_Notes: "old" };
  const patched = mergePresentOutputBagFields(existing, { Publish_Locked_At: null });
  assert.equal(patched.Operational_Email_Key, "preserve");
  assert.equal(Object.hasOwn(patched, "Publish_Locked_At"), false);
  assert.equal(patched.Output_Notes, "old");
});

test("partial Output write calls clear-aware merge even when all incoming bag values are blank", async () => {
  const code = await readFile(join(dirname(fileURLToPath(import.meta.url)), "supabase-pipeline-reads.mjs"), "utf8");
  const start = code.indexOf("export async function syncAirtableOutputRowToSupabase");
  const end = code.indexOf("export async function syncAirtableContentRowToSupabase", start);
  assert.ok(start >= 0 && end > start);
  const body = code.slice(start, end);
  assert.match(body, /const presentBagKeys = Object\.keys\(record\.fields \|\| \{\}\)/);
  assert.match(body, /if \(presentBagKeys\.length\)/);
  assert.match(body, /mergePresentOutputBagFields\(existing\[0\]\.error_messages, record\.fields\)/);
  assert.doesNotMatch(body, /if \(Object\.keys\(bagPatch\)\.length\)/);
});
