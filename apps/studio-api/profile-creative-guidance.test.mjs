import test from "node:test";
import assert from "node:assert/strict";
import { creativeSettingName, parseCreativeGuidance, resolveCreativeGuidance, validateCreativeGuidancePatch } from "./profile-creative-guidance.mjs";

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

test("inherited Airtable prompt text populates selected profile without leaking another city's style", () => {
  const chicago = resolveCreativeGuidance({
    profile: { Brand_Voice: "Chicago upbeat guide" },
    brand: { Thumbnail_Style_Guidelines: "Chicago photorealistic gold headlines", Brand_Personality: "Chicago locally curious" },
    persona: { Tone_Guidelines: "Warm tone", Pacing_Guidelines: "Short opening" },
  });
  const miami = resolveCreativeGuidance({
    profile: { Brand_Voice: "Miami relaxed guide" },
    brand: { Brand_Personality: "Miami warm" },
    persona: { Tone_Guidelines: "Warm tone" },
  });
  assert.match(chicago.creative.thumbnail_instructions, /gold headlines/);
  assert.equal(chicago.creative.narration_instructions, "Chicago upbeat guide");
  assert.equal(chicago.sources.thumbnail_instructions.label, "Brands · Thumbnail_Style_Guidelines");
  assert.equal(miami.creative.narration_instructions, "Miami relaxed guide");
  assert.doesNotMatch(JSON.stringify(miami), /Chicago/);
  assert.equal(miami.creative.thumbnail_instructions, "");
});
test("saved per-profile edits override database guidance without mutating shared source", () => {
  const brand = { Thumbnail_Style_Guidelines: "Original shared brand rule" };
  const result = resolveCreativeGuidance({
    saved: { thumbnail_instructions: "Selected profile override" },
    brand,
  });
  assert.equal(result.creative.thumbnail_instructions, "Selected profile override");
  assert.equal(result.sources.thumbnail_instructions.inherited, false);
  assert.equal(brand.Thumbnail_Style_Guidelines, "Original shared brand rule");
});
