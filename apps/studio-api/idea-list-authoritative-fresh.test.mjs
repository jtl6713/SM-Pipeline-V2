import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const list = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");

test("Ideas endpoint requests live mapping only when fresh=1", () => {
  const start = list.indexOf("export async function listIdeas(");
  const end = list.indexOf("/*__STUDIO_WORKER_END:listIdeas__*/", start);
  assert.ok(start >= 0 && end > start);
  assert.match(list.slice(start, end), /forceFresh: url\.searchParams\.get\("fresh"\) === "1"/);
});

test("live list bypasses stale read and refreshes the snapshot without duplicate writes", async () => {
  const start = source.indexOf("export function respondStudioMappedList(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:respondStudioMappedList__*/", start);
  assert.ok(start >= 0 && end > start);
  const code = source.slice(start, end).replace(/^export /, "");
  let reads = 0, writes = 0, builds = 0;
  const tasks = [];
  const run = new Function(
    "readMappedListSnapshot", "studioMappedListSnapshotFresh",
    "scheduleMappedListRefresh", "writeMappedListSnapshot",
    "respond", "mapStudioContentProfile", "STUDIO_READ_SNAPSHOT_FRESH_MS",
    code + "\nreturn respondStudioMappedList;"
  )(
    async () => { reads++; return { payload: { records: [{ id: "obsolete" }] } }; },
    () => true, () => { throw new Error("should not background-refresh live result"); },
    async () => { writes++; },
    (_req, _env, payload) => payload,
    () => ({}), 25000
  );
  const result = await run({}, {}, { waitUntil: p => tasks.push(p) }, {
    memoryKey: "ideas:chicago:100", snapshotKey: "ideas.json", profile: { id: "chicago" },
    forceFresh: true, ttlMs: 25000,
    builder: async () => { builds++; return { records: [{ id: "1698", status: "Promoted" }] }; },
  });
  await Promise.all(tasks);
  assert.equal(reads, 0);
  assert.equal(builds, 1);
  assert.equal(writes, 1);
  assert.equal(result.live, true);
  assert.equal(result.stale, false);
  assert.equal(result.records[0].status, "Promoted");
});
