import test from "node:test";
import assert from "node:assert/strict";
import { mergeMaeOccupancyRows, splitOutputCronSorRows, omitExistingPhase6CronRows } from "./supabase-pipeline-reads.mjs";

test("MAE occupancy overlay keeps an Airtable-only slot and prefers the Supabase time", () => {
  const merged = mergeMaeOccupancyRows(
    [
      { id: "recAirOnly0000001", fields: { Scheduled_Post_Date: "2026-11-12T11:30:00.000Z" } },
      { id: "recBoth0000000001", fields: { Scheduled_Post_Date: "2026-11-12T15:30:00.000Z" } },
    ],
    [
      { id: "recBoth0000000001", fields: { Scheduled_Post_Date: "2026-11-13T11:30:00.000Z" } },
      { id: "recSupaOnly0000001", fields: { Scheduled_Post_Date: "2026-11-13T15:30:00.000Z" } },
    ],
  );
  const byId = new Map(merged.map((row) => [row.id, row.fields.Scheduled_Post_Date]));
  assert.equal(byId.get("recAirOnly0000001"), "2026-11-12T11:30:00.000Z");
  assert.equal(byId.get("recBoth0000000001"), "2026-11-13T11:30:00.000Z");
  assert.equal(byId.get("recSupaOnly0000001"), "2026-11-13T15:30:00.000Z");
});

test("output cron keeps schedule columns on an existing Supabase row", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("airtable_record_id=in.")) {
      return { ok: true, async text() { return JSON.stringify([{ airtable_record_id: "recExisting000001" }]); } };
    }
    throw new Error(href);
  };
  try {
    const split = await splitOutputCronSorRows(
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret", STUDIO_WRITE_SOURCE: "supabase" },
      [
        { airtable_record_id: "recExisting000001", scheduled_post_date: "2026-11-12T11:30:00.000Z", output_title: "Keep title" },
        { airtable_record_id: "recFresh000000001", scheduled_post_date: "2026-11-12T15:30:00.000Z", output_title: "New" },
      ],
    );
    assert.equal(split.existing.length, 1);
    assert.equal(Object.hasOwn(split.existing[0], "scheduled_post_date"), false);
    assert.equal(split.existing[0].output_title, "Keep title");
    assert.equal(split.fresh[0].scheduled_post_date, "2026-11-12T15:30:00.000Z");
  } finally {
    globalThis.fetch = original;
  }
});

test("phase 6 cron inserts a missing row and skips an existing one", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async text() { return JSON.stringify([{ airtable_record_id: "recExisting000001" }]); },
  });
  try {
    const env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      STUDIO_PHASE6_WRITE_SOURCE: "supabase",
    };
    const kept = await omitExistingPhase6CronRows(env, "production_requests", [
      { airtable_record_id: "recExisting000001", request_status: "Ready" },
      { airtable_record_id: "recFresh000000001", request_status: "Draft" },
    ]);
    assert.deepEqual(kept.map((row) => row.airtable_record_id), ["recFresh000000001"]);
    const unchanged = await omitExistingPhase6CronRows(
      { ...env, STUDIO_PHASE6_WRITE_SOURCE: "airtable" },
      "production_requests",
      [{ airtable_record_id: "recExisting000001" }],
    );
    assert.equal(unchanged.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
