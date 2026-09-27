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
    }],
  });
  assert.equal(recap.open_count, 1);
  assert.equal(recap.cards[0].status, "Retrying now");
  assert.match(recap.cards[0].found, /failed while sending/i);
  assert.match(recap.cards[0].found, /Post 908/);
  assert.match(recap.cards[0].action, /Restarted the send/);
  assert.equal(qualityRecapItemLabel({ output_id: 908 }), "Post 908");
  assert.equal(qualityRecapCopy("produce_escalated").found.includes("investigation"), true);
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
  });
  assert.equal(recap.open_count, 0);
  assert.equal(recap.cards[0].status, "Handled");
  assert.match(recap.empty_copy, /Nothing is blocked/i);
  assert.match(recap.cards[0].action, /Restarted production|missing photos/i);
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
