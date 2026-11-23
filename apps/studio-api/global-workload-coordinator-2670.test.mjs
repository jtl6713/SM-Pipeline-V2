import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {globalWorkloadEnabled, globalWorkloadRpc, globalWorkloadKey, startGlobalWorkloadHeartbeat} from "./global-workload-coordinator.mjs";

const cfg = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "a".repeat(64) };
const key = "a".repeat(64);
const fence = "00000000-0000-4000-8000-000000000000";

test("cross-host coordinator is explicitly OFF by default", async () => {
  assert.equal(globalWorkloadEnabled(cfg), false);
  const result = await globalWorkloadRpc(cfg, "acquire", {scope:"producer",key,fence}, {
    transport:()=>{throw Error("no network when disabled")}
  });
  assert.equal(result.enabled, false);
  assert.equal(result.accepted, false);
});

test("Worker and Python use same deterministic private SHA key shape", async () => {
  const value = await globalWorkloadKey("exact-output-rec12345678901234");
  assert.match(value, /^[a-f0-9]{64}$/);
  assert.ok(!value.includes("rec12345678901234"));
});

test("one bounded RPC admits only a confirmed receipt; transport uncertainty cannot replay", async () => {
  const env = {...cfg, STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED:"true"};
  let calls=0;
  const sender=async(url, options)=>{
    calls++;
    assert.match(url, /studio_global_workload_acquire$/);
    assert.equal(options.redirect, "error");
    assert.equal(JSON.parse(options.body).p_claim_key, key);
    return {ok:true,json:async()=>({accepted:true,replay:false,reason:"admitted"})};
  };
  const admitted=await globalWorkloadRpc(env,"acquire",{scope:"producer",key,fence},{transport:sender});
  assert.equal(admitted.accepted,true);
  assert.equal(calls,1);
  await assert.rejects(()=>globalWorkloadRpc(env,"acquire",{scope:"producer",key,fence}, {
    transport:()=>{throw Error("timeout")}
  }), /rpc_unconfirmed/);
});

test("stale ownership and bad receipts are fail-closed", async () => {
  const env = {...cfg, STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED:"true"};
  const denied=await globalWorkloadRpc(env,"acquire",{scope:"producer",key,fence}, {
    transport:async()=>({ok:true,json:async()=>({accepted:false,reason:"other_owner"})})
  });
  assert.equal(denied.accepted,false);
  await assert.rejects(()=>globalWorkloadRpc(env,"release",{scope:"producer",key,fence}, {
    transport:async()=>({ok:true,json:async()=>({accepted:true})})
  }),/boolean_receipt_invalid/);
});

test("migration uses a single transactional scope row and fenced expiring lease", () => {
  const sql = readFileSync(new URL("./migrations/20261123_global_workload_coordination_2670.sql",import.meta.url),"utf8");
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/owner_fence=p_fence/);
  assert.match(sql,/lease_until>v_now/);
  assert.match(sql,/recovery_probe_required=true/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public.studio_global_workload_acquire/);
});


test("global Worker heartbeat refuses anything except a confirmed fenced owner", () => {
  assert.throws(() => startGlobalWorkloadHeartbeat(cfg, null), /missing_admitted_owner/);
  assert.throws(() => startGlobalWorkloadHeartbeat(cfg, {
    enabled:true,accepted:false,scope:"producer",key,fence,
  }), /missing_admitted_owner/);
});

test("global Worker heartbeat renews exact claim and fails closed on owner loss", async () => {
  const env = {...cfg, STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED:"true"};
  const owner = {enabled:true,accepted:true,scope:"producer",key,fence};
  let count=0;
  const good = startGlobalWorkloadHeartbeat(env,owner,{
    heartbeatMs:10,
    ttlSeconds:600,
    transport:async(url,options)=>{
      assert.match(url,/studio_global_workload_renew$/);
      assert.deepEqual(JSON.parse(options.body),{
        p_scope:"producer",p_claim_key:key,p_fence:fence,p_ttl_seconds:600,
      });
      count++;
      return {ok:true,json:async()=>true};
    },
  });
  await new Promise(resolve=>setTimeout(resolve,45));
  good.assertOwned();
  await good.stop();
  assert.ok(count>=1);

  const lost=startGlobalWorkloadHeartbeat(env,owner,{
    heartbeatMs:10,ttlSeconds:600,
    transport:async()=>({ok:true,json:async()=>false}),
  });
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.throws(()=>lost.assertOwned(),/global_workload_lease_lost/);
  await lost.stop();
});

test("Worker global producer fence is default-off and precedes R2 claim", () => {
  const source=readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  const start=source.indexOf('stage = "claim";');
  const end=source.indexOf("const outcome =",start);
  const block=source.slice(start,end);
  assert.ok(start>0&&end>start);
  const broker=block.indexOf('runnerWorkerLease(env, "claim"');
  const enabled=block.indexOf("if (globalWorkloadEnabled(env))");
  const global=block.indexOf("await globalWorkloadAdmission(");
  const durable=block.indexOf("readyProductionClaim(env.STUDIO_MEDIA");
  assert.ok(broker>=0&&enabled>broker&&global>enabled&&durable>global);
  assert.match(block,/if \(!globalClaim\.accepted\)/);
  assert.match(block,/startGlobalWorkloadHeartbeat\(/);
  assert.match(block,/globalHeartbeat\?\.assertOwned\(\)/);
  assert.match(block,/verifiedProgress: false/);
  assert.match(block,/if \(!lease\) \{/);
});
