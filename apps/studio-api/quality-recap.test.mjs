import assert from "node:assert/strict";
import test from "node:test";

import { buildQualityRecap, qualityRecapCopy, qualityRecapItemLabel } from "./quality-recap.mjs";

test("recap uses everyday words and names the post", () => {
  const recap = buildQualityRecap({
    incidents: [{
      kind: "publish_failed_transient",
      class: "transient",
      actor: "worker_heal",
      record_id: "recuOQs6TgAXJqxRI",
      fingerprint: "publish_failed_transient:recuOQs6TgAXJqxRI:transient_http",
      output_id: 908,
      output_title: "Vizcaya Rainy Day Plan",
      platform: "TikTok",
      platform_output_type: "Slideshow",
      content_id: 209,
      content_title: "Vizcaya Rainy Day Plan",
    }],
  });
  assert.equal(recap.open_count, 1);
  assert.equal(recap.cards[0].status, "Retrying now");
  assert.match(recap.cards[0].found, /failed while sending/i);
  assert.equal(recap.cards[0].content_title, "Vizcaya Rainy Day Plan");
  assert.equal(recap.cards[0].content_id, 209);
  assert.equal(recap.cards[0].output_label, "TikTok Slideshow");
  assert.equal(recap.cards[0].output_id, 908);
  assert.match(recap.cards[0].action, /Restarted the send/);
  assert.equal(qualityRecapItemLabel({
    content_title: "Vizcaya Rainy Day Plan",
    output_id: 908,
    platform: "TikTok",
    platform_output_type: "Slideshow",
  }), "Vizcaya Rainy Day Plan · TikTok Slideshow");
  assert.equal(qualityRecapCopy("produce_escalated").found.includes("investigation"), true);
});

test("recap names the content item and platform output on a never-sent post", () => {
  const recap = buildQualityRecap({
    incidents: [{
      kind: "publish_never_dispatch",
      class: "transient",
      actor: "worker_heal",
      record_id: "recNeverSent",
      fingerprint: "publish_never_dispatch:recNeverSent:never_attempted",
      blocker: "never_attempted",
      output_id: 908,
      platform: "Instagram",
      platform_output_type: "Reel",
      content_id: 209,
      content_title: "Vizcaya Rainy Day Plan",
    }],
  });
  assert.match(recap.cards[0].found, /due and the send never started/i);
  assert.match(recap.cards[0].action, /Queued the send/i);
  assert.equal(recap.cards[0].content_title, "Vizcaya Rainy Day Plan");
  assert.equal(recap.cards[0].content_id, 209);
  assert.equal(recap.cards[0].output_label, "Instagram Reel");
  assert.equal(recap.cards[0].output_id, 908);
});

test("recap hides calendar holds and names YouTube quota instead of kicking", () => {
  const recap = buildQualityRecap({
    incidents: [
      {
        kind: "publish_never_dispatch",
        fingerprint: "publish_never_dispatch:recHold:scheduled_hold",
        blocker: "scheduled_hold",
        scheduled_post_date: "2026-10-03T11:30:00.000Z",
        output_id: 1016,
      },
      {
        kind: "publish_never_dispatch",
        class: "transient",
        actor: "worker_heal",
        fingerprint: "publish_never_dispatch:recQuota:youtube_quota",
        blocker: "youtube_quota",
        output_id: 994,
        content_title: "Down Under the Brooklyn Bridge (DUMBO)",
        platform: "YouTube",
        platform_output_type: "Short",
      },
    ],
    generatedAt: "2026-09-27T04:20:00.000Z",
  });
  assert.equal(recap.cards.length, 1);
  assert.match(recap.cards[0].found, /daily API send limit/i);
  assert.match(recap.cards[0].action, /Stopped kicking/i);
  assert.equal(recap.cards[0].status, "Waiting on YouTube");
});

test("recap marks handled tickets that are no longer open", () => {
  const recap = buildQualityRecap({
    incidents: [],
    events: [{
      created_at: "2026-09-26T19:36:41.586189Z",
      payload: {
        kind: "produce_escalated",
        class: "transient",
        actor: "worker_heal",
        fingerprint: "produce_escalated:reckHkuJfs1F6eTAN:missing_masters",
        record_id: "reckHkuJfs1F6eTAN",
      },
    }],
    generatedAt: "2026-09-26T22:40:00.000Z",
  });
  assert.equal(recap.open_count, 0);
  assert.equal(recap.cards[0].status, "Handled");
  assert.equal(recap.cards[0].found_at, "2026-09-26T19:36:41.586Z");
  assert.equal(recap.cards[0].resolved_at, "2026-09-26T22:40:00.000Z");
  assert.equal(recap.cards[0].resolved_how, recap.cards[0].action);
  assert.match(recap.empty_copy, /Nothing is blocked/i);
  assert.match(recap.cards[0].action, /Restarted production|missing photos/i);
});

test("open recap cards keep a found date and say still open", () => {
  const recap = buildQualityRecap({
    incidents: [{
      kind: "publish_failed_transient",
      class: "transient",
      actor: "worker_heal",
      fingerprint: "publish_failed_transient:recuOQs6TgAXJqxRI:transient_http",
      output_id: 908,
      created_at: "2026-09-26T08:47:24.000Z",
    }],
    events: [{
      created_at: "2026-09-26T08:47:24.000Z",
      payload: {
        kind: "publish_failed_transient",
        fingerprint: "publish_failed_transient:recuOQs6TgAXJqxRI:transient_http",
        output_id: 908,
      },
    }],
    generatedAt: "2026-09-26T22:40:00.000Z",
  });
  assert.equal(recap.cards[0].found_at, "2026-09-26T08:47:24.000Z");
  assert.equal(recap.cards[0].resolved_at, null);
  assert.equal(recap.cards[0].resolved_label, "Still open");
  assert.match(recap.cards[0].resolved_how, /Restarted the send/);
});

test("recap skips tester noise and asks for help on desk-only blocks", () => {
  const recap = buildQualityRecap({
    incidents: [
      { kind: "tester_nightly", class: "code_bug", fingerprint: "tester_nightly:-:late" },
      {
        kind: "produce_clip_mismatch",
        class: "code_bug",
        actor: "desk_agent",
        fingerprint: "produce_clip_mismatch:recX:clip_count_mismatch",
        record_id: "recX",
      },
    ],
  });
  assert.equal(recap.cards.length, 1);
  assert.equal(recap.cards[0].status, "Needs you");
  assert.equal(recap.cards[0].tone, "alert");
});
