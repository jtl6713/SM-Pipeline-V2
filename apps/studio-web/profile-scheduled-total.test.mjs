import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const overviewPath = path.join(here, "assets/all-profiles-overview-1007.js");

test("all-profiles overview shows each profile's own scheduled total beside its name", async () => {
  const host = {
    innerHTML: "",
    querySelectorAll() { return []; },
  };
  const overviewRows = [
    {
      id: "recChicago",
      city_label: "Chicago",
      name: "Chicago",
      scheduled: { Facebook: 1, Instagram: 1, TikTok: 0, YouTube: 1 },
      manual: 0,
      failed: 0,
      approval: 0,
      ideas: 0,
    },
    {
      id: "recMiami",
      city_label: "Miami",
      name: "Miami",
      scheduled: { Facebook: 0, Instagram: 0, TikTok: 1, YouTube: 0 },
      manual: 0,
      failed: 0,
      approval: 0,
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
    while (idleCallbacks.length) idleCallbacks.shift()();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(host.innerHTML, /<th scope="row">Chicago \(3\)<\/th>/);
    assert.match(host.innerHTML, /<th scope="row">Miami \(1\)<\/th>/);
    assert.match(host.innerHTML, /<th scope="row">Total<\/th>/);
    assert.doesNotMatch(host.innerHTML, /Total \(4\)/);
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
  assert.match(html, /all-profiles-overview-1007\.js\?v=0.6.639-ops-timeline-dots/);
});
