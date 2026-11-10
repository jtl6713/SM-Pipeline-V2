import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const js = fs.readFileSync(path.join(here, "assets/engagement-1008.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/engagement-1008.css"), "utf8");
const matrix = fs.readFileSync(path.join(here, "../../docs/engagement-capability-matrix.md"), "utf8");

test("Engagement nav page and assets ship with the current UI", () => {
  assert.match(html, /data-page="engagement"/);
  assert.match(html, /id="page-engagement"/);
  assert.match(html, /engagement-1008\.js\?v=0\.6\.\d+-[a-z0-9-]+/);
  assert.match(html, /engagement-1008\.css\?v=0\.6\.\d+-[a-z0-9-]+/);
  assert.match(html, /UI build 0\.6\.\d+/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.\d+-[a-z0-9-]+"/);
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
  assert.match(js, /function pinEngagementResult/);
  assert.match(js, /button\.textContent = `Sending \$\{action\}…`/);
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

test("Engagement still loads recommendations when optional reads fail", () => {
  assert.match(js, /Promise\.allSettled/);
  assert.match(js, /queueResult\.status === "rejected"/);
  assert.match(js, /insightsResult\.status === "fulfilled"/);
  assert.match(js, /Recommendations remain usable/);
  assert.match(js, /button\.disabled = false/);
  assert.match(app, /Engagement could not initialize/);
});

test("Engagement queue survives optional Insights failure at runtime", async () => {
  const elements = new Map();
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", innerHTML: "", checked: false,
      addEventListener: () => {},
      classList: { contains: () => false, toggle: () => {}, add: () => {} },
    });
    return elements.get(id);
  }
  const context = {
    URL,
    window: { location: { origin: "https://studio.example" } },
    document: {
      getElementById: el,
      querySelectorAll: () => [],
      addEventListener: () => {},
      querySelector: () => null,
    },
    fetch: async (url) => {
      if (url.includes("/api/engagement/recommendations")) {
        return { ok: true, json: async () => ({
          ok: true, settings: { stage_b_enabled: false },
          capabilities: { youtube: { discover: "supported", stage_b_comment: true, stage_b_like: true } },
          recommendations: [{ target_id: "t1", creator_name: "Creator One", platform: "youtube",
            relevance_score: 0.9, approval_status: "pending",
            post_url: "https://www.youtube.com/watch?v=test", suggested_comments: ["Thoughtful framing"] }],
          history: [],
        }) };
      }
      if (url.includes("/api/engagement/insights")) throw new Error("Insights backend offline");
      return { ok: true, json: async () => ({ matrix: {} }) };
    },
  };
  vm.runInNewContext(js, context);
  await context.window.StudioEngagement.load(true);
  assert.match(el("engagementRecommendations").innerHTML, /Creator One/);
  assert.match(el("engagementSubtitle").textContent, /1 open recommendation/);
  assert.match(el("engagementInsights").textContent, /temporarily unavailable/);
  assert.match(el("engagementStatus").textContent, /insights unavailable/);
});
