import test from "node:test";
import assert from "node:assert/strict";
import { applyManualClassification, effectiveClassification, validateClassificationPatch } from "./manual-classification.mjs";

test("manual overrides survive a later AI reclassification", () => {
  const changed = applyManualClassification({ ai: { city: "Chicago" }, patch: { city: "Miami" }, mode: "override", actor: "editor", at: "2026-11-08T21:00:00Z" });
  assert.equal(effectiveClassification({ city: "New York" }, changed.manual).city, "Miami");
  assert.equal(changed.audit.source, "manual");
});
test("additive tags preserve AI tags and deduplicate case insensitively", () => {
  const r = applyManualClassification({ ai: { keywords: ["Lake", "Skyline"] }, patch: { keywords: ["lake", "Bridge"] }, actor: "editor", at: "2026-11-08T21:00:00Z" });
  assert.deepEqual(r.manual.keywords, ["Lake", "Skyline", "Bridge"]);
});
test("override can explicitly clear a classification", () => {
  const r = applyManualClassification({ ai: { keywords: ["Lake"] }, patch: { keywords: [] }, mode: "override", actor: "editor", at: "2026-11-08T21:00:00Z" });
  assert.deepEqual(r.effective.keywords, []);
});
test("reject unknown fields and invalid values", () => {
  assert.throws(() => validateClassificationPatch({ published: true }));
  assert.throws(() => validateClassificationPatch({ keywords: "not an array" }));
  assert.throws(() => validateClassificationPatch({ city: "x".repeat(121) }));
});
