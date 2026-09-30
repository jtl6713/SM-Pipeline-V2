import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-0625.js");
const htmlPath = path.join(here, "index.html");

test("Production uses tabs instead of stacking the full workspace", async () => {
  const html = await readFile(htmlPath, "utf8");
  for (const tab of ["media", "formats", "rendering", "details"]) {
    assert.match(html, new RegExp(`data-production-workspace-tab="${tab}"`));
    assert.match(html, new RegExp(`data-production-workspace-panel="${tab}"`));
  }
  assert.match(html, /id="productionWorkspaceTabs"/);
});

test("Production exposes configurable still rendering controls", async () => {
  const html = await readFile(htmlPath, "utf8");
  for (const id of [
    "prRenderPreset",
    "prRenderMotion",
    "prRenderTransition",
    "prRenderTransitionDuration",
    "prRenderImageDurationMode",
    "prRenderImageDurationSeconds",
    "prRenderIntensity",
    "prRenderPacing",
    "prRenderFit",
    "prRenderBeatSync",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const preset of ["cinematic", "elegant", "energetic", "documentary", "minimal"]) {
    assert.match(html, new RegExp(`value="${preset}"`));
  }
});

test("Rendering settings persist inside Production Request notes without showing the directive", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /function parseProductionRenderSettings\(/);
  assert.match(app, /function stripProductionRenderSettings\(/);
  assert.match(app, /function mergeProductionRenderSettings\(/);
  assert.match(app, /\[render-settings\]/);
  assert.match(app, /production_notes:\s*mergeProductionRenderSettings/);
  assert.match(app, /hydrateProductionRenderSettings\(renderSettings\)/);
});
