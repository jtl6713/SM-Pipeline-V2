import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("video Production requests ignore irrelevant carousel count validation", async () => {
  const source = readStudioWorkerSource();
  const start = source.indexOf("async function cleanProductionRequestPayload");
  const end = source.indexOf("function productionRequestFields", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /slideCountApplies = \["Carousel", "Photo Set", "Feed Post"\]\.includes\(contentType\)/);
  assert.match(handler, /carouselSlideCountMode = slideCountApplies/);
  assert.match(handler, /if \(slideCountApplies\) \{/);
});

test("Studio UI does not derive carousel slide count from source assets for video", async () => {
  const source = await readFile(path.join(here, "..", "studio-web", "assets", "app-item4-1008.js"), "utf8");
  const start = source.indexOf("function productionRequestPayload");
  const end = source.indexOf("function mergeProductionRequestRecord", start);
  assert.ok(start >= 0 && end > start);
  const payload = source.slice(start, end);
  assert.match(payload, /slideCountApplies = \["Carousel", "Photo Set", "Feed Post"\]/);
  assert.match(payload, /if \(!slideCountApplies\)/);
  assert.match(payload, /payload\.carousel_slide_count_mode = "AI decides"/);
});
