import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../.github/workflows/deploy-cloudflare-worker-production.yml", import.meta.url), "utf8");

test("Factory rollout-only probe is read-only, policy-backed and precedes R2 history traversal", () => {
  const start = source.indexOf("export async function factoryBatchStatusRoute(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:factoryBatchStatusRoute__*/", start);
  assert.ok(start >= 0 && end > start);
  const route = source.slice(start, end);
  assert.match(route, /url\.searchParams\.get\("rollout_only"\) === "1"/);
  assert.match(route, /activity_status: "not_measured"/);
  assert.match(route, /rollout: rollout|rollout, global_rollout/);
  assert.ok(route.indexOf('url.searchParams.get("rollout_only")') < route.indexOf("await Promise.all(["));
  const probe = route.slice(route.indexOf('if (url.searchParams.get("rollout_only")'), route.indexOf('    // Exact-id recovery'));
  assert.doesNotMatch(probe, /factoryBatchListGlobal|factoryApprovalGroupList|env\.STUDIO_MEDIA|await /);
});

test("production probe verifies rollout policy and never prints fabricated Factory counts", () => {
  assert.match(workflow, /globalCanary \? "\/api\/factory\/approval-batches\?scope=all&rollout_only=1"/);
  assert.match(workflow, /\.rollout_only==true and \.activity_status=="not_measured"/);
  assert.match(workflow, /factory_global_progress_snapshot=.*not_measured/);
  assert.match(workflow, /factory_active_backlog.*not_measured/);
  assert.match(workflow, /FAILED_OUTPUT_URL=/);
});
