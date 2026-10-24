import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  READY_PRODUCTION_SCHEMA,
  readyProductionList,
  readyProductionListPage,
  readyProductionSelectJobs,
} from "./ready-production-queue.mjs";

const source = () => readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");

function pagedBucket(count = 12, pageSize = 3) {
  const rows = new Map();
  for (let i = 0; i < count; i += 1) {
    const ideaId = `recReadyScan${String(i).padStart(6, "0")}`;
    rows.set(`studio/state/ready-production/v1/jobs/${ideaId}.json`, {
      schema: READY_PRODUCTION_SCHEMA,
      idea_id: ideaId,
      profile_id: i % 2 ? "recNycAutoReady001" : "recChicagoAuto001",
      status: "queued",
      created_at: new Date(Date.UTC(2026, 9, 24, 0, i)).toISOString(),
    });
  }
  return {
    async get(key) {
      const record = rows.get(key);
      return record ? { etag: "v1", text: async () => JSON.stringify(record) } : null;
    },
    async put() { return { etag: "ok" }; },
    async list({ prefix, limit = 1000, cursor = null }) {
      const keys = [...rows.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const end = Math.min(keys.length, start + Math.min(limit, pageSize));
      return {
        objects: keys.slice(start, end).map((key) => ({ key })),
        truncated: end < keys.length,
        ...(end < keys.length ? { cursor: String(end) } : {}),
      };
    },
  };
}

test("bounded job pages rotate through every R2 key, including beyond 500", async () => {
  const bucket = pagedBucket(12);
  assert.equal((await readyProductionList(bucket, { maxScan: 3 })).length, 3,
    "legacy list API remains a bounded array");
  const visited = [];
  let cursor = null;
  for (let pass = 0; pass < 4; pass += 1) {
    const page = await readyProductionListPage(bucket, { maxScan: 3, cursor });
    assert.equal(page.scanned, 3);
    assert.equal(page.jobs.length, 3);
    visited.push(...page.jobs.map((job) => job.idea_id));
    cursor = page.nextCursor;
    if (pass < 3) assert.ok(cursor, "scan must continue on the next minute");
  }
  assert.equal(cursor, null, "end of R2 index must return to beginning");
  assert.equal(new Set(visited).size, 12, "no idea remains invisible in later scan pages");
  const fromLastPage = readyProductionSelectJobs((await readyProductionListPage(bucket, { maxScan: 3, cursor: "9" })).jobs);
  assert.ok(fromLastPage.some((row) => row.idea_id === "recReadyScan000009"),
    "late-page photo-ready jobs must become claimable");
});

test("production jobs beyond the first 500 R2 keys are reached by the next pass", async () => {
  const bucket = pagedBucket(510, 250);
  const first = await readyProductionListPage(bucket, { maxScan: 500 });
  assert.equal(first.scanned, 500);
  assert.equal(first.jobs.length, 500);
  assert.ok(first.nextCursor);
  const second = await readyProductionListPage(bucket, { maxScan: 500, cursor: first.nextCursor });
  assert.equal(second.jobs.length, 10);
  assert.equal(second.nextCursor, null);
  assert.ok(second.jobs.some((job) => job.idea_id === "recReadyScan000509"),
    "the latest photo-ready Idea is reachable even after the 500-key window");
});

test("cron persists a rolling R2 cursor and checks just-discovered jobs on the same tick", () => {
  const src = source();
  const cron = src.slice(
    src.indexOf("async function studioReadyProductionCronResume("),
    src.indexOf("export { studioReadyProductionCronResume };"),
  );
  assert.match(cron, /readyProductionListPage\(env\.STUDIO_MEDIA/);
  assert.match(cron, /scan-cursor\.json/);
  assert.match(cron, /cursor: page\.nextCursor/);
  assert.match(cron, /for \(const entry of enqueued\)/);
  assert.match(cron, /jobs\.push\(entry\.job\)/);
  assert.match(cron, /readyProductionClaim\(env\.STUDIO_MEDIA/);
  assert.match(cron, /final_approval: "human_only"/);
  assert.doesNotMatch(cron, /approveOutputRecordForPublishing/);
});
