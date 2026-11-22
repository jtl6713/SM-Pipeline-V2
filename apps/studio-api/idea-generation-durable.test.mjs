import assert from "node:assert/strict";
import test from "node:test";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const source = readStudioWorkerSource();
const section = (name, next) => {
  const start = source.indexOf("async function " + name + "(");
  assert.notEqual(start, -1, name + " missing");
  return source.slice(start, next ? source.indexOf("async function " + next + "(", start + 1) : start + 7000);
};

test("manual I1 opts into persistent runner before legacy waitUntil", () => {
  const body = section("startStudioIdeaGeneration", "studioIdeaGenerationStatus");
  const dispatch = body.indexOf('fetch(runnerUrl + "/jobs/i1-durable"');
  const legacy = body.indexOf("ctx.waitUntil(finish()");
  assert.ok(dispatch > 0 && dispatch < legacy);
  assert.match(body, /STUDIO_I1_DURABLE_JOBS/);
  assert.match(body, /AbortSignal\.timeout\(10000\)/);
  assert.match(body, /response\.status !== 202/);
  assert.match(body, /dispatch_unconfirmed: true/);
  assert.match(body, /X-Pipeline-Secret/);
});

test("durable I1 does not falsely expire on the 15-minute legacy timeout", () => {
  const body = section("studioIdeaGenerationStatus", "chicagoNowParts");
  assert.ok(body.includes('!["1", "true"].includes(String(env.STUDIO_I1_DURABLE_JOBS'));
  assert.match(body, /ageMs > 15 \* 60 \* 1000/);
});

test("legacy I1 behavior remains behind disabled-by-default rollout flag", () => {
  const body = section("startStudioIdeaGeneration", "studioIdeaGenerationStatus");
  assert.match(body, /if \(durableI1\)/);
  assert.match(body, /ctx\.waitUntil\(finish\(\)/);
  assert.match(body, /backend: "python"/);
});

test("Supabase-only manual generation skips legacy profile override writes and cleanup", () => {
  const guard = 'if (studioWriteSource(env) === "supabase") return null;';
  const set = section("studioIdeaSetProfileOverrides", "studioIdeaClearProfileOverrides");
  const clear = section("studioIdeaClearProfileOverrides");
  for (const body of [set, clear]) {
    assert.ok(body.includes(guard), "Supabase-only profile bypass must be explicit");
    assert.ok(body.indexOf(guard) < body.indexOf("airtableFetch("),
      "Must return before attempting legacy Content Profile PATCH");
  }
  const manual = section("startStudioIdeaGeneration", "studioIdeaGenerationStatus");
  assert.ok(manual.indexOf("await studioIdeaCreateBatch(") <
    manual.indexOf("await studioIdeaSetProfileOverrides("));
  assert.match(manual, /batch_record_id: batch\.id/);
  assert.match(manual, /requested_count: count/);
  assert.match(manual, /\bquality\b/);
});
