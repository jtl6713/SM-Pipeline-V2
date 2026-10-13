import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Home boots a thin script set and lazy-loads the other pages", async () => {
  const html = await readFile(path.join(here, "index.html"), "utf8");
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const loader = await readFile(path.join(here, "assets/studio-lazy-pages.js"), "utf8");

  assert.match(html, /id="studioLazyManifest"/);
  assert.match(html, /studio-lazy-pages\.js\?v=0\.6\.672-content-id-data/);
  assert.match(html, /window\.StudioLazyLoad\.boot\(\)/);
  assert.doesNotMatch(html, /<script src="\/assets\/insights-0622\.js/);
  assert.doesNotMatch(html, /<script src="\/assets\/engagement-1008\.js/);
  assert.doesNotMatch(html, /<script src="\/assets\/new-profile-1009\.js/);
  assert.doesNotMatch(html, /<script src="\/assets\/pipeline-schedule-grid-0622\.js/);
  assert.match(html, /\/assets\/insights-0622\.js\?v=0\.6\.672-content-id-data/);
  assert.match(html, /\/assets\/engagement-1008\.js\?v=0\.6\.672-content-id-data/);
  assert.match(html, /\/assets\/app-item4-1008\.js\?v=0\.6\.672-content-id-data/);
  assert.match(loader, /function ensure\(/);
  assert.match(loader, /prefetchRemaining/);
  assert.match(app, /BUILD_ID = "item4-0.6.672-content-id-data"/);
  assert.match(app, /window\.StudioLazyLoad\?\.ensure\(page\)/);
  assert.match(app, /window\.StudioLazyLoad\?\.ensure\("content"\)/);
  assert.match(app, /page === "insights"/);
  assert.match(html, /"factory":\s*\[\s*"\/assets\/factory-desk\.js\?v=0\.6\.672-content-id-data"/);
  assert.doesNotMatch(html, /<script src="\/assets\/factory-desk\.js/);
  assert.match(app, /page === "factory"/);
});
