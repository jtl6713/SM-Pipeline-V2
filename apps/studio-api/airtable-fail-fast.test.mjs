import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("Worker health advertises airtable queue-hang fix build", () => {
  assert.match(worker, /version: "0.10.613-open-ideas-drain-20"/);
  assert.match(worker, /studio_airtable_queue_hang_fix_v1: true/);
});

test("Airtable slot has no shared Promise queue that can hang the isolate", () => {
  const slotStart = worker.indexOf("async function airtableRequestSlot");
  assert.ok(slotStart >= 0);
  const slotFn = worker.slice(slotStart, worker.indexOf("function airtableRetryDelayMs", slotStart));
  assert.match(slotFn, /AIRTABLE_SLOT_FAIL_FAST_MS/);
  assert.match(slotFn, /Airtable cooling down/);
  assert.doesNotMatch(slotFn, /airtableQueue/);
  assert.doesNotMatch(slotFn, /\.then\(/);
  assert.doesNotMatch(worker, /let airtableQueue\s*=/);
});

test("Airtable 429 records cooldown but does not sleep in-request", () => {
  const fetchFn = worker.slice(
    worker.indexOf("async function airtableFetch"),
    worker.indexOf("const AIRTABLE_BATCH_LIMIT")
  );
  assert.match(fetchFn, /Airtable rate limited; failing fast/);
  assert.doesNotMatch(fetchFn, /await sleepMs\(cooldown\)/);
  assert.doesNotMatch(fetchFn, /backing off/);
  assert.doesNotMatch(fetchFn, /for \(let attempt = 1;/);
});

test("Content Profiles cache stores resolved rows only", () => {
  const fn = worker.slice(
    worker.indexOf("async function listContentProfileRecords"),
    worker.indexOf("async function resolveAuthorizedContentProfiles")
  );
  assert.match(fn, /__contentProfilesCache/);
  assert.doesNotMatch(fn, /__contentProfilesPromise/);
});
