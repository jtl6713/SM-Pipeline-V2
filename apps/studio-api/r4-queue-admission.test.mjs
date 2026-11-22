import test from "node:test";
import assert from "node:assert/strict";
import { r4StartConfirmed, rotateR4CandidatesAfterCursor, fairR4ProfileOrder } from "./r4-queue-admission.mjs";

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
  assert.match(source, /const \[cursorObject, profileObject\] = await Promise\.all\(/);
  assert.match(source, /env\.STUDIO_MEDIA\.get\(cursorKey\)/);
  assert.match(source, /env\.STUDIO_MEDIA\.get\(profileCursorKey\)/);
  assert.match(source, /cursorObject\.text\(\)/);
  assert.match(source, /profileObject\.text\(\)/);
  assert.doesNotMatch(source, /const cursor = await env\.STUDIO_MEDIA\.get\(cursorKey\)/);
});

test("completed render priorities must not disable durable Story queue rotation", () => {
  const rows = [{id:"old-head"},{id:"story-one"},{id:"story-two"}];
  const stale = {render_priority:["finished-a","finished-b"]};
  assert.deepEqual(rotateR4CandidatesAfterCursor(rows,"old-head",stale).map(x=>x.id),
    ["story-one","story-two","old-head"]);
  assert.deepEqual(rotateR4CandidatesAfterCursor(rows,"story-one",stale).map(x=>x.id),
    ["story-two","old-head","story-one"]);
  assert.equal(rotateR4CandidatesAfterCursor(rows,"old-head",{render_priority:["story-one"]}),rows);
});

test("R4 single-attempt operator fence applies only to live candidates", async () => {
  const {readFileSync} = await import("node:fs");
  const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url),"utf8");
  assert.match(source,/const eligibleAdmitIds = new Set/);
  assert.match(source,/controls\.render_priority\.some\(id => eligibleAdmitIds\.has/);
  assert.match(source,/const maxAttempts = manualPriority \? 1 : Math\.min\(4, queueOrder\.length\)/);
});

test("#2618 fair R4 admission alternates NYC and Miami, retaining source FIFO", () => {
  const row = (id, profile) => ({ id, fields: { Content_Profile: [profile] } });
  const entries = [
    row("miami1", "recMiami"), row("miami2", "recMiami"), row("miami3", "recMiami"),
    row("nyc1", "recNYC"), row("nyc2", "recNYC"), row("nyc3", "recNYC"),
  ];
  assert.deepEqual(fairR4ProfileOrder(entries, "recMiami").map(r => r.id),
    ["nyc1", "miami1", "nyc2", "miami2", "nyc3", "miami3"]);
  assert.deepEqual(fairR4ProfileOrder(entries, "recNYC").map(r => r.id),
    ["miami1", "nyc1", "miami2", "nyc2", "miami3", "nyc3"]);
  assert.deepEqual(fairR4ProfileOrder(entries, null).map(r => r.id),
    ["miami1", "nyc1", "miami2", "nyc2", "miami3", "nyc3"]);
  assert.deepEqual(entries.map(r => r.id),
    ["miami1", "miami2", "miami3", "nyc1", "nyc2", "nyc3"]);
});

test("#2618 operator priority and single-profile flows retain their original order", () => {
  const entries = [
    { id:"a", fields:{Content_Profile:["recMiami"]}},
    { id:"b", fields:{Content_Profile:["recNYC"]}},
    { id:"c", fields:{Content_Profile:["recMiami"]}},
  ];
  assert.equal(fairR4ProfileOrder(entries,"recMiami",{render_priority:["b"]}), entries);
  assert.equal(fairR4ProfileOrder(entries,"recMiami",{render_priority:["finished"]}).length,3);
  assert.deepEqual(fairR4ProfileOrder(entries,"recMiami",{render_priority:["finished"]}).map(x=>x.id), ["b","a","c"]);
  assert.deepEqual(fairR4ProfileOrder(entries.filter(x=>x.id!=="b"), "recMiami").map(x=>x.id), ["a","c"]);
});

test("#2618 Worker R4 uses profile fairness only after exact real job receipt", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const start = src.indexOf("export async function studioAdmitRenderQueue(");
  const end = src.indexOf("/*__STUDIO_WORKER_END:studioAdmitRenderQueue__*/",start);
  const body = src.slice(start,end);
  assert.match(body,/fairR4ProfileOrder\(admitCandidates, lastProfile, controls, f\)/);
  assert.match(body,/const profileCursorKey = "ops\/r4-last-confirmed-profile-v1"/);
  assert.match(body,/if \(r4StartConfirmed\(started\)\)/);
  const postConfirmation = body.slice(body.indexOf("if (r4StartConfirmed(started))"));
  assert.match(postConfirmation,/env\.STUDIO_MEDIA\.put\(profileCursorKey, startedProfile\)/);
  assert.doesNotMatch(body.slice(0,body.indexOf("if (r4StartConfirmed(started))")),
    /env\.STUDIO_MEDIA\.put\(profileCursorKey/);
});
