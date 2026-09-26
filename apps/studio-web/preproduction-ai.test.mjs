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
  assert.match(app, /Add any quantity; the structure is only a recommendation/);
  assert.match(app, /BUILD_ID = "item4-\d+\.\d+\.\d+-[^"]+"/);
});

test("AI generation stays available alongside uploaded and library media", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /panel\.hidden = !editable/);
  assert.match(app, /currentAiCount \+ \(requestedAdditional \|\| 1\)/);
  assert.match(app, /uploaded and library assets will stay/);
  assert.doesNotMatch(app, /if \(aiOnly\) \{/);
});

test("mixed AI count uses requested AI slots rather than total slide count", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /parsed\?\.inputKind === "mixed" && Number\(parsed\?\.aiCount\) > 0/);
  assert.match(app, /const aiCount = assets\.filter\(\(asset\) => \/\^studio_ai\/i\.test/);
  assert.match(app, /aiCount >= target/);
});

test("Production AI description is sent as prompt guidance", async () => {
  const [app, html] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);

  assert.match(html, /id="item4AiPrompt"/);
  assert.match(html, /Describe what you want the AI image to be/);
  assert.match(app, /const promptGuidance = String\(\$\("item4AiPrompt"\)\?\.value \|\| ""\)\.trim\(\)/);
  assert.match(app, /prompt_guidance:\s*promptGuidanceText/);
  assert.match(app, /promptInput\.disabled = item4AiGenerationInFlight/);
});

