import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_CAPABILITIES,
  actionSupported,
  scorePostRelevance,
  filterAndRankCandidates,
  normalizeGeneratedComments,
  sanitizeCommentSuggestion,
  fallbackCommentSuggestions,
  engagementDedupeKey,
  creatorRecentlyEngaged,
  findDuplicateAction,
  makeIdempotencyKey,
  classifyEngagementFailure,
  mergeEngagementSettings,
  defaultEngagementSettings,
  computeEngagementInsights,
  mapYoutubeSearchItem,
  buildTargetRecord,
  dailyActionCount,
  nearIdenticalComment,
  backoffMs,
} from "./engagement.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("capability matrix marks YouTube comment/like supported and TikTok unsupported", () => {
  assert.equal(PLATFORM_CAPABILITIES.youtube.stage_b_comment, true);
  assert.equal(PLATFORM_CAPABILITIES.youtube.stage_b_like, true);
  assert.equal(actionSupported("youtube", "comment"), true);
  assert.equal(actionSupported("tiktok", "comment"), false);
  assert.equal(actionSupported("instagram", "comment"), false);
  assert.equal(PLATFORM_CAPABILITIES.facebook.discover, "unsupported");
});

test("profile-specific relevance prefers Chicago architecture over unrelated travel", () => {
  const settings = defaultEngagementSettings("chicago");
  const hit = scorePostRelevance(
    { caption: "Chicago river bridges at blue hour #architecture #chicago", creator_name: "Local Photog" },
    settings
  );
  const miss = scorePostRelevance(
    { caption: "My cat sleeping on a couch #pets", creator_name: "CatAccount" },
    settings
  );
  assert.ok(hit.score >= settings.relevance_threshold);
  assert.ok(miss.score < settings.relevance_threshold);
});

test("deduplication and ranking keep unique high-relevance posts", () => {
  const settings = mergeEngagementSettings({ relevance_threshold: 0.4, max_candidates_per_run: 5 }, "nyc");
  const posts = [
    { platform: "youtube", post_id: "a1", caption: "Manhattan architecture walk", creator_id: "c1", creator_name: "A" },
    { platform: "youtube", post_id: "a1", caption: "Manhattan architecture walk", creator_id: "c1", creator_name: "A" },
    { platform: "youtube", post_id: "b2", caption: "Brooklyn bridge photography", creator_id: "c2", creator_name: "B" },
    { platform: "youtube", post_id: "c3", caption: "Unrelated baking tutorial", creator_id: "c3", creator_name: "C" },
  ];
  const existing = [{ dedupe_key: engagementDedupeKey("youtube", "b2", "c2") }];
  const ranked = filterAndRankCandidates(posts, settings, existing);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].post_id, "a1");
});

test("AI comment sanitizer blocks generic praise, links, and visit claims", () => {
  assert.equal(sanitizeCommentSuggestion("Amazing!"), "");
  assert.equal(sanitizeCommentSuggestion("Cool https://spam.example"), "");
  assert.equal(sanitizeCommentSuggestion("I visited there last week — gorgeous!"), "");
  const ok = sanitizeCommentSuggestion("Love how you captured the geometric facade details.");
  assert.match(ok, /geometric facade/i);
  const normalized = normalizeGeneratedComments({
    comments: ["Amazing!", "Love how you captured the geometric facade details.", "Love how you captured the geometric facade details."],
  });
  assert.equal(normalized.comments.length, 1);
});

test("fallback comments and near-identical detection", () => {
  const comments = fallbackCommentSuggestions({
    caption: "Chicago skyline from the riverwalk",
    matched_terms: ["chicago skyline"],
  });
  assert.ok(comments.comments.length >= 2);
  assert.equal(nearIdenticalComment(comments.comments[0], comments.comments[0]), true);
  assert.equal(nearIdenticalComment("Unique angle on the bridge trusses.", "Totally different praise."), false);
});

test("approval and unsupported API behavior helpers", () => {
  const settings = defaultEngagementSettings("la");
  const post = mapYoutubeSearchItem({
    id: { videoId: "vid123" },
    snippet: {
      title: "Downtown LA architecture walk",
      description: "Exploring DTLA landmarks",
      channelId: "ch1",
      channelTitle: "LA Shooter",
      publishedAt: "2026-10-01T12:00:00Z",
      thumbnails: { medium: { url: "https://i.ytimg.com/vi/vid123/mqdefault.jpg" } },
    },
  });
  const ranked = filterAndRankCandidates([post], settings, []);
  assert.equal(ranked.length, 1);
  const target = buildTargetRecord(ranked[0], settings, ["Strong DTLA framing — great sense of place."]);
  assert.equal(target.approval_status, "pending");
  assert.equal(actionSupported(target.platform, "comment"), true);
  assert.equal(actionSupported("facebook", "like"), false);
});

test("provider authorization / rate-limit classification and retry safety", () => {
  assert.equal(classifyEngagementFailure("OAuth refresh failed 401").kind, "engagement_permission");
  assert.equal(classifyEngagementFailure("quotaExceeded dailyLimitExceeded").kind, "engagement_quota");
  assert.equal(classifyEngagementFailure("unsupported on TikTok").kind, "engagement_unsupported");
  assert.equal(classifyEngagementFailure("ambiguous publish result").kind, "engagement_ambiguous");
  assert.ok(backoffMs(0) >= 1000);
  assert.ok(backoffMs(5) > backoffMs(2));
});

test("idempotent comment publishing and creator cooldowns", () => {
  const key = makeIdempotencyKey("chicago", "youtube", "comment", "vid1");
  const actions = [
    {
      idempotency_key: key,
      execution_status: "published",
      action_type: "comment",
      platform: "youtube",
      creator_id: "ch1",
      profile: "chicago",
      approved_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ];
  assert.ok(findDuplicateAction(actions, key));
  assert.equal(creatorRecentlyEngaged(actions, "ch1", "youtube", 72), true);
  assert.equal(dailyActionCount(actions, "chicago", "youtube", "comment"), 1);
});

test("quality agent error classification signatures are distinct", () => {
  const kinds = [
    "duplicate engagement",
    "near-identical comment",
    "unsupported platform",
    "permission expired",
    "quota 429",
    "comment failed 500",
    "wrong profile",
    "irrelevant AI suggestion",
    "video not found 404",
    "ambiguous publish",
  ].map((text) => classifyEngagementFailure(text).kind);
  assert.ok(new Set(kinds).size >= 8);
});

test("insights only count confirmed publishes and never invent growth", () => {
  const insights = computeEngagementInsights({
    targets: [{ profile: "chicago", suggested_comments: ["a", "b"] }],
    actions: [
      { profile: "chicago", platform: "youtube", action_type: "comment", approval_status: "approved", execution_status: "published", creator_id: "c1" },
      { profile: "chicago", platform: "youtube", action_type: "like", approval_status: "approved", execution_status: "published", creator_id: "c1" },
      { profile: "chicago", platform: "tiktok", action_type: "comment", approval_status: "rejected", execution_status: "failed", creator_id: "c2" },
    ],
  }, "chicago");
  assert.equal(insights.comments_published, 1);
  assert.equal(insights.likes_completed, 1);
  assert.match(insights.note, /not attributed/i);
});

test("worker wires engagement routes, cron, and version bump", () => {
  assert.match(worker, /from "\.\/engagement-service\.mjs"/);
  assert.match(worker, /\/api\/engagement\//);
  assert.match(worker, /studio_engagement_v1:\s*true/);
  assert.match(worker, /0\.10\.474-engagement/);
  assert.match(worker, /studioRunEngagementDiscovery/);
  assert.match(worker, /studioEngagementCron/);
});
