import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runInNewContext } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");

function extract(start, end) {
  const from = source.indexOf(start);
  const until = source.indexOf(end, from);
  assert.ok(from >= 0 && until > from, "missing Home source: " + start);
  return source.slice(from, until).replace(/^export /, "").trim();
}

test("Home fast path accepts current V6 snapshots, not obsolete V5 snapshots", () => {
  const api = extract("export async function profilesOverview(", "/*__STUDIO_WORKER_END:profilesOverview__*/");
  assert.match(api, /snapshot\.schemaVersion === 6 && age < freshMs/);
  assert.doesNotMatch(api, /snapshot\.schemaVersion === 5/);
  const writer = extract("export async function writeStudioProfilesOverviewSnapshot(", "/*__STUDIO_WORKER_END:writeStudioProfilesOverviewSnapshot__*/");
  assert.match(writer, /schemaVersion: 6/);
});

test("warm Worker rechecks R2 within 10 seconds without triggering Airtable build", async () => {
  const rows = [{ id: "one" }];
  const cache = { rows, schemaVersion: 6, at: 1000, lastR2CheckAt: Date.now(), generation: "one" };
  let gets = 0, adopts = 0;
  let durable = { at: 2000, rows: [{ id: "two" }] };
  const ctx = {
    studioProfilesOverviewCache: cache,
    studioProfilesOverviewRowsHealthy: () => true,
    profilesOverviewSnapshotView: () => ({ rows: cache.rows, at: cache.at, generation: cache.generation }),
    readStudioProfilesOverviewSnapshotFromR2: async () => { gets++; return durable; },
    rememberProfilesOverviewSnapshot: (row) => { adopts++; cache.rows = row.rows; cache.at = row.at; cache.lastR2CheckAt = Date.now(); return row; },
    console,
  };
  const read = runInNewContext("(" + extract("export async function readStudioProfilesOverviewSnapshot(", "/*__STUDIO_WORKER_END:readStudioProfilesOverviewSnapshot__*/") + ")", ctx);
  const env = { STUDIO_MEDIA: { get() {} } };
  await read(env);
  assert.equal(gets, 0, "hot cache should respond without an R2 call");
  cache.lastR2CheckAt = Date.now() - 10_001;
  await read(env);
  assert.equal(gets, 1, "expired hot cache should fetch the durable cross-isolate snapshot");
  assert.equal(adopts, 1);
  assert.equal(cache.rows[0].id, "two");
  durable = { at: 1000, rows: [{ id: "outdated" }] };
  cache.lastR2CheckAt = Date.now() - 10_001;
  await read(env);
  assert.equal(gets, 2);
  assert.equal(adopts, 1, "older R2 response must never replace newer in-isolate data");
  assert.equal(cache.rows[0].id, "two");
});
