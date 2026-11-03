import test from "node:test";
import assert from "node:assert/strict";
import { r4StartConfirmed, rotateR4CandidatesAfterCursor } from "./r4-queue-admission.mjs";

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
