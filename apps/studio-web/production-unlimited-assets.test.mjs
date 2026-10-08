import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");
const htmlPath = path.join(here, "index.html");

test("Production asset pool has no UI quantity ceiling", async () => {
  const [app, html] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(htmlPath, "utf8"),
  ]);

  assert.match(app, /function libraryPickerMaxCount\(\) \{[\s\S]*Number\.POSITIVE_INFINITY/);
  assert.match(app, /target_ai_count:\s*target/);
  assert.match(app, /currentAiCount \+ \(requestedAdditional \|\| 1\)/);

  const quantity = html.match(/<input id="item4AiAddCount"[^>]*>/)?.[0] || "";
  assert.ok(quantity, "AI quantity input should be present");
  assert.doesNotMatch(quantity, /\smax="/);
  assert.match(html, /item4UploadHint">Add as many as you want</);
  assert.doesNotMatch(html, /item4UploadHint">Up to 20</);
});


test("Production slide-count controls do not cap stills at 20", async () => {
  const html = await readFile(htmlPath, "utf8");
  for (const id of [
    "ezCarouselSlideExact",
    "ezCarouselSlideMin",
    "ezCarouselSlideMax",
    "prOverrideSlideExact",
    "prOverrideSlideMin",
    "prOverrideSlideMax",
    "prCarouselSlideExact",
    "prCarouselSlideMin",
    "prCarouselSlideMax",
    "promoteCarouselSlideCount",
    "promoteCarouselSlideMin",
    "promoteCarouselSlideMax",
  ]) {
    const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] || "";
    assert.ok(input, `${id} should be present`);
    assert.doesNotMatch(input, /\smax="20"/);
  }
});
