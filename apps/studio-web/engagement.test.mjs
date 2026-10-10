import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const js = fs.readFileSync(path.join(here, "assets/engagement-1008.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/engagement-1008.css"), "utf8");
const matrix = fs.readFileSync(path.join(here, "../../docs/engagement-capability-matrix.md"), "utf8");

test("Engagement nav page and assets ship with UI 0.6.553", () => {
  assert.match(html, /data-page="engagement"/);
  assert.match(html, /id="page-engagement"/);
  assert.match(html, /engagement-1008\.js\?v=0\.6\.556-vibe-cut-large-upload/);
  assert.match(html, /engagement-1008\.css\?v=0\.6\.556-vibe-cut-large-upload/);
  assert.match(html, /UI build 0\.6\.556/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.556-vibe-cut-large-upload"/);
  assert.match(app, /page === "engagement"/);
  assert.match(app, /StudioEngagement/);
});

test("Engagement UI exposes review actions without mass unreviewed commenting", () => {
  assert.match(html, /id="engagementRecommendations"/);
  assert.match(html, /id="engagementHistory"/);
  assert.match(html, /id="engagementInsights"/);
  assert.match(html, /id="engagementDiscover"/);
  assert.match(js, /primary-button" data-action="comment"/);
  assert.doesNotMatch(js, /Approve Comment/);
  assert.match(js, /Edit Comment/);
  assert.match(js, /Open Post/);
  assert.match(js, /Block Creator/);
  assert.match(js, /\/api\/engagement\/discover/);
  assert.match(js, /\/api\/engagement\/actions/);
  assert.doesNotMatch(js, /mass.?comment|auto.?publish.?all|unreviewed.?bulk.?comment/i);
  assert.match(css, /\.engagement-card/);
  assert.match(css, /\.engagement-filters-panel > \.engagement-filters-grid\s*\{[^}]*padding:/s);
  assert.match(css, /\.engagement-filters-grid \.form-field > span\s*\{[^}]*font-weight:\s*750/s);
  assert.match(css, /\.engagement-filters-grid \.checkbox-field > span\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.engagement-filters-grid \.checkbox-field input\[type="checkbox"\]\s*\{[^}]*width:\s*1rem/s);
});

test("capability matrix documents unsupported automation honestly", () => {
  assert.match(matrix, /TikTok/);
  assert.match(matrix, /Unsupported/);
  assert.match(matrix, /Open Post/);
  assert.match(matrix, /business_discovery/);
  assert.match(matrix, /commentThreads\.insert/);
});
