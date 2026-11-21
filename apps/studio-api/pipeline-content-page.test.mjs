import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pipelineLocalMidnightUtc, listSupabasePipelineContentPage } from "./supabase-pipeline-reads.mjs";
const dir = path.dirname(fileURLToPath(import.meta.url));
const reads = fs.readFileSync(path.join(dir, "supabase-pipeline-reads.mjs"), "utf8");
const worker = fs.readFileSync(path.join(dir, "worker-functions-03.mjs"), "utf8");
test("content page selects IDs before grouped outputs", () => {
 const start = reads.indexOf("export async function listSupabasePipelineContentPage");
 const body = reads.slice(start, reads.indexOf("export async function listSupabasePipelineHistoryPage",start));
 assert.ok(start >= 0);
 assert.ok(body.includes("content_number.desc.nullslast,id.desc"));
 assert.ok(body.includes("content_item_id=in."));
 assert.ok(body.includes("content_ids: page.map"));
 assert.ok(!body.includes("scheduled_post_date="));
});
test("profile date filtering honors IANA timezone and DST", () => {
 for(const zone of ["America/Los_Angeles","America/Chicago","America/New_York"]) assert.ok(reads.includes(zone));
 assert.ok(reads.includes("localMidnightUtc(nextDay)"));
});
test("authorized route exposes content page and date bounds", () => {
 assert.ok(worker.includes('focusedMode === "content_page"'));
 assert.ok(worker.includes("listSupabasePipelineContentPage(env"));
 assert.ok(worker.includes('url.searchParams.get("created_from")'));
 assert.ok(worker.includes('url.searchParams.get("created_to")'));
});

test("per-page setting defaults to ten and cannot split output groups", () => {
 assert.ok(worker.includes('url.searchParams.get("per_page") || 10'));
 assert.ok(reads.includes('Math.min(50, Math.floor(Number(limit) || 10))'));
 assert.ok(reads.includes('content_item_id=in.('));
});

test("profile dates resolve exact local midnights across spring and fall DST", () => {
  const chicago = day => pipelineLocalMidnightUtc(day, "America/Chicago");
  assert.equal(chicago("2026-03-08"), "2026-03-08T06:00:00.000Z");
  assert.equal(chicago("2026-03-09"), "2026-03-09T05:00:00.000Z");
  assert.equal(Date.parse(chicago("2026-03-09")) - Date.parse(chicago("2026-03-08")), 23 * 3600000);
  assert.equal(chicago("2026-11-01"), "2026-11-01T05:00:00.000Z");
  assert.equal(chicago("2026-11-02"), "2026-11-02T06:00:00.000Z");
  assert.equal(Date.parse(chicago("2026-11-02")) - Date.parse(chicago("2026-11-01")), 25 * 3600000);
  assert.equal(pipelineLocalMidnightUtc("2026-03-08", "America/Los_Angeles"), "2026-03-08T08:00:00.000Z");
  assert.equal(pipelineLocalMidnightUtc("2026-03-08", "America/New_York"), "2026-03-08T05:00:00.000Z");
});

test("content pages include zero-output groups without fabricated platform records", () => {
  assert.ok(reads.includes("content_groups: page.map"));
  assert.ok(worker.includes("content_groups: packed.content_groups"));
});

test("live Supabase read contract pages by content ID and hydrates all output siblings", async () => {
  const originalFetch = globalThis.fetch;
  const observed = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const type = parsed.pathname.split("/").at(-1);
    observed.push(parsed);
    let data;
    if (type === "content_profiles" && parsed.searchParams.has("airtable_record_id"))
      data = [{ id: "profile-uuid", airtable_record_id: "recProfileA" }];
    else if (type === "content_profiles")
      data = [{ profile_name: "ChicagoShining - Chicago", market_name: "Chicago" }];
    else if (type === "content_items")
      data = Array.from({ length: 11 }, (_, i) => ({
        id: "item-uuid-" + i, airtable_record_id: "recItem" + i,
        content_number: 2020 - i, content_title: "Content " + (2020 - i),
        created_at: "2026-03-08T13:00:00Z",
      }));
    else if (type === "platform_outputs")
      data = [0, 1].map(i => ({
        id: "output-uuid-" + i, airtable_record_id: "recOutput" + i,
        output_number: 9900 - i, platform: i ? "facebook" : "instagram",
        content_item_id: "item-uuid-0", content_profile_id: "profile-uuid",
        content_items: { airtable_record_id: "recItem0", content_number: 2020, content_title: "Content 2020" },
        content_profiles: { airtable_record_id: "recProfileA" },
        created_at: "2026-03-08T13:00:00Z",
      }));
    else throw new Error("Unexpected Supabase resource: " + type);
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await listSupabasePipelineContentPage({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test",
    }, {
      profileAirtableId: "recProfileA", offset: 0, limit: 10,
      createdFrom: "2026-03-08", createdTo: "2026-03-08",
    });
    assert.equal(result.content_groups.length, 10);
    assert.equal(result.content_groups[0].content_id, 2020);
    assert.equal(result.content_groups[9].content_id, 2011);
    assert.equal(result.records.length, 2);
    assert.equal(result.has_more, true);
    assert.equal(result.next_offset, 10);
    assert.equal(result.records[0].fields.Content_Item[0], "recItem0");
    assert.equal(result.content_groups[5].id, "recItem5");
    const contentRequest = observed.find(url => url.pathname.endsWith("/content_items"));
    assert.ok(contentRequest);
    assert.deepEqual(contentRequest.searchParams.getAll("created_at"), [
      "gte.2026-03-08T06:00:00.000Z",
      "lt.2026-03-09T05:00:00.000Z",
    ]);
    const outputsRequest = observed.find(url => url.pathname.endsWith("/platform_outputs"));
    assert.match(outputsRequest.searchParams.get("content_item_id"), /^in\.\(/);
    assert.equal(outputsRequest.searchParams.get("test_run_id"), "is.null");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
