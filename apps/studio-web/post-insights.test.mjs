import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("./assets/insights-0622.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./assets/insights-0622.css", import.meta.url), "utf8");

test("Studio exposes a Post Insights navigation page", () => {
  assert.match(html, /data-page="insights"/);
  assert.match(html, /id="page-insights"/);
  assert.match(html, /id="insightsChatForm"/);
  assert.match(html, /assets\/insights-0622\.js/);
  assert.match(html, /assets\/insights-0622\.css/);
});

test("Insights client treats missing analytics as unknown and supports grounded chat", () => {
  assert.match(client, /Missing analytics are treated as unknown/);
  assert.match(client, /\/api\/insights\/chat/);
  assert.match(client, /localAnalystAnswer/);
  assert.match(client, /analyticsPresent/);
  assert.match(client, /insightsOpportunity/);
});

test("Insights page has responsive dashboard styling", () => {
  assert.match(css, /\.insights-kpis/);
  assert.match(css, /\.insights-analyst/);
  assert.match(css, /\.insights-scatter/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
