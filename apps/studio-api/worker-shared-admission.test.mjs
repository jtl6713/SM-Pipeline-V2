import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runnerWorkerLease, startRunnerWorkerLeaseHeartbeat } from "./worker-shared-admission.mjs";

const idea = "recAAAAAAAAAAAAAA";
const token = "9c495032-b392-4ac1-a098-03289c530e88";
const env = { PIPELINE_RUNNER_URL: "https://runner.example.test", PIPELINE_RUNNER_SHARED_SECRET: "unit-test-secret" };
const response = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

test("fail closed if runner endpoint, secret or idea identity is absent", async () => {
  let called = false;
  const transport = async () => { called = true; return response(200, { ok: true, admitted: true }); };
  assert.equal((await runnerWorkerLease({}, "claim", idea, token, { transport })).admitted, false);
  assert.equal((await runnerWorkerLease(env, "claim", "invalid", token, { transport })).admitted, false);
  assert.equal((await runnerWorkerLease(env, "claim", idea, "wrong", { transport })).admitted, false);
  assert.equal(called, false);
});

test("remote claim requires exact server admission, retains idempotent owner payload", async () => {
  let count = 0;
  const result = await runnerWorkerLease(env, "claim", idea, token, {
    transport: async (url, options) => {
      count++;
      assert.equal(url, "https://runner.example.test/internal/workload/worker-lease");
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers["X-Pipeline-Secret"], "unit-test-secret");
      assert.deepEqual(JSON.parse(options.body), { action: "claim", idea_id: idea, token });
      return response(200, { ok: true, admitted: true });
    },
  });
  assert.deepEqual(result, { admitted: true });
  assert.equal(count, 1);
});

test("429, 5xx, invalid receipt and network errors never admit heavy work", async () => {
  const failures = [
    async () => response(429, { ok: true, admitted: false }),
    async () => response(503, { ok: false, error: "unavailable" }),
    async () => response(200, { ok: true }),
    async () => { throw Error("connection lost"); },
  ];
  for (const transport of failures) {
    const lease = await runnerWorkerLease(env, "claim", idea, token, { transport });
    assert.equal(lease.admitted, false);
  }
});

test("runner lease heartbeat renews only same owner and detects lost ownership", async () => {
  let renewals = 0;
  const healthy = startRunnerWorkerLeaseHeartbeat(env, idea, token, {
    heartbeatMs: 10,
    transport: async (_url, options) => {
      assert.equal(JSON.parse(options.body).token, token);
      renewals++;
      return response(200, { ok: true, admitted: true });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 45));
  healthy.assertOwned();
  await healthy.stop();
  assert.ok(renewals >= 1);
  const lost = startRunnerWorkerLeaseHeartbeat(env, idea, token, {
    heartbeatMs: 10,
    transport: async () => response(429, { ok: true, admitted: false }),
  });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.throws(() => lost.assertOwned(), /shared_workload_lease_lost/);
  await lost.stop();
});

test("Worker claims shared broker BEFORE durable R2 job; releases token in finally", () => {
  const source = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const start = source.indexOf('stage = "claim";');
  const stop = source.indexOf("const outcome =", start);
  const block = source.slice(start, stop);
  assert.ok(start > 0 && stop > start);
  assert.ok(block.indexOf('runnerWorkerLease(env, "claim"') < block.indexOf("readyProductionClaim(env.STUDIO_MEDIA"));
  assert.match(block, /if \(!admission\.admitted\) \{/);
  assert.match(block, /await runnerWorkerLease\(env, "release", lease\.job\.idea_id, owner\)/);
  assert.match(block, /startRunnerWorkerLeaseHeartbeat\(/);
});


test("broker diagnostics distinguish explicit capacity refusal from unsafe or uncertain results",async()=>{
  for(const [status,body,reason] of [
    [429,{ok:true,admitted:false},"capacity_or_circuit"],
    [429,{},"broker_unavailable"],
    [302,{},"broker_redirect_rejected"],
    [401,{},"broker_auth_denied"],
    [403,{},"broker_auth_denied"],
    [422,{},"broker_request_rejected"],
    [503,{},"broker_http_unavailable"],
    [200,{ok:true},"broker_receipt_invalid"]
  ]){
    const out=await runnerWorkerLease(env,"claim",idea,token,{transport:async(_url,opts)=>{
      assert.equal(opts.redirect,"manual");
      return response(status,body);
    }});
    assert.deepEqual(out,{admitted:false,reason,http_status:status});
  }
  const timeout=await runnerWorkerLease(env,"claim",idea,token,{transport:async()=>{const e=new Error("private");e.name="TimeoutError";throw e;}});
  assert.deepEqual(timeout,{admitted:false,reason:"broker_timeout"});
});
