import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = await readFile(path.join(here, "assets", "app-item4-1008.js"), "utf8");
const html = await readFile(path.join(here, "index.html"), "utf8");

test("existing Production requests use saved platforms instead of hidden EZ defaults", () => {
  assert.match(app, /function item4SavedPlatformAuthority\(record = activeProductionRequest\)/);
  assert.match(app, /activeProductionRequest\?\.id && ezEntryPath !== "content" && !ezStarting/);
  assert.match(app, /const saved = item4SavedPlatformAuthority\(activeProductionRequest\)/);
});

test("EZ platform controls are hydrated from the saved request and output matrix", () => {
  assert.match(app, /function item4HydrateEzPlatforms\(platforms\)/);
  assert.match(app, /item4HydrateEzPlatforms\(recordPlatforms\);\s*setSelectValue\("prContentType"/);
  assert.match(app, /syncLegacyPlatformsFromOutputMatrix\(\)[\s\S]*item4HydrateEzPlatforms\(\[\.\.\.selectedPlatforms\]\)/);
});

test("existing configure-mode planning preserves selected or saved destinations", () => {
  assert.match(app, /function ezPlanPlatforms\(count, selected\)/);
  assert.match(app, /activeProductionRequest\?\.id && ezEntryPath !== "content" && !ezStarting/);
  assert.match(app, /const authoritative = \(Array\.isArray\(selected\) && selected\.length\)[\s\S]*item4SavedPlatformAuthority\(activeProductionRequest\)/);
  assert.match(app, /applyEzPlanOverrides\(count, authoritative\);\s*return authoritative;/);
});

test("YouTube-only saved Longform clip requests remain longform during hydration", () => {
  assert.match(app, /platforms\.length !== 1 \|\| platforms\[0\] !== "YouTube"/);
  assert.match(app, /String\(\$\("prContentType"\)\?\.value \|\| activeProductionRequest\?\.content_type \|\| ""\)\.trim\(\) === "Longform Video"/);
});

test("Studio build label and cache key stay aligned with the active bundle", () => {
  const build = app.match(/BUILD_ID = "item4-([^"]+)"/)?.[1];
  const uiBuild = html.match(/UI build (0\.6\.\d+)/)?.[1];
  assert.ok(build);
  assert.ok(uiBuild);
  assert.equal(uiBuild, "0.6.638");
  assert.ok(html.includes(`/assets/app-item4-1008.js?v=${build}`));
});
