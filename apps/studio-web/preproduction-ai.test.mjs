import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-0625.js");
const indexPath = path.join(here, "index.html");

test("pre-production AI images have their own Production UI", async () => {
  const [app, html] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);

  assert.match(html, /id="item4AiGenerationPanel"/);
  assert.match(html, /id="item4GenerateAiImages"/);
  assert.match(html, /id="item4RegenerateAiImages"/);
  assert.match(app, /\/generate-ai-masters/);
  assert.match(app, /maybeGenerateItem4AiImages\(status\)/);
  assert.match(app, /Review them below, then approve when you are happy/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.368-homepage-output-titles"/);
});

test("pure AI requests hide manual media while mixed requests keep it available", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /function item4AiOnlyRequestActive/);
  assert.match(app, /if \(\/ez-input=mixed\/i\.test\(notes\)\) return false/);
  assert.match(app, /const aiOnly = item4AiOnlyRequestActive\(activeProductionRequest\)/);
  assert.match(app, /if \(aiOnly\) \{/);
  assert.match(app, /const mixedAi = ai && !aiOnly/);
  assert.match(app, /"Photos \+ AI Images"/);
});

test("mixed AI count uses requested AI slots rather than total slide count", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /parsed\?\.inputKind === "mixed" && Number\(parsed\?\.aiCount\) > 0/);
  assert.match(app, /const aiCount = assets\.filter\(\(asset\) => \/\^studio_ai\/i\.test/);
  assert.match(app, /aiCount >= target/);
});
