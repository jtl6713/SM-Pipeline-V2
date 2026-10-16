import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const source = fs.readFileSync(fileURLToPath(new URL("./worker-functions-02.mjs", import.meta.url)), "utf8");
test("video with source master bypasses implicit AI frame generation", () => {
  assert.match(source, /if \(!explicitAiAdd && !reset && videoPackage && manualCount > 0/);
  assert.match(source, /origin\.inputKind !== "mixed" && !origin\.aiCount/);
  assert.match(source, /reused_source_master: true/);
});
test("explicit creative prompt does not also call AI theme generation", () => {
  assert.match(source, /if \(!promptGuidance\) \{\s*try \{\s*themes = await item4RequestAiSlideThemes/);
});
