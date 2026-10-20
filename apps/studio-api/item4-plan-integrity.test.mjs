import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { item4EffectivePlanStatus } from "./item4-plan-integrity.mjs";

const valid = { items: [{ platform: "Instagram", output_type: "Reel" }] };

test("P0 #907 Ready requires nonempty, structurally usable output items", () => {
  assert.deepEqual(item4EffectivePlanStatus("Ready", valid, "Draft"), {
    status: "Ready", invalid: false, issue: null,
  });
  for (const broken of [null, {}, { items: [] }, { items: [{}] },
    { items: [{ platform: "Instagram" }] }, { items: [{ output_type: "Reel" }] }]) {
    assert.deepEqual(item4EffectivePlanStatus("Ready", broken, "Draft"), {
      status: "Needs Plan", invalid: true, issue: "ready_plan_missing_output_items",
    });
    assert.deepEqual(item4EffectivePlanStatus("Ready", broken, "Promoted"), {
      status: "Needs Review", invalid: true, issue: "ready_plan_missing_output_items",
    });
  }
});

test("P0 #907 preserve non-Ready states and do not rewrite historic promoted outputs", () => {
  assert.equal(item4EffectivePlanStatus("Needs Review", null, "Draft").status, "Needs Review");
  assert.equal(item4EffectivePlanStatus("Needs Plan", null, "Draft").invalid, false);
  assert.equal(item4EffectivePlanStatus("Ready", valid, "Promoted").status, "Ready");
  assert.equal(item4EffectivePlanStatus("Ready", null, "Submitted").status, "Needs Review");
});

test("P0 #907 all relevant plan views fail closed without mutating reads", async () => {
  const one = await readFile(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const two = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  assert.match(one, /if \(!plannedItems\.length\)/);
  assert.match(one, /if \(!planItems\.length\) return \{/);
  const get = one.slice(one.indexOf("export async function getItem4OutputPlan("),
    one.indexOf("/*__STUDIO_WORKER_END:getItem4OutputPlan__*/"));
  assert.match(get, /item4EffectivePlanStatus\(/);
  assert.doesNotMatch(get, /item4UpdateRequestState|airtableBatchUpdate|airtableFetch\(.*PATCH/);
  assert.equal((two.match(/item4EffectivePlanStatus\(/g) || []).length, 3,
    "snapshot/full workspace and full Production Request must use strict validation");
  const light = two.slice(two.indexOf("export function mapProductionRequestLight("),
    two.indexOf("/*__STUDIO_WORKER_END:mapProductionRequestLight__*/"));
  assert.doesNotMatch(light, /item4ParseJson\(|JSON\.parse\(|Studio_Output_Plan_JSON/,
    "listing a Production Request must never parse or access heavy plan JSON");
});

