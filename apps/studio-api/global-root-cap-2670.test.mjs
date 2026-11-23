import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./migrations/20261123_global_workload_root_cap_2670.sql", import.meta.url),"utf8");

test("cross-host database root enforces max_active under normal and half-open states",()=>{
  assert.match(sql,/SELECT count\(\*\) INTO v_root_active FROM public\.studio_global_workload_leases/);
  assert.match(sql,/v_limit := v_root\.max_active/);
  assert.match(sql,/v_limit := 1/);
  assert.match(sql,/IF v_root_active >= v_limit THEN/);
  assert.match(sql,/database_capacity/);
  assert.match(sql,/database_half_open/);
});
test("foreign lease and expired owner protection survive root arbitration",()=>{
  assert.match(sql,/WHERE scope=p_scope AND claim_key=p_claim_key/);
  assert.match(sql,/IF v_owner = p_fence THEN/);
  assert.match(sql,/lease_until<=v_now/);
  assert.match(sql,/lease_conflict/);
});
test("global RPC retains service role grants and no automatic activation",()=>{
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.studio_global_workload_acquire/);
  assert.match(sql,/TO service_role/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.platform_outputs|DO_NOT_PUBLISH\s*=|STUDIO_MAX_PRODUCER_JOBS\s*=/i);
});
