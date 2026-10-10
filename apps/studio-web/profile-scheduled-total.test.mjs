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
  const profiles = [
    { id: "recChicago", city_label: "Chicago" },
    { id: "recMiami", city_label: "Miami" },
  ];
  const dashboards = {
    recChicago: {
      outputs: [
        { platform: "Facebook", scheduled_post_date: "2026-10-10T12:00:00Z" },
        { platform: "Instagram", publish_status: "Scheduled" },
        { platform: "YouTube", youtube_privacy_status: "private" },
        { platform: "TikTok", publish_status: "Published", published_at: "2026-10-01T12:00:00Z" },
      ],
      metrics: {},
    },
    recMiami: {
      outputs: [
        { platform: "TikTok", studio_scheduled_at: "2026-10-11T15:00:00Z" },
        { platform: "YouTube", youtube_privacy_status: "public", publish_status: "Published" },
      ],
      metrics: {},
    },
  };

  const prior = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    window: globalThis.window,
  };
  globalThis.window = globalThis;
  globalThis.window.setInterval = () => 0;
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
    const body = value === "/api/profiles"
      ? { records: profiles }
      : dashboards[new URL(value, "https://studio.test").searchParams.get("profile")];
    return { ok: true, json: async () => body };
  };

  try {
    await import(`${pathToFileURL(overviewPath).href}?test=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(host.innerHTML, /<th scope="row">Chicago \(3\)<\/th>/);
    assert.match(host.innerHTML, /<th scope="row">Miami \(1\)<\/th>/);
    assert.match(host.innerHTML, /<th scope="row">Total<\/th>/);
    assert.doesNotMatch(host.innerHTML, /Total \(4\)/);
  } finally {
    globalThis.document = prior.document;
    globalThis.fetch = prior.fetch;
    globalThis.window = prior.window;
  }
});

test("profile totals keep the existing profile-filtered dashboard and timezone code paths", async () => {
  const overview = await readFile(overviewPath, "utf8");
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(overview, /\/api\/dashboard\?profile=\$\{encodeURIComponent\(profile\.id\)\}/);
  assert.match(app, /function workingStudioTimeZone\(\)/);
  assert.match(app, /function studioEffectiveScheduleIso\(record\)/);
  assert.match(html, /all-profiles-overview-1007\.js\?v=0.6.572-idea-timeline-photo-wait/);
});
