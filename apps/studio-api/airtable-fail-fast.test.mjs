import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("Worker health advertises footer-health-fast build", () => {
  assert.match(worker, /version: "0\.10\.522-approve-enqueue-fast"/);
});

test("Airtable 429 records cooldown but does not sleep in-request", () => {
  const fetchFn = worker.slice(
    worker.indexOf("async function airtableFetch"),
    worker.indexOf("const AIRTABLE_BATCH_LIMIT")
  );
  assert.match(worker, /AIRTABLE_SLOT_FAIL_FAST_MS/);
  assert.match(worker, /Airtable cooling down/);
  assert.match(fetchFn, /Airtable rate limited; failing fast/);
  assert.doesNotMatch(fetchFn, /await sleepMs\(cooldown\)/);
  assert.doesNotMatch(fetchFn, /backing off/);
  assert.doesNotMatch(fetchFn, /for \(let attempt = 1;/);
});
