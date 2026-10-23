import test from "node:test";
import assert from "node:assert/strict";
import { validateProducerPlan, planSelectiveRework, validateRevisionDispatch } from "./conversational-producer-plan.mjs";

const inventory = [
  { id: "chicago-photo-1", profile_id: "chicago" },
  { id: "new-york-photo-1", profile_id: "new-york" },
];
const base = { original_prompt: "Use only my Chicago River uploads", profile_id: "chicago" };

test("required assets are grounded to real inventory; no silent substitution", () => {
  const result = validateProducerPlan({ ...base, required_asset_ids: ["missing"] }, inventory);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [{ code: "REQUIRED_ASSET_UNRESOLVED", asset_id: "missing" }]);
});

test("profile isolation and mutually exclusive media requirements", () => {
  const result = validateProducerPlan({ ...base, required_asset_ids: ["new-york-photo-1"], excluded_asset_ids: ["new-york-photo-1"] }, inventory);
  assert.deepEqual(result.errors.map((error) => error.code), ["CROSS_PROFILE_ASSET", "ASSET_REQUIRED_AND_EXCLUDED"]);
});

test("metadata-only changes never request an expensive render", () => {
  const plan = validateProducerPlan({ ...base, changes: ["metadata_only"] }, inventory);
  assert.equal(plan.valid, true);
  assert.deepEqual(planSelectiveRework(plan), {
    stages: ["metadata", "quality"], requires_render: false, requires_fresh_approval: true,
  });
});

test("multi-part visual revisions invalidate dependent work and preserve explicit locks", () => {
  const plan = validateProducerPlan({
    ...base, required_asset_ids: ["chicago-photo-1"], changes: ["add_photos", "add_clip", "adjust_timing"], preserve: ["opening_shot"],
  }, inventory);
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.plan.preserve, ["opening_shot"]);
  const rework = planSelectiveRework(plan);
  assert.equal(rework.requires_render, true);
  assert.deepEqual(rework.stages, ["media_selection", "timeline", "render", "quality", "audio_sync"]);
});

test("unapproved, stale, pending, held, or published revisions cannot dispatch", () => {
  const ready = { current_revision: "r2", job_revision: "r2", approved_revision: "r2", revision_pending: false, published: false, held: false };
  assert.equal(validateRevisionDispatch(ready).allowed, true);
  for (const patch of [
    { approved_revision: "r1" }, { job_revision: "r1" }, { revision_pending: true }, { published: true }, { held: true },
  ]) assert.equal(validateRevisionDispatch({ ...ready, ...patch }).allowed, false);
});
