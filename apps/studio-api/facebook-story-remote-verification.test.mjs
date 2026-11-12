import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { facebookStoryPublishedMatch, verifyFacebookStoryByMediaId } from "./facebook-story-remote-verification.mjs";

const media = "117822233344455";
const page = "102445566778899";
const post = "232344455566677";
const graph = (data, paging) => ({ ok: true, json: async () => ({ data, ...(paging ? { paging } : {}) }) });

test("exact Meta Page Story media ID provides trustworthy positive proof and original URL", async () => {
  const calls = [];
  const result = await verifyFacebookStoryByMediaId({
    pageId: page, token: "sensitive-token", version: "v25.0", mediaId: media,
    fetcher: async (url, config) => { calls.push({ url, config }); return graph([
      { post_id: "999900001111", media_id: "999999999999", status: "PUBLISHED", url: "https://facebook.com/stories/unrelated" },
      { post_id: post, media_id: media, status: "PUBLISHED", url: "https://www.facebook.com/stories/123/456",
        creation_time: "2026-10-20T21:00:00+0000" },
    ]); },
  });
  assert.equal(result.verdict, "verified_published");
  assert.equal(result.evidence.media_id, media);
  assert.equal(result.evidence.post_id, post);
  assert.equal(result.evidence.url, "https://www.facebook.com/stories/123/456");
  assert.equal(result.evidence.published_at, "2026-10-20T21:00:00.000Z");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/v25.0/" + page + "/stories");
  assert.equal(calls[0].config.method, "GET");
  assert.equal(calls[0].config.headers.Authorization, "Bearer sensitive-token");
  assert.ok(!calls[0].url.includes("sensitive-token"));
});

test("archived or paginated exact media evidence can reconcile past publication", async () => {
  let count = 0;
  const result = await verifyFacebookStoryByMediaId({
    pageId: page, token: "token", mediaId: media,
    fetcher: async (url) => {
      count++;
      if (count === 1) return graph([{ post_id: "111222333444", media_id: "445566778899", status: "PUBLISHED" }],
        { next: "https://evil.example/leak?access_token=secret", cursors: { after: "opaque-cursor" } });
      assert.equal(new URL(url).host, "graph.facebook.com");
      assert.equal(new URL(url).searchParams.get("after"), "opaque-cursor");
      return graph([{ post_id: post, media_id: media, status: "ARCHIVED", creation_time: 1782120000 }]);
    },
  });
  assert.equal(result.verdict, "verified_published");
  assert.equal(result.evidence.remote_status, "ARCHIVED");
  assert.equal(count, 2);
});

test("a complete listing with no match never verifies remote nonpublication", async () => {
  const result = await verifyFacebookStoryByMediaId({
    pageId: page, token: "token", mediaId: media, fetcher: async () => graph([]),
  });
  assert.equal(result.verdict, "unknown");
  assert.equal(result.reason, "no_exact_match_not_proof_of_absence");
});

test("missing identity, Graph refusal, incomplete cursor and ambiguous statuses all fail closed", async () => {
  const cases = [
    [{ mediaId: "" }, null, "missing_exact_media_id"],
    [{ pageId: "wrong" }, null, "missing_meta_page_configuration"],
    [{}, async () => ({ ok: false, json: async () => ({ error: { message: "Forbidden" } }) }), "meta_read_rejected_or_invalid"],
    [{}, async () => { throw new Error("timeout"); }, "meta_read_unavailable"],
    [{}, async () => graph([], { next: "https://graph.facebook.com/next" }), "invalid_meta_cursor"],
    [{}, async () => graph([{ post_id: post, media_id: media, status: "PROCESSING" }]), "remote_story_not_confirmed_published"],
  ];
  for (const [overrides, fetcher, expected] of cases) {
    const result = await verifyFacebookStoryByMediaId({
      pageId: page, token: "token", mediaId: media, ...(fetcher ? { fetcher } : { fetcher: async () => graph([]) }), ...overrides,
    });
    assert.equal(result.verdict, "unknown");
    assert.equal(result.reason, expected);
  }
  assert.equal(facebookStoryPublishedMatch([{ media_id: media, post_id: post, status: "PUBLISHED", url: "https://evil.example/post" }], media).url, null);
  assert.equal(facebookStoryPublishedMatch([
    { media_id: media, post_id: post, status: "PUBLISHED" },
    { media_id: media, post_id: "999888777666", status: "PUBLISHED" },
  ], media), null);
});

test("live publishing always persists upload identity before upload/finish and never invents a Story URL", () => {
  const worker = fs.readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const func = worker.slice(worker.indexOf("export async function studioPublishFacebookPageStory("),
    worker.indexOf("/*__STUDIO_WORKER_END:studioPublishFacebookPageStory__*/"));
  assert.match(func, /previousMediaId/);
  assert.match(func, /remote-verification-pending/);
  assert.match(func, /Platform_Media_ID: String\(start\.video_id\)/);
  assert.ok(func.indexOf('Platform_Media_ID: String(start.video_id)') < func.indexOf('const mediaResponse ='));
  assert.match(func, /finish_missing_post_id/);
  assert.doesNotMatch(func, /Platform_Post_URL: `https:\/\/www\.facebook\.com\/stories/);
  const qa = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const section = qa.slice(qa.indexOf("export async function studioHealFacebookRateLimitRearm("),
    qa.indexOf("/*__STUDIO_WORKER_END:studioHealFacebookRateLimitRearm__*/"));
  assert.match(section, /studioScanDeskHealOutputs\(env, "fb_story_remote"/);
  assert.ok(section.indexOf("const outputTable") < section.indexOf("studioScanDeskHealOutputs"));
  assert.match(section, /verifyFacebookStoryByMediaId/);
  assert.match(section, /FB_STORY_REMOTE_VERIFIED_PUBLISHED/);
  assert.match(section, /reconciled_without_post/);
  assert.match(section, /facebookPreapprovalRecoveryReason\(latest\)/);
  const dispatch = worker.slice(worker.indexOf("export async function studioDispatchApprovedPublishAndSchedule("),
    worker.indexOf("/*__STUDIO_WORKER_END:studioDispatchApprovedPublishAndSchedule__*/"));
  assert.match(dispatch, /reused_existing_remote_story/);
  assert.match(dispatch, /Keep its QA recovery audit marker/);

});


test("a positive Story match cannot reconcile until all Graph cursor pages complete", async () => {
  let request = 0;
  const exact = { post_id: post, media_id: media, status: "PUBLISHED", creation_time: "2026-10-20T21:00:00Z" };
  const incomplete = await verifyFacebookStoryByMediaId({
    pageId: page, token: "token", mediaId: media, maxPages: 1,
    fetcher: async () => {
      request += 1;
      return graph([exact], { next: "https://graph.facebook.com/next", cursors: { after: "second" } });
    },
  });
  assert.equal(request, 1);
  assert.equal(incomplete.verdict, "unknown");
  assert.equal(incomplete.reason, "incomplete_meta_pagination");

  const ambiguous = await verifyFacebookStoryByMediaId({
    pageId: page, token: "token", mediaId: media,
    fetcher: async (url) => {
      const cursor = new URL(url).searchParams.get("after");
      return cursor ? graph([{ ...exact, post_id: "999888777666" }]) :
        graph([exact], { next: "https://graph.facebook.com/next", cursors: { after: "second" } });
    },
  });
  assert.equal(ambiguous.verdict, "unknown");
  assert.equal(ambiguous.reason, "ambiguous_remote_story");

  const valid = await verifyFacebookStoryByMediaId({
    pageId: page, token: "token", mediaId: media,
    fetcher: async (url) => {
      const cursor = new URL(url).searchParams.get("after");
      return cursor ? graph([]) :
        graph([exact], { next: "https://graph.facebook.com/next", cursors: { after: "second" } });
    },
  });
  assert.equal(valid.verdict, "verified_published");
  assert.equal(valid.pages_read, 2);
});
