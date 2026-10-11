import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const start = worker.indexOf("async function createIdeaTimedScriptRoute(");
const end = worker.indexOf("\nasync function ", start + 25);
assert.ok(start >= 0 && end > start, "Idea timed-script route must exist");
const route = worker.slice(start, end);

test("repeated timed-script POST reuses linked saved timeline before AI or write", () => {
  assert.match(route, /QA-IDEA-TIMELINE-ORPHAN/);
  assert.match(route, /linkedProductionRequestIds/);
  assert.match(route, /Promise\.allSettled\(linkedProductionRequestIds\.map/);
  assert.match(route, /timedScriptFromNotes\(f\(record, "Production_Notes"\)\)/);
  assert.match(route, /reused_existing: true/);
  assert.match(route, /production_request: mapProductionRequest\(savedRequest\)/);
  assert.ok(route.indexOf("reused_existing: true") < route.indexOf("rankStillsForIdeaPhotoWait"),
    "saved-script check must precede new writing or asset replacement");
});

test("a failed linked-request lookup cannot silently regenerate a duplicate", () => {
  assert.match(route, /linked\.some\(\(entry\) => entry\.status === "rejected"\)/);
  assert.match(route, /throw new HttpError\(503, "An existing Production Request could not be checked/);
});

test("Worker version is incremented for deployed idempotency fix", () => {
  assert.match(worker, /version: "0.10.530-approve-publish-fast"/);
});
