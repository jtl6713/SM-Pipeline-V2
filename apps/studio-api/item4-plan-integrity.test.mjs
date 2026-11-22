import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { item4EffectivePlanStatus, item4DestinationParity } from "./item4-plan-integrity.mjs";

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


test("#2574 plan Ready requires persisted, unique enabled platform destinations", () => {
  const plan = [
    { platform: "Instagram", output_type: "Reel" },
    { platform: "Facebook", output_type: "Multi-Image Post" },
  ];
  const instagram = { ...plan[0], enabled: true };
  const facebook = { ...plan[1], enabled: true };
  assert.deepEqual(item4DestinationParity(plan, []).missing, ["Instagram::Reel", "Facebook::Multi-Image Post"]);
  assert.equal(item4DestinationParity(plan, []).ok, false);
  assert.equal(item4DestinationParity(plan, [instagram]).ok, false);
  assert.equal(item4DestinationParity(plan, [instagram, { ...facebook, enabled: false }]).ok, false);
  assert.equal(item4DestinationParity(plan, [instagram, facebook]).ok, true);
  assert.deepEqual(item4DestinationParity(plan, [instagram, instagram, facebook]).duplicates, ["Instagram::Reel"]);
  assert.equal(item4DestinationParity(plan, [instagram, facebook,
    { platform: "YouTube", output_type: "Short", enabled: true }]).ok, false);
});
test("#2574 producer verifies committed destinations before saving Plan Ready", async () => {
  const one = await readFile(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const fn = one.slice(one.indexOf("export async function item4SyncPlanOutputs("),
    one.indexOf("/*__STUDIO_WORKER_END:item4SyncPlanOutputs__*/"));
  assert.match(fn, /item4DestinationParity\(uniqueItems, committedRows/);
  assert.match(fn, /throw new HttpError\(503/);
  const build = one.slice(one.indexOf("export async function buildItem4OutputPlan("),
    one.indexOf("/*__STUDIO_WORKER_END:buildItem4OutputPlan__*/"));
  assert.ok(build.indexOf("await item4SyncPlanOutputs(") < build.indexOf("Studio_Output_Plan_Status:needsReview"));
  const four = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const finish = four.slice(four.indexOf("export async function finishAutonomousProductionRequest("),
    four.indexOf("/*__STUDIO_WORKER_END:finishAutonomousProductionRequest__*/"));
  assert.match(finish, /originalUntouchedDraft/);
  assert.match(finish, /await item4SyncPlanOutputs\(env, latest, savedPlan.items\)/);
  assert.ok(finish.indexOf("await item4SyncPlanOutputs(env, latest, savedPlan.items)")
    < finish.indexOf("const continueAfterPlan = async"));
});
