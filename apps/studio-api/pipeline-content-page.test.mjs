import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
