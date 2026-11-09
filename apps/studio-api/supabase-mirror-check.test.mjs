import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  compareAirtableSupabaseOutputMirror,
  compareAirtableSupabaseContentMirror,
} from "./supabase-mirror-check.mjs";
import { stripDeletedDuplicateOutputRecords } from "./supabase-pipeline-reads.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("output mirror compare catches status drift and ignores matching rows", () => {
  const airtable = {
    fields: {
      Output_ID: 2745,
      Platform: "TikTok",
      Output_Status: "Published",
      Publish_Status: "Published",
      Review_Status: "Approved",
      Published_At: "2026-11-09T00:00:24.618Z",
    },
  };
  const match = {
    output_number: 2745,
    platform: "TikTok",
    output_status: "Published",
    publish_status: "Published",
    review_status: "Approved",
    published_at: "2026-11-09T00:00:24.618Z",
  };
  assert.deepEqual(compareAirtableSupabaseOutputMirror(airtable, match), []);
  const drift = compareAirtableSupabaseOutputMirror(airtable, {
    ...match,
    publish_status: "Scheduled",
  });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].field, "Publish_Status");
});

test("content mirror compare catches title drift", () => {
  const airtable = {
    fields: {
      Content_ID: 490,
      Content_Title: "Spot Art Deco on Ocean Drive",
      Content_Status: "Approved",
    },
  };
  assert.deepEqual(
    compareAirtableSupabaseContentMirror(airtable, {
      content_number: 490,
      content_title: "Spot Art Deco on Ocean Drive",
      content_status: "Approved",
    }),
    [],
  );
  const drift = compareAirtableSupabaseContentMirror(airtable, {
    content_number: 490,
    content_title: "Wrong",
    content_status: "Approved",
  });
  assert.equal(drift[0].field, "Content_Title");
});

test("deleted output 7894 remains suppressed from Supabase-shaped lists", () => {
  const rows = stripDeletedDuplicateOutputRecords([
    { id: "recAlU4bLFmWDBV4H", content_item_id: "recPOI2nA8AwzLCfS" },
    { id: "recKeepSibling00001", content_item_id: "recPOI2nA8AwzLCfS" },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["recKeepSibling00001"]);
});

test("Worker exposes tenant_admin mirror-check route and bumped version", () => {
  const worker = readFileSync(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /pathname === "\/api\/ops\/supabase\/mirror-check"/);
  assert.match(worker, /getStudioSupabaseMirrorCheck/);
  assert.match(worker, /\/\*__STUDIO_WORKER_EXTRACT:getStudioSupabaseMirrorCheck__\*\//);
  const version = /version: "0\\.10\\.(\\d+)-([^"]+)"/.exec(worker);
  assert.ok(version, "Studio API must expose a version in /health");
  assert.ok(Number(version[1]) >= 776, "Studio API release must not regress behind mirror-check");
  const source = readFileSync(path.join(here, "worker-functions-03.mjs"), "utf8");
  assert.match(source, /export async function getStudioSupabaseMirrorCheck/);
  assert.match(source, /\/\*__STUDIO_WORKER_END:getStudioSupabaseMirrorCheck__\*\//);
  const helper = readFileSync(path.join(here, "supabase-mirror-check.mjs"), "utf8");
  assert.match(helper, /workstream_a5/);
});
