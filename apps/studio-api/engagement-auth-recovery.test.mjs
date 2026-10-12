import test from "node:test";
import assert from "node:assert/strict";
import { studioApplyEngagementAction } from "./engagement-service.mjs";
import { defaultEngagementSettings } from "./engagement.mjs";

function harness() {
  let savedStore = JSON.stringify({
    schema_version: "studio.engagement.1",
    targets: [{
      target_id: "target_nyc_test", profile: "nyc", platform: "youtube",
      creator_id: "UC_test", creator_name: "Test Creator",
      post_id: "youtube_vid_test", post_url: "https://www.youtube.com/watch?v=youtube_vid_test",
      eligibility_status: "Suggested", approval_status: "pending",
      selected_comment: "The evening light gives the skyline so much texture.",
      suggested_comments: ["The evening light gives the skyline so much texture."],
      discovered_at: new Date().toISOString(),
    }],
    actions: [],
    suspended: { "nyc:youtube": { at: new Date().toISOString(), reason: "Unauthorized" } },
  });
  let savedSettings = JSON.stringify({ nyc: { ...defaultEngagementSettings("nyc"), stage_b_enabled: true } });
  let writeCount = 0;
  const deps = {
    async studioSettingsByName(_env, name) {
      if (name === "ENGAGEMENT_STORE_V1") return { fields: { Setting_Value: savedStore } };
      if (name === "ENGAGEMENT_SETTINGS_V1") return { fields: { Setting_Value: savedSettings } };
      return null;
    },
    async studioUpsertSetting(_env, name, value) {
      writeCount++;
      if (name === "ENGAGEMENT_STORE_V1") savedStore = value;
      if (name === "ENGAGEMENT_SETTINGS_V1") savedSettings = value;
    },
    async studioActivePipelineSettings() {
      return { YOUTUBE_UPLOAD_SERVICE_URL: "https://uploader.example", YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET: "private-test-key" };
    },
  };
  return { deps, getStore: () => JSON.parse(savedStore), getWriteCount: () => writeCount };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("suspended NYC YouTube comments return a user-readable auth failure, never post", async () => {
  const h = harness();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method || "GET" });
    return json({ error: "Unauthorized" }, 401);
  };
  try {
    const result = await studioApplyEngagementAction(
      {}, { profile: "nyc", action: "comment", target_id: "target_nyc_test" }, h.deps
    );
    assert.equal(result.ok, false);
    assert.equal(result.suspended, true);
    assert.equal(result.needs_authorization, true);
    assert.match(result.message, /shared keys do not match|Unauthorized/i);
    assert.ok(calls.every((call) => call.method === "GET"), "must not make write calls");
    assert.ok(h.getStore().suspended["nyc:youtube"]);
    assert.equal(h.getWriteCount(), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a healthy read-only auth probe heals suspension on explicit Comment and writes once", async () => {
  const h = harness();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options?.method || "GET" });
    if (String(url).endsWith("/youtube/oauth/status")) return json({ ok: true, refresh_ok: true });
    if (String(url).endsWith("/health")) return json({ ok: true, version: "2026-10-09-engagement-comment-like" });
    if (String(url).endsWith("/youtube/engage/comment")) return json({ comment_id: "published_once" });
    throw new Error("unexpected fetch " + url);
  };
  try {
    const result = await studioApplyEngagementAction(
      {}, { profile: "nyc", action: "comment", target_id: "target_nyc_test" }, h.deps
    );
    assert.equal(result.ok, true);
    assert.equal(h.getStore().suspended["nyc:youtube"], undefined);
    assert.equal(h.getStore().actions.filter((a) => a.execution_status === "published").length, 1);
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
