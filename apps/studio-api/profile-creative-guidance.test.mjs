import test from "node:test";
import assert from "node:assert/strict";
import { creativeSettingName, parseCreativeGuidance, validateCreativeGuidancePatch } from "./profile-creative-guidance.mjs";

test("creative guidance is scoped by exact profile record id", () => {
  const chicago = creativeSettingName("rec12345678901234");
  const miami = creativeSettingName("rec98765432109876");
  assert.notEqual(chicago, miami);
  assert.throws(() => creativeSettingName(""), /Invalid/);
  assert.throws(() => creativeSettingName("rec1234\"}"), /Invalid/);
});
test("partial patch preserves other creative instructions", () => {
  const before = { shared_direction: "Documentary", thumbnail_instructions: "Use gold", narration_instructions: "Calm guide" };
  assert.deepEqual(validateCreativeGuidancePatch({ narration_instructions: "Lively" }, before), {
    shared_direction: "Documentary", thumbnail_instructions: "Use gold", narration_instructions: "Lively",
  });
});
test("rejects unrecognized and overlong settings, tolerates legacy blanks", () => {
  assert.throws(() => validateCreativeGuidancePatch({ platform: "TikTok" }), /Expected only/);
  assert.throws(() => validateCreativeGuidancePatch({ shared_direction: "x".repeat(4001) }), /no longer/);
  assert.deepEqual(parseCreativeGuidance("not json"), {
    shared_direction: "", thumbnail_instructions: "", narration_instructions: "",
  });
});
