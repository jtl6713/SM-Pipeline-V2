import test from "node:test";
import assert from "node:assert/strict";
import { r4StartConfirmed, rotateR4CandidatesAfterCursor, hasEligibleManualRenderPriority } from "./r4-queue-admission.mjs";

test("HTTP 200 skipped or deferred Runner stage is never counted as Remotion admission", () => {
  for (const status of ["skipped", "deferred", "error"]) {
    assert.equal(r4StartConfirmed({stage:"r4", status, details:{run:{processed:false,reason:"waiting_for_voiceover"}}}), false);
  }
  assert.equal(r4StartConfirmed({stage:"r4", status:"ok", details:{run:{processed:false}}}), false);
  assert.equal(r4StartConfirmed({stage:"r4", status:"ok", details:{run:{processed:true}}}), false);
  assert.equal(r4StartConfirmed({status:"ok", details:{run:{processed:true,job_id:"job-1"}}}), false);
  assert.equal(r4StartConfirmed({stage:"r4", status:"ok", details:{run:{processed:true,job_id:"job-1"}}}), true);
});

test("skipped head rotates fairly and wraps without mutating candidate records", () => {
  const rows = [{id:"a"},{id:"b"},{id:"c"}];
  assert.deepEqual(rotateR4CandidatesAfterCursor(rows, "a").map(x=>x.id), ["b","c","a"]);
  assert.deepEqual(rotateR4CandidatesAfterCursor(rows, "c").map(x=>x.id), ["a","b","c"]);
  assert.deepEqual(rotateR4CandidatesAfterCursor(rows, "missing").map(x=>x.id), ["a","b","c"]);
  assert.deepEqual(rows.map(x=>x.id), ["a","b","c"]);
});

test("operator priority is never overridden by automatic skip cursor", () => {
  const rows = [{id:"priority"},{id:"other"}];
  assert.equal(rotateR4CandidatesAfterCursor(rows,"priority",{render_priority:["priority"]}),rows);
});

test("Studio R4 dispatcher gates success on the verified job receipt and bounds retries", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(r4StartConfirmed\(started\)\)/);
  assert.match(source, /Math\.min\(4, queueOrder\.length\)/);
  assert.match(source, /reason: "r4_launch_not_confirmed"/);
  assert.match(source, /safeSkippedReasons\.has\(skipReason\)/);
  assert.match(source, /env\.STUDIO_MEDIA\.put\(cursorKey, head\.id\)/);
});

test("Cloudflare R2 cursor object is decoded rather than passed as an object identity", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(source, /const cursorObject = await env\.STUDIO_MEDIA\.get\(cursorKey\)/);
  assert.match(source, /cursorObject\.text\(\)/);
  assert.doesNotMatch(source, /const cursor = await env\.STUDIO_MEDIA\.get\(cursorKey\)/);
});

test("eight finished manual priority ids must not disable Story fairness", () => {
  const rows = [{id:"rec9639"}, {id:"rec9715"}, {id:"rec9716"}, {id:"rec9720"}];
  const controls = {render_priority:[
    "recuKxiI6lAnDimw9","recGA0WXyWf2Uhqr4","reci4UlzzXUyqww48",
    "reckaWgYlB5WOwsiy","recrRQ2a0lvI6QgIx","recWyh2ypAQOpDU65",
    "recG8gLbBOBk7BMst","reclMyMCzOwWbqKA7",
  ]};
  assert.equal(hasEligibleManualRenderPriority(rows, controls), false);
  assert.deepEqual(rotateR4CandidatesAfterCursor(rows, "rec9639", controls).map(x=>x.id),
    ["rec9715","rec9716","rec9720","rec9639"]);
  assert.deepEqual(controls.render_priority, [
    "recuKxiI6lAnDimw9","recGA0WXyWf2Uhqr4","reci4UlzzXUyqww48",
    "reckaWgYlB5WOwsiy","recrRQ2a0lvI6QgIx","recWyh2ypAQOpDU65",
    "recG8gLbBOBk7BMst","reclMyMCzOwWbqKA7",
  ], "the read-only scheduler must not rewrite operator controls");
});
test("an actually eligible operator priority keeps deterministic single-head behavior", () => {
  const rows=[{id:"rec9639"},{id:"rec9715"}];
  const controls={render_priority:["rec9715","recAlreadyPublished"]};
  assert.equal(hasEligibleManualRenderPriority(rows,controls),true);
  assert.equal(rotateR4CandidatesAfterCursor(rows,"rec9639",controls),rows);
});
test("Worker only enforces a single attempt for a prioritized candidate actually in the queue", async () => {
  const {readFileSync}=await import("node:fs");
  const source=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  assert.match(source,/const manualPriority = hasEligibleManualRenderPriority\(queueOrder, controls\)/);
  assert.match(source,/const maxAttempts = manualPriority \? 1 : Math\.min\(4, queueOrder\.length\)/);
});
