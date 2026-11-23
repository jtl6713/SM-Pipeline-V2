import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../../.github/workflows/i1-durable-worker-enable.yml", import.meta.url), "utf8");

test("I1 Worker secret release checks out the same runner source it verifies", () => {
  const checkout = workflow.indexOf("- uses: actions/checkout@v6");
  const expectedVersion = workflow.indexOf("EXPECTED=$(sed -n");
  const runnerHealth = workflow.indexOf("i1_durable_jobs==true");
  assert.ok(checkout >= 0, "a GitHub runner workspace is empty without checkout");
  assert.ok(expectedVersion > checkout, "version file must be available before it is read");
  assert.ok(runnerHealth > checkout, "fail closed on runner-side I1 proof");
});

test("durable Worker binding rollout remains a one-time guarded marker", () => {
  assert.match(workflow, /deploy\/i1-durable-worker-enable\.txt/);
  assert.match(workflow, /STUDIO_I1_DURABLE_JOBS/);
  assert.match(workflow, /\[\.result\.bindings\[\]\? \| select\(\.name==\"STUDIO_I1_DURABLE_JOBS\"\)\] \| length\)==0/);
  assert.match(workflow, /Roll back only the newly introduced I1 feature secret/);
});
