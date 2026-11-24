import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readUiReleaseContract } from "./ui-release-contract.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const desk = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("owner reversal #2876: Factory contains no manual crop UI, asset, or event handler", () => {
  assert.doesNotMatch(html, /factoryCloseup|factory-closeup-quality|Show estimated center crop/i);
  assert.doesNotMatch(desk, /factoryCloseup|show estimated center crop|StudioFactoryCloseupQuality/);
  assert.match(html, /id="factoryPreviewImage"/);
  assert.match(desk, /function openFactoryPreview\(card\)/);
  assert.match(desk, /showFactoryNativeGallery/);
  assert.match(desk, /clearFactoryNativeGalleryControls/);
  assert.match(desk, /function closeFactoryPreview\(\)/);
});
test("reversal is newer than owner-rejected 0.6.1080 and cache contract is consistent", () => {
  const result = readUiReleaseContract(html, app);
  const [major, minor, patch] = result.version.split(".").map(Number);
  assert.ok(major > 0 || minor > 6 || (major === 0 && minor === 6 && patch >= 1081));
  assert.ok(result.cacheKey.startsWith(result.version + "-"));
  assert.equal(result.expectedBuildId, "item4-" + result.cacheKey);
});
