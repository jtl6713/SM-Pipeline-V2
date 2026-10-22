import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFactoryGlobalRolloutHealth } from "./factory-global-rollout-health.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
const workflow = readFileSync(path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");

test("global Factory rollout deployment health uses one bounded R2 LIST, never job/history GET", async () => {
  const calls = [];
  const bucket = {
    async list(args) {
      calls.push(args);
      return { objects: [{ key: "studio/state/factory-approvals/v2/groups/sample.json" }], truncated: true };
    },
    async get() { throw new Error("must not read group or child body"); },
    async put() { throw new Error("must never mutate durable state"); },
  };
  const signed = { enabled: true, stage: "expanded", max_total: 20, max_per_profile: 10 };
  const result = await readFactoryGlobalRolloutHealth(bucket, {
    rollout: { enabled: false },
    globalRollout: signed,
  });
  assert.deepEqual(calls, [{
    prefix: "studio/state/factory-approvals/v2/groups/", limit: 1,
  }]);
  assert.equal(result.ok, true);
  assert.equal(result.scope, "all");
  assert.equal(result.status_only, true);
  assert.equal(result.read_only, true);
  assert.equal(result.history_checked, false);
  assert.equal(result.storage_probe.ok, true);
  assert.equal(result.storage_probe.bounded, true);
  assert.equal(result.storage_probe.listed, 1);
  assert.equal(result.global_rollout, signed);
  assert.equal(result.approvals_enabled, true);
  assert.equal(result.totals, undefined, "do not fabricate Factory history metrics");
  assert.equal(result.batches, undefined, "do not fabricate zero active batches");
});

test("global Factory rollout health fails closed for missing or unreadable durable storage", async () => {
  await assert.rejects(readFactoryGlobalRolloutHealth(null, {}), /R2 binding/);
  await assert.rejects(readFactoryGlobalRolloutHealth({
    async list() { throw new Error("R2 unavailable"); },
  }, {}), /R2 unavailable/);
  await assert.rejects(readFactoryGlobalRolloutHealth({
    async list() { return { objects: [{}, {}] }; },
  }, {}), /invalid data/);
  const empty = await readFactoryGlobalRolloutHealth({
    async list() { return { objects: [] }; },
  }, { rollout: { enabled: false }, globalRollout: { enabled: false } });
  assert.equal(empty.storage_probe.listed, 0);
  assert.equal(empty.approvals_enabled, false);
});

test("production rollout canary verifies live signed policy without triggering full global ledger traversal", () => {
  const start = worker.indexOf("export async function factoryBatchStatusRoute(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:factoryBatchStatusRoute__*/", start);
  assert.ok(start > 0 && end > start);
  const route = worker.slice(start, end);
  assert.ok(route.indexOf('status_only") === "1"') < route.indexOf("factoryBatchListGlobal("));
  assert.match(route, /readFactoryGlobalRolloutHealth\(env\.STUDIO_MEDIA/);
  assert.match(workflow, /globalCanary \? "\/api\/factory\/approval-batches\?scope=all&status_only=1"/);
  assert.match(workflow, /\.status_only==true and \.read_only==true and \.history_checked==false/);
  assert.match(workflow, /\.storage_probe\.ok==true and \.storage_probe\.bounded==true/);
  assert.match(workflow, /\.global_rollout\.allowed_output_types_by_platform/);
  assert.match(workflow, /factory_global_read_only_canary=PASS signed_stage/);
});
