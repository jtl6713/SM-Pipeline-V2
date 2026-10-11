import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");
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
  assert.match(app, /in pool · add any quantity/);
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
  assert.match(html, /id="item4AiPrompt"/);
  assert.match(html, /item4-ai-generation-panel/);
  assert.match(html, />Prompt</);
  assert.match(app, /const promptGuidance = String\(\$\("item4AiPrompt"\)\?\.value \|\| ""\)\.trim\(\)/);
  assert.match(app, /prompt_guidance:\s*promptGuidanceText/);
  assert.match(app, /promptInput\.disabled = item4AiGenerationInFlight/);
});


test("manual AI asset deletion disables automatic top-up", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /ez-ai-auto=off/i);
  assert.match(app, /carousel_image_mode:\s*"Manual Upload"/);
  assert.match(app, /automatic && !item4AiGenerationRequestActive\(activeProductionRequest\)/);
});

test("pending Production deletes stay hidden during workspace refresh", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /item4PendingRemoves\.size && Array\.isArray\(next\.assets\)/);
  assert.match(app, /!item4PendingRemoves\.has\(String\(asset\?\.id \|\| ""\)\)/);
});


test("Production AI exposes Asset Manager sequential naming and sends the active profile", async () => {
  const [app, html] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);

  assert.match(html, /id="item4AiAssetBaseName"/);
  assert.match(html, /Asset Manager numbering applies/);
  assert.match(html, /item4-ai-generation-meta/);
  assert.match(app, /const assetNameBase = String\(\$\("item4AiAssetBaseName"\)\?\.value \|\| ""\)\.trim\(\)/);
  assert.match(app, /asset_name_base:\s*assetNameBaseText/);
  assert.match(app, /content_profile_id:\s*selectedProfileId/);
});

test("deleting an AI image cancels manual and automatic generation batches", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /const item4AiGenerationCancelled = new Set\(\)/);
  assert.match(app, /item4AiGenerationCancelled\.add\(requestId\)/);
  assert.match(app, /if \(item4AiGenerationCancelled\.has\(requestId\)\) break/);
  assert.match(app, /if \(!automatic\) item4AiGenerationCancelled\.delete\(requestId\)/);
  assert.match(app, /result\?\.cancelled \|\| item4AiGenerationCancelled\.has\(requestId\)/);
});


test("AI generate panel stays compact instead of drop-zone padding", async () => {
  const css = await readFile(path.join(here, "assets", "styles-phase7-0621.css"), "utf8");
  const html = await readFile(indexPath, "utf8");
  assert.match(html, /item4-ai-generation-panel/);
  assert.match(html, /item4-ai-generation-fields/);
  assert.match(css, /#page-content \.item4-ai-generation-panel\{/);
  assert.match(css, /min-height:0/);
  assert.match(css, /item4-ai-generation-meta/);
  assert.match(css, /min-height:56px/);
});
