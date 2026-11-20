import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { airtableShapedOutputFromSupabase } from "./supabase-pipeline-reads.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const record = (overrides = {}) => ({
  airtable_record_id: "recm7uIyT1y4VEvLd",
  output_number: 10705,
  platform: "TikTok",
  output_title: null,
  content_items: { content_title: "Concert Hall Closeups" },
  error_messages: {},
  ...overrides,
});

test("TikTok uses linked Supabase Content Item title when output title is blank", () => {
  const row = airtableShapedOutputFromSupabase(record());
  assert.equal(row.fields.Output_ID, 10705);
  assert.equal(row.fields.Output_Title, "Concert Hall Closeups");
});

test("Explicit output title takes precedence and other platforms do not inherit", () => {
  const explicit = airtableShapedOutputFromSupabase(record({ output_title: "Custom TikTok Headline" }));
  assert.equal(explicit.fields.Output_Title, "Custom TikTok Headline");
  const instagram = airtableShapedOutputFromSupabase(record({ platform: "Instagram" }));
  assert.equal(instagram.fields.Output_Title, null);
  const missing = airtableShapedOutputFromSupabase(record({ content_items: null }));
  assert.equal(missing.fields.Output_Title, null);
});

test("TikTok resend validates identity before rearming and does not dispatch stale rereads", () => {
  const source = readFileSync(join(here, "worker-functions-04.mjs"), "utf8");
  const start = source.indexOf("export async function resendStudioTiktokDraft");
  const end = source.indexOf("/*__STUDIO_WORKER_END:resendStudioTiktokDraft__*/", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /Number\.isSafeInteger\(numericOutputId\)/);
  assert.match(body, /!outputTitle/);
  assert.match(body, /new HttpError\(409/);
  assert.ok(body.indexOf("const numericOutputId") < body.indexOf("method: \"PATCH\""));
  assert.doesNotMatch(body, /\.catch\(\(\) => existing\)/);
  assert.match(body, /studioReadOutputRecordForManualComplete\(env, match\[1\]\)/);
});
