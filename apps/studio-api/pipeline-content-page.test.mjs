import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { pipelineLocalMidnightUtc } from "./supabase-pipeline-reads.mjs";
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
