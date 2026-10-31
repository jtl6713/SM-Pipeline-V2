import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import { ideaProducerDirection } from "./idea-producer-direction.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runInNewContext } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));

test("production draft falls back to Suggested_Platforms when explicit targets are absent", async () => {
  const worker = readStudioWorkerSource();
  const start = worker.indexOf("function productionRequestDefaultsFromIdea");
  const end = worker.indexOf("function suggestPrimaryLocationFromIdea", start);
  const fn = worker.slice(start, end);
  assert.match(fn, /Production_Target_Platforms/);
  assert.match(fn, /if \(productionPlatforms\.length\) return productionPlatforms/);
  assert.match(fn, /PR_PLATFORMS\.has\(platform\)/);
  assert.match(fn, /Suggested_Platforms/);
});


test("legacy output-style platform labels normalize to Production platforms", async () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /\["youtube shorts", "YouTube"\]/i);
  assert.match(worker, /\["instagram reels", "Instagram"\]/i);
  assert.match(worker, /\["facebook reels", "Facebook"\]/i);
  assert.match(worker, /function canonicalProductionPlatform/);
  assert.match(worker, /canonicalProductionPlatforms\(platformsRaw\)/);
  assert.match(worker, /if \(productionPlatforms\.length\) return productionPlatforms/);
});


test("retired platform residue is filtered before bridge compatibility and promotion payloads", () => {
  const worker = readStudioWorkerSource();
  const compatibilityStart = worker.indexOf("function productionRequestCompatibilityIssues");
  const compatibilityEnd = worker.indexOf("function promotionThumbnailTriState", compatibilityStart);
  const compatibility = worker.slice(compatibilityStart, compatibilityEnd);
  assert.match(compatibility, /canonicalProductionPlatforms\(rawPlatforms\)\.filter\(\(platform\) => PR_PLATFORMS\.has\(platform\)\)/);

  const promotionStart = worker.indexOf("function promotionInputFromProductionRequest");
  const promotionEnd = worker.indexOf("function updateProductionRequestPromotionState", promotionStart);
  const promotion = worker.slice(promotionStart, promotionEnd);
  assert.match(promotion, /canonicalProductionPlatforms\(rawPlatforms\)\.filter\(\(platform\) => PR_PLATFORMS\.has\(platform\)\)/);
});

test("retired platform residue is hidden from API responses and ignored by bridge route validation", () => {
  const worker = readStudioWorkerSource();

  const mapStart = worker.indexOf("function mapProductionRequest");
  const mapEnd = worker.indexOf("function productionRequestRecordIdFromPath", mapStart);
  const mapped = worker.slice(mapStart, mapEnd);
  assert.match(mapped, /canonicalProductionPlatforms\(f\(record, "Target_Platforms"\) \|\| \[\]\)/);
  assert.match(mapped, /PR_PLATFORMS\.has\(String\(item\?\.platform \|\| ""\)\.trim\(\)\)/);

  const preflightStart = worker.indexOf("function item4SourceToProductionBridgePreflight");
  const preflightEnd = worker.indexOf("function productionRequestBridgePreflightRoute", preflightStart);
  const preflight = worker.slice(preflightStart, preflightEnd);
  assert.match(preflight, /rawPlanItems\.filter\(\(item\) =>/);
  assert.match(preflight, /PR_PLATFORMS\.has\(String\(f\(row, "Platform"\) \|\| ""\)\.trim\(\)\)/);
  assert.match(preflight, /manifestForActivePlan/);
});

test("current Studio backend contains no retired social-platform brand reference", () => {
  const worker = readStudioWorkerSource();
  assert.doesNotMatch(worker, /\bThreads\b/i);
});

test("legacy idea platforms cannot prevent Vizcaya's five-photo production draft", () => {
  const worker = readStudioWorkerSource();
  const start = worker.indexOf("function productionRequestDefaultsFromIdea");
  const end = worker.indexOf("function suggestPrimaryLocationFromIdea", start);
  const declaration = worker.slice(start, end);
  const defaultsFromIdea = runInNewContext(declaration + "\nproductionRequestDefaultsFromIdea", {
    f: (idea, name) => idea[name] ?? null,
    canonicalProductionPlatforms: (values) => [...new Set((Array.isArray(values) ? values : [])
      .map(value => ({ "YouTube Shorts": "YouTube" }[value] || value)))],
    PR_PLATFORMS: new Set(["Instagram", "Facebook", "TikTok", "YouTube", "X", "Lemon8"]),
    autonomousDefaultVoiceoverSeconds: () => 20,
    ideaProducerDirection,
    suggestPrimaryLocationFromIdea: () => ({ name: "Vizcaya Museum" }),
  });
  const vizcaya = {
    Production_Content_Type: "Photo Set",
    Production_Target_Platforms: [],
    Suggested_Platforms: ["Instagram", "Facebook", "Threads"],
    Production_Carousel_Slide_Count_Mode: "Target range",
    Production_Carousel_Slide_Count_Min: 5,
    Production_Carousel_Slide_Count_Max: 10,
    Production_Carousel_Image_Mode: "Manual Upload",
  };
  const inherited = defaultsFromIdea(vizcaya);
  assert.deepEqual(Array.from(inherited.platforms), ["Instagram", "Facebook"]);
  assert.equal(inherited.carousel_slide_count_min, 5);
  assert.equal(inherited.carousel_image_mode, "Manual Upload");

  const explicit = defaultsFromIdea({
    ...vizcaya,
    Production_Target_Platforms: ["Threads", "TikTok"],
  });
  assert.deepEqual(Array.from(explicit.platforms), ["TikTok"]);
  const fallback = defaultsFromIdea({
    ...vizcaya,
    Production_Target_Platforms: ["Threads"],
  });
  assert.deepEqual(Array.from(fallback.platforms), ["Instagram", "Facebook"]);

  // Explicit operator-supplied payloads remain strictly validated, rather
  // than silently changing a user's deliberate platform selection.
  assert.match(worker, /const invalidPlatforms = platforms.filter\(v => !PR_PLATFORMS.has\(v\)\)/);
  assert.match(worker, /Unsupported platform\(s\)/);
});
