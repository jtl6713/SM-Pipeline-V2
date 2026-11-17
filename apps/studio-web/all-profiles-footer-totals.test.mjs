import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/all-profiles-overview-1007.js", import.meta.url), "utf8");
const platforms = ["Facebook", "Instagram", "TikTok", "YouTube"];

function overviewRow(index, city, { ideas, production, approval, manual, failed, missingDate = 0 }) {
  const zeroPlatforms = () => Object.fromEntries(platforms.map((name) => [name, 0]));
  return {
    id: "rec" + String(index + 1).repeat(14),
    city_label: city,
    name: city,
    scheduled: zeroPlatforms(),
    ready_by_platform: zeroPlatforms(),
    approved_future_by_platform: zeroPlatforms(),
    awaiting_final_by_platform: zeroPlatforms(),
    pipeline_by_platform: zeroPlatforms(),
    approved_calendar_slots: Object.fromEntries(platforms.map((name) => [name, []])),
    manual, failed, approval, production, ideas,
    approved_unpublished: 0,
    overdue_unpublished: 0,
    approved_future: 0,
    approved_past_due: 0,
    approved_missing_date: missingDate,
    pipeline_total: ideas + production + approval,
  };
}

function renderFromCachedRows(rows) {
  const host = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const data = JSON.stringify({ rows, at: Date.now(), summaryVersion: 1 });
  const storage = {
    getItem: (key) => key === "studio.allProfilesOverview.v8" ? data : null,
    setItem: () => {},
    removeItem: () => {},
  };
  const document = {
    hidden: false,
    getElementById: (id) => id === "allProfilesOverview" ? host
      : id === "page-dashboard" ? { classList: { contains: () => false } } : null,
    addEventListener: () => {},
  };
  const window = {
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
  };
  vm.runInNewContext(source, {
    document, window, localStorage: storage, sessionStorage: storage,
    fetch: async () => ({ ok: true, json: async () => ({ status: "idle" }) }),
  });
  return host.innerHTML;
}

function totalsForSection(html, section) {
  const start = html.indexOf(`aria-label="${section}"`);
  assert.ok(start >= 0, `Missing ${section} section`);
  const sectionMarkup = html.slice(start, html.indexOf("</section>", start));
  const match = sectionMarkup.match(/<tr class="all-profiles-total">([\s\S]*?)<\/tr>/);
  assert.ok(match, `Missing ${section} total row`);
  return {
    values: [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((cell) => cell[1].replace(/<[^>]+>/g, "").trim()),
    markup: match[1],
  };
}

const html = renderFromCachedRows([
  overviewRow(0, "Chicago", { ideas: 5, production: 3, approval: 36, manual: 2, failed: 1, missingDate: 1 }),
  overviewRow(1, "Los Angeles", { ideas: 2, production: 3, approval: 3, manual: 1, failed: 0 }),
  overviewRow(2, "Miami", { ideas: 0, production: 8, approval: 19, manual: 0, failed: 0 }),
  overviewRow(3, "New York", { ideas: 1, production: 28, approval: 70, manual: 3, failed: 4 }),
]);

test("production footer sums the four city rows instead of rendering zero", () => {
  const footer = totalsForSection(html, "Production pipeline");
  assert.deepEqual(footer.values, ["8", "42", "128", "178"]);
  assert.doesNotMatch(footer.markup, /<button\b/, "Footer should stay non-clickable");
});

test("issues footer preserves manual and failed totals without clickable links", () => {
  const footer = totalsForSection(html, "Issues requiring attention");
  assert.deepEqual(footer.values, ["0", "1", "6", "5", "12"]);
  assert.doesNotMatch(footer.markup, /<button\b/, "Footer should stay non-clickable");
});
