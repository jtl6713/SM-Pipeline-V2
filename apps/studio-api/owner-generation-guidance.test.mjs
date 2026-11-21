import test from "node:test";
import assert from "node:assert/strict";
import {
  ownerGenerationSettingName, parseOwnerGenerationGuidance, validateOwnerGenerationPrompt,
  effectiveGenerationLayers, effectiveGenerationPrompt,
} from "./owner-generation-guidance.mjs";

test("owner keys are scoped and reject arbitrary names", () => {
  assert.equal(ownerGenerationSettingName("rec12345678901234"), "Studio_Owner_Generation_rec12345678901234");
  assert.notEqual(ownerGenerationSettingName("rec12345678901234"), ownerGenerationSettingName("rec12345678901235"));
  for (const id of ["", "global", "rec123", "rec12345678901234/../else"]) {
    assert.throws(() => ownerGenerationSettingName(id), /organization/);
  }
});

test("owner guidance is parsed defensively and strips invalid metadata", () => {
  assert.deepEqual(parseOwnerGenerationGuidance("not-json"), { prompt: "", revision: "0", updated_at: null, updated_by: null });
  assert.equal(parseOwnerGenerationGuidance(JSON.stringify({ prompt: "Be concise", revision: "2", updated_at: "now", updated_by: "admin" })).prompt, "Be concise");
  assert.equal(validateOwnerGenerationPrompt("  Plain text  "), "Plain text");
  assert.throws(() => validateOwnerGenerationPrompt("a".repeat(4001)), /at most/);
  assert.throws(() => validateOwnerGenerationPrompt(null), /text/);
});

test("global comes before profile before generation-type before item; empty layers are omitted", () => {
  const options = {ownerGlobal: "owner", profileWide: "profile", generationType: "thumbnail", itemSpecific: "clock"};
  assert.deepEqual(effectiveGenerationLayers(options).map(l => l.source), [
    "owner-global", "profile-every-generation", "generation-type", "item-specific",
  ]);
  const full = effectiveGenerationPrompt(options);
  assert.ok(full.indexOf("\\nowner\\n") < full.indexOf("\\nprofile\\n"));
  assert.ok(full.indexOf("\\nprofile\\n") < full.indexOf("\\nthumbnail\\n"));
  assert.ok(full.indexOf("\\nthumbnail\\n") < full.indexOf("\\nclock"));
  assert.equal(effectiveGenerationPrompt({ownerGlobal: "", profileWide: "profile"}), "[Selected profile / every generation]\nprofile");
});
