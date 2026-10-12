import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

function sourceBetween(start, end) {
  const first = app.indexOf(start);
  const last = app.indexOf(end, first + start.length);
  assert.ok(first !== -1 && last > first, "Expected Studio source section: " + start);
  return app.slice(first, last);
}

test("Approve All status GET uses the same selected Content Profile as POST", () => {
  const scope = sourceBetween("function withStudioProfile(path)", "function activeNavPage()");
  assert.match(scope, /pathname === "\/api\/outputs\/approve-all"/);
  assert.match(scope, /params\.set\("profile", selectedProfileId\)/);
  const api = sourceBetween("async function api(path, options = {})", "function stateClass(value)");
  assert.match(api, /pathname === "\/api\/outputs\/approve-all"/);
  assert.match(api, /parsed\.content_profile_id = selectedProfileId/);
  const watcher = sourceBetween("async function pollPipelineApproveAllJob(jobId)", "function startPipelineApproveAllJobWatch(result)");
  assert.match(watcher, /api\(`\/api\/outputs\/approve-all\?job_id=/);
});

test("Group approval remains visibly pending until the polled batch is terminal", () => {
  const group = sourceBetween("async function approvePipelineContentGroup(groupKey, button = null)", "async function reviewActiveCreative(");
  assert.match(group, /pipelineApproveAllActiveGroupKey = groupKey/);
  assert.match(group, /startPipelineApproveAllJobWatch\(result\)/);
  assert.doesNotMatch(group, /startPipelineApproveAllJobWatch\(result\);\s*clearPipelineGroupApproveBusy\(\)/);
  const progress = sourceBetween("function applyPipelineApproveAllProgress(result", "async function pollPipelineApproveAllJob(jobId)");
  assert.match(progress, /pipelineApproveAllRunning = running/);
  assert.match(progress, /groupButton\.disabled = true/);
  assert.match(progress, /clearPipelineGroupApproveBusy\(\)/);
  const render = sourceBetween("const groupBusy = pipelineApproveAllRunning", "const nowMs = Date.now()",);
  assert.match(render, /groupBusy \|\| !groupReady\.length \? "disabled"/);
});
