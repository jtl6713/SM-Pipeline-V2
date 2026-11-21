"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const src = fs.readFileSync(__dirname + "/youtube-upload-service.js", "utf8");
const start = src.indexOf("async function ownedChannelUploadInventory(");
const end = src.indexOf("async function analyticsReadStatus(token)", start);
assert.ok(start >= 0 && end > start, "inventory helper exists");
const helper = src.slice(start, end);
const channel = "UCVt3nBxRfPuuxxduuxmz9sw";

function fake({ ownedChannel = channel, returnedChannel = channel, pages = 1, missingVideo = false } = {}) {
  const requests = [];
  const fetch = async (raw, options) => {
    const url = new URL(raw);
    requests.push({ path: url.pathname, method: options.method, bearer: options.headers.Authorization });
    if (url.pathname.endsWith("/channels")) {
      return good({ items: [{ id: ownedChannel, contentDetails: { relatedPlaylists: { uploads: "UUown" } } }] });
    }
    if (url.pathname.endsWith("/playlistItems")) {
      const index = url.searchParams.get("pageToken") ? Number(url.searchParams.get("pageToken")) : 0;
      return good({
        items: [{ contentDetails: { videoId: "video" + index } }],
        nextPageToken: index + 1 < pages ? String(index + 1) : undefined,
      });
    }
    if (url.pathname.endsWith("/videos")) {
      const ids = url.searchParams.get("id").split(",");
      return good({ items: missingVideo ? [] : ids.map(id => ({
        id,
        snippet: { channelId: returnedChannel, title: "Griffith Sunset Plan", description: "Original approved video", publishedAt: "2026-11-20T00:00:00Z" },
        status: { privacyStatus: "public" },
        contentDetails: { duration: "PT15S" },
      })) });
    }
    throw Error("unexpected GET " + url.pathname);
  };
  function good(json) { return { ok: true, json: async () => json }; }
  const context = { URL, fetch, accessToken: async () => "test-token" };
  return {
    requests,
    run: (id = channel, maxPages = 10) =>
      vm.runInNewContext(helper + ";ownedChannelUploadInventory(expected, pageLimit)", { ...context, expected: id, pageLimit }),
  };
}

test("verified owned upload history reads Google only with GET and returns receipt", async () => {
  const h = fake();
  const result = await h.run();
  assert.equal(result.complete, true);
  assert.equal(result.read_only, true);
  assert.equal(result.provider_media_writes, 0);
  assert.equal(result.output_writes, 0);
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].id, "video0");
  assert.ok(h.requests.every(r => r.method === "GET" && r.bearer === "Bearer test-token"));
});
test("different authenticated channel fails closed before playlist history", async () => {
  const h = fake({ ownedChannel: "UCabcdefghijklmnopqrstuv" });
  await assert.rejects(h.run(), /youtube_owned_channel_mismatch/);
  assert.equal(h.requests.length, 1);
});
test("cross-owned video fails closed", async () => {
  const h = fake({ returnedChannel: "UCabcdefghijklmnopqrstuv" });
  await assert.rejects(h.run(), /youtube_video_channel_mismatch/);
});
test("bounded incomplete pagination cannot prove absence", async () => {
  const h = fake({ pages: 12 });
  const result = await h.run(channel, 10);
  assert.equal(result.complete, false);
  assert.equal(result.partial_page_limit, true);
  assert.equal(result.playlist_pages_scanned, 10);
  assert.equal(result.video_ids_seen, 10);
});
test("missing video metadata cannot prove absence", async () => {
  const result = await fake({ missingVideo: true }).run();
  assert.equal(result.complete, false);
  assert.equal(result.missing_video_details, 1);
});
test("endpoint refuses unprotected uploader service and invalid account ID", () => {
  assert.match(src, /url\.pathname === "\/youtube\/channel\/uploads"/);
  assert.match(src, /if \(!cfg\.secret\) return json\(res, 503/);
  assert.match(src, /expected_channel_id_required/);
  assert.match(src, /if \(!authorized\(req\)\) return json\(res, 401/);
});
