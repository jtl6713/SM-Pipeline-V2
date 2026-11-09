import test from "node:test";
import assert from "node:assert/strict";
import { applyManualClassification, effectiveClassification, validateClassificationPatch, airtableAiClassification, parseManualClassification, parseClassificationAudit, appendClassificationAudit } from "./manual-classification.mjs";

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

test("maps legacy Airtable AI fields without mutating them", () => {
  const row = { fields: { Location: "Navy Pier", AI_Tags: "boat; skyline", Visible_Subjects: "people, bridge", Search_Keywords: "Chicago, lake", Weather: "Sunny", Shot_Type: "Wide" } };
  const classified = airtableAiClassification(row, "Chicago");
  assert.equal(classified.location, "Navy Pier");
  assert.deepEqual(classified.objects, ["boat", "skyline"]);
  assert.deepEqual(classified.subjects, ["people", "bridge"]);
  assert.equal(classified.scene_type, "Wide");
  assert.equal(row.fields.Location, "Navy Pier");
});
test("stored manual overrides deserialize and preserve AI precedence", () => {
  const manual = parseManualClassification('{"location":"Millennium Park","keywords":["sunset","skyline"]}');
  assert.equal(effectiveClassification({location:"Chicago"}, manual).location, "Millennium Park");
  assert.deepEqual(manual.keywords, ["sunset", "skyline"]);
  assert.throws(() => parseManualClassification("{not JSON"));
  assert.deepEqual(parseManualClassification(""), {});
});
test("audit records preserve actor, timestamp and before/after changes", () => {
  const result = applyManualClassification({ai:{weather:"Cloudy"},manual:{},patch:{weather:"Sunny"},actor:"recEditor123",at:"2026-11-08T20:00:00Z"});
  const history = appendClassificationAudit(parseClassificationAudit(""),result.audit);
  assert.equal(history[0].actor,"recEditor123");
  assert.equal(history[0].before.weather,"Cloudy");
  assert.equal(history[0].after.weather,"Sunny");
});
