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
  assert.match(source, /AI images can only be generated while this request is editable/);
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


test("deleting an AI master disables automatic regeneration and clears stale links", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function deleteItem4MasterAsset");
  const end = source.indexOf("async function uploadItem4ClipPoster", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /deletedAiAsset/);
  assert.match(handler, /Carousel_Image_Mode = "Manual Upload"/);
  assert.match(handler, /ez-ai-auto=off/i);
  assert.match(handler, /ez-photo-wait=off|withProductionPhotoWaitManual/);
  assert.match(handler, /Studio_Master_Media_Assets/);
  assert.match(handler, /Studio_Platform_Variant_Assets:\s*\[\]/);
});


test("Production AI inherits the Production profile and reuses Asset Manager numbering", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function generateItem4PreProductionAiMaster");
  const end = source.indexOf("async function item4SeedAiCarouselSlides", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /body\?\.asset_name_base/);
  assert.match(handler, /item4ProductionProfileRecord\(env, record, preferredProfileId\)/);
  assert.match(handler, /mediaAssetProfileScopeFormula\(productionProfile\.id/);
  assert.match(handler, /listLibraryBatchExistingNames\(env, assetBase, profileScope\)/);
  assert.match(handler, /allocateLibraryBatchNames\(assetBase, 1/);
  assert.match(handler, /library_asset_name:\s*assetName/);
  assert.match(handler, /content_profile_id:\s*productionProfile\.id/);

  const createStart = source.indexOf("async function item4CreateMasterMediaAsset");
  const createEnd = source.indexOf("async function item4SanitizeStudioImageMediaAsset", createStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  const creator = source.slice(createStart, createEnd);
  assert.match(creator, /asset\?\.library_asset_name/);
  assert.match(creator, /Content_Profile:\s*\[profileId\]/);
});

test("Production profile resolution falls back to the linked Idea", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function item4ProductionProfileRecord");
  const end = source.indexOf("function studioAssetHasChicagoWatermark", start);
  assert.ok(start >= 0 && end > start);
  const resolver = source.slice(start, end);

  assert.match(resolver, /Idea_Candidate/);
  assert.match(resolver, /Content_Profile/);
  assert.match(resolver, /Production Requests do not currently carry a Content_Profile field/);
});

test("background master reconciliation cannot resurrect a deleted Production asset", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function item4ReconcileMasterAuthority");
  const end = source.indexOf("async function item4UpdateRequestState", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /Re-read the operator's current manifest before committing reconciliation/);
  assert.match(handler, /latestRecord = await airtableFetch/);
  assert.match(handler, /latestAssets = item4AssetManifest\(latestRecord\)/);
  assert.match(handler, /processedById/);
  assert.match(handler, /reconciledAssets = latestAssets\.map/);
  assert.match(handler, /Studio_Master_Assets_JSON:\s*JSON\.stringify\(reconciledAssets\)/);
});

test("an AI delete that lands during image generation wins before commit", async () => {
  const source = await readFile(workerPath, "utf8");
  const start = source.indexOf("async function generateItem4PreProductionAiMaster");
  const end = source.indexOf("async function item4SeedAiCarouselSlides", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);

  assert.match(handler, /latestBeforeAiCommit/);
  assert.match(handler, /aiDeleteDuringGeneration/);
  assert.match(handler, /ez-ai-auto=off/i);
  assert.match(handler, /cancelled:\s*true/);
});
