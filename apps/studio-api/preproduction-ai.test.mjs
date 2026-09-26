import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, "worker.js");

test("Worker exposes pre-production AI master generation route", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /generate-ai-masters/);
  assert.match(source, /async function generateItem4PreProductionAiMaster/);
  assert.match(source, /AI images can only be generated before this request is promoted/);
  assert.match(source, /Carousel_Image_Mode/);
  assert.match(source, /Make AI Generated/);
  assert.match(source, /source:\s*"studio_ai_preproduction"/);
});

test("pre-production AI POST route is admitted by the global method allowlist", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /isProductionRequestAiMastersRoute && request\.method === "POST"/);
});

test("pre-production AI generation uses the pipeline runner image job", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /\/jobs\/studio-ai-image/);
  assert.match(source, /PIPELINE_RUNNER_URL/);
  assert.match(source, /PIPELINE_RUNNER_SHARED_SECRET/);
  assert.match(source, /item4RequestAiSlideThemes/);
  assert.match(source, /item4PreProductionAiContext/);
});

test("pre-production AI assets persist on the Production Request before approval", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function generateItem4PreProductionAiMaster");
  const end = source.indexOf("async function item4SeedAiCarouselSlides", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /Studio_Master_Assets_JSON/);
  assert.match(handler, /Studio_Master_Asset_Count/);
  assert.match(handler, /Studio_Master_Asset_Status/);
  assert.match(handler, /production_request:\s*mapProductionRequest\(record\)/);
  assert.match(handler, /completed:\s*generatedNow >= desiredAiCount/);
});


test("pre-production AI supports explicit additive targets without a Production asset-pool cap", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function generateItem4PreProductionAiMaster");
  const end = source.indexOf("async function item4SeedAiCarouselSlides", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /target_ai_count/);
  assert.match(handler, /add_ai_count/);
  assert.match(handler, /generated\.length \+ requestedAdd/);
  assert.doesNotMatch(handler, /A Production Request can contain at most/);
});

test("user prompt guidance takes priority while preserving Studio context", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function generateItem4PreProductionAiMaster");
  const end = source.indexOf("async function item4SeedAiCarouselSlides", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /body\?\.prompt_guidance/);
  assert.match(handler, /Primary user direction:/);
  assert.match(handler, /secondary to the user's direction/);
  assert.match(handler, /Avoid burned-in text unless the user explicitly asks for it/);
});

