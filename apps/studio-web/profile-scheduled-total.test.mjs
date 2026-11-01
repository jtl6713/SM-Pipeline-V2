import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const overviewPath = path.join(here, "assets/all-profiles-overview-1007.js");

test("all-profiles overview shows per-output approved future and past-due totals, not parentheses", async () => {
  const host = {
    innerHTML: "",
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
  };
  const future = Date.now() + 120000;
  const past = Date.now() - 120000;
  const empty = {Facebook: [], Instagram: [], TikTok: [], YouTube: []};
  const overviewRows = [
    {
      id: "recChicago0000000",
      city_label: "Chicago",
      name: "Chicago",
      scheduled: { Facebook: 1, Instagram: 1, TikTok: 0, YouTube: 1 },
      approved_unpublished: 3,
      overdue_unpublished: 1,
      approved_future: 2, approved_past_due: 1, approved_missing_date: 0,
      approved_future_by_platform: {Facebook:1,Instagram:1,TikTok:0,YouTube:0},
      awaiting_final_by_platform: {Facebook:0,Instagram:1,TikTok:0,YouTube:0},
      pipeline_by_platform: {Facebook:1,Instagram:2,TikTok:0,YouTube:0},
      pipeline_total: 3,
      approved_calendar_slots: { ...empty, Facebook:[future], Instagram:[future], YouTube:[past] },
      manual: 0,
      failed: 0,
      approval: 1,
      ideas: 0,
    },
    {
      id: "recMiami000000000",
      city_label: "Miami",
      name: "Miami",
      scheduled: { Facebook: 0, Instagram: 0, TikTok: 1, YouTube: 0 },
      approved_unpublished: 5,
      overdue_unpublished: 2,
      approved_future: 2, approved_past_due: 2, approved_missing_date: 1,
      approved_future_by_platform: {Facebook:0,Instagram:1,TikTok:1,YouTube:0},
      awaiting_final_by_platform: {Facebook:1,Instagram:1,TikTok:0,YouTube:0},
      pipeline_by_platform: {Facebook:1,Instagram:2,TikTok:1,YouTube:0},
      pipeline_total: 4,
      approved_calendar_slots: { ...empty, Facebook:[past,past], Instagram:[future], TikTok:[future] },
      manual: 0,
      failed: 0,
      approval: 2,
      ideas: 0,
    },
  ];

  const prior = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    window: globalThis.window,
    sessionStorage: globalThis.sessionStorage,
  };
  const idleCallbacks = [];
  globalThis.window = globalThis;
  globalThis.window.setInterval = () => 0;
  globalThis.window.setTimeout = (fn) => { idleCallbacks.push(fn); return 1; };
  globalThis.window.requestIdleCallback = (fn) => { idleCallbacks.push(fn); return 1; };
  globalThis.window.clearTimeout = () => {};
  globalThis.sessionStorage = {
    getItem() { return null; },
    setItem() {},
  };
  globalThis.document = {
    hidden: false,
    getElementById(id) {
      if (id === "allProfilesOverview") return host;
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  globalThis.fetch = async (url) => {
    const value = String(url);
    assert.match(value, /\/api\/profiles\/overview/);
    assert.doesNotMatch(value, /\/api\/dashboard/);
    return { ok: true, json: async () => ({ records: overviewRows }) };
  };

  try {
    await import(`${pathToFileURL(overviewPath).href}?test=${Date.now()}`);
    // Do not execute the mocked AbortController timeout before the fetch
    // promise has settled: doing so races the response and produces a
    // spurious "No Content Profiles returned yet" in hermetic CI.
    // load() starts synchronously at module initialization.

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(host.innerHTML, /<th scope="row">Chicago<\/th>/);
    assert.match(host.innerHTML, /<th scope="row">Miami<\/th>/);
    assert.match(host.innerHTML, /<th scope="row">Total<\/th>/);
    assert.doesNotMatch(host.innerHTML, /Chicago \(/);
    assert.match(host.innerHTML, /data-label="Approved future"[^>]*>2<\/td>/);
    assert.match(host.innerHTML, /data-label="Approved past due"[^>]*><button[^>]*data-overview-action="approved_past_due"[^>]*>1<\/button><\/td>/);
    assert.match(host.innerHTML, /data-label="Approved no date"[^>]*><button[^>]*data-overview-action="approved_missing_date"[^>]*>1<\/button><\/td>/);
    assert.match(host.innerHTML, /Approved · Future/);
    assert.match(host.innerHTML, /Approved · Past Due/);
    assert.match(host.innerHTML, /Pipeline · Total/);
    assert.match(host.innerHTML, /Ideas Needed/);
    assert.match(host.innerHTML, /data-label="Pipeline total"[^>]*>3<\/td>/);
    assert.match(host.innerHTML, /data-label="Pipeline total"[^>]*>4<\/td>/);
    assert.match(host.innerHTML, /data-label="Ideas needed"[^>]*>100<\/td>/);
  } finally {
    globalThis.document = prior.document;
    globalThis.fetch = prior.fetch;
    globalThis.window = prior.window;
    globalThis.sessionStorage = prior.sessionStorage;
  }
});

test("profile totals use lean overview endpoint and keep timezone helpers", async () => {
  const overview = await readFile(overviewPath, "utf8");
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(overview, /\/api\/profiles\/overview/);
  assert.doesNotMatch(overview, /\/api\/dashboard\?profile=/);
  assert.match(app, /function workingStudioTimeZone\(\)/);
  assert.match(app, /function studioEffectiveScheduleIso\(record\)/);
  assert.match(html, /all-profiles-overview-1007\.js\?v=0\.6\.\d+-[a-z0-9-]+/);
});


test("every All Profiles heading has an explanatory hover tooltip", async () => {
  const overview = await readFile(overviewPath, "utf8");
  const start = overview.indexOf('host.innerHTML = `<div class="all-profiles-heading"');
  assert.ok(start >= 0, "Overview render template exists");
  const end = overview.indexOf("</thead>", start);
  assert.ok(end > start, "Overview table header is present");
  const headings = overview.slice(start, end);
  const titles = headings.match(/<th\b[^>]*\btitle="[^"]+"/g) || [];
  // Profile, 4-platform group, 7 summary fields, and each platform heading.
  assert.equal(titles.length, 12);
  for (const label of [
    "Profile", "Future + Review platform outputs", "Pipeline · Total",
    "Approved · Future", "Ideas Needed", "Approved · Past Due",
    "Approved · No Date", "Manual action", "Failed", "Awaiting approval", "Ideas",
  ]) {
    assert.ok(headings.includes(label), `missing column heading: ${label}`);
  }
  assert.match(headings, /<th class="all-profiles-scheduled-col" title="\$\{p\}:/);
  assert.match(headings, /title="Estimated additional ideas: round up \(500 minus Pipeline Total\) divided by 5/);
  assert.match(headings, /title="Fully rendered platform outputs awaiting final human approval/);
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(html, /all-profiles-overview-1007\.js\?v=[^"]+&tooltips=all-columns-v1/);
});
