import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = await readFile(path.join(here, "assets", "app-item4-1008.js"), "utf8");
const html = await readFile(path.join(here, "index.html"), "utf8");

test("Production plan state stays scoped to explicitly selected platforms", () => {
  assert.match(app, /function item4PlanOverridesForPlatforms\(platforms\)/);
  assert.match(app, /function item4ScopePlanStateToPlatforms\(platforms\)/);
  assert.match(app, /if \(allowed\.size && !allowed\.has\(row\.platform\)\) return false/);
  assert.match(app, /item4ScopePlanStateToPlatforms\(platforms\)/);
  assert.match(app, /overrides: activeOverrides/);
  assert.match(app, /extras: item4EnabledExtraPairs\(platforms\)/);
  assert.doesNotMatch(app, /overrides: item4PlanOverrides,\s*\n\s*extras: item4EnabledExtraPairs\(\)/);
});

test("Changing EZ platforms immediately removes and persists stale platform outputs", () => {
  assert.match(app, /const activePlatforms = ezSelectedPlatforms\(\);\s*item4ScopePlanStateToPlatforms\(activePlatforms\);/);
  assert.match(app, /if \(activeProductionRequest\?\.id && productionOutputMatrixLoaded\) \{\s*saveProductionRequestOutputs\(\)\.catch/);
});

test("YouTube Standard-only clip requests remain longform", () => {
  assert.match(app, /function item4YouTubeLongformSelected\(\)/);
  assert.match(app, /platforms\.length !== 1 \|\| platforms\[0\] !== "YouTube"/);
  assert.match(app, /row\.platform === "YouTube" && row\.output_type === "Standard Video"/);
  assert.match(app, /return item4YouTubeLongformSelected\(\) \? "Longform Video" : "Vertical Short Video"/);
});

test("Studio build and app cache key stay aligned after output scope authority changes", () => {
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  const uiBuild = html.match(/UI build (0\.6\.\d+)/)?.[1];
  assert.ok(build);
  assert.ok(uiBuild);
  assert.equal(uiBuild, "0.6.612");
  assert.ok(html.includes(`/assets/app-item4-1008.js?v=${build}`));
});
