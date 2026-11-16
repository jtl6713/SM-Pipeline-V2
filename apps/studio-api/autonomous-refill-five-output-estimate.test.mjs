import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTONOMOUS_SCHEDULED_TARGET,
  autonomousIdeasForOutputDeficit,
  autonomousRefillScoresFromOverview,
} from "./autonomous-produce.mjs";

const ready = (facebook, instagram, tiktok, youtube) => ({
  Facebook: facebook, Instagram: instagram, TikTok: tiktok, YouTube: youtube,
});

test("one distinct idea yields a planning estimate of five outputs", () => {
  assert.equal(AUTONOMOUS_SCHEDULED_TARGET, 1000);
  assert.equal(autonomousIdeasForOutputDeficit(104), 21);
  assert.equal(autonomousIdeasForOutputDeficit(100), 20);
  assert.equal(autonomousIdeasForOutputDeficit(1), 1);
  assert.equal(autonomousIdeasForOutputDeficit(0), 0);
  assert.equal(autonomousIdeasForOutputDeficit(-5), 0);
});

test("per-profile 896 approved ready outputs need 21 ideas; 1,000 need zero", () => {
  const scores = autonomousRefillScoresFromOverview([
    { id: "recLA", name: "Los Angeles", ready_by_platform: ready(300, 300, 150, 146), approval: 50 },
    { id: "recMiami", name: "Miami", ready_by_platform: ready(350, 350, 150, 150), approval: 0 },
  ]);
  assert.equal(scores.recLA.pipeline_load, 896);
  assert.equal(scores.recLA.deficit, 104);
  assert.equal(scores.recLA.estimated_ideas_needed, 21);
  assert.equal(scores.recLA.expected_outputs_per_idea, 5);
  assert.equal(scores.recMiami.pipeline_load, 1000);
  assert.equal(scores.recMiami.estimated_ideas_needed, 0);
  assert.equal(scores.recMiami.needed, false);
});

test("undated/past-due ready inventory still counts; pending Factory review does not", () => {
  const now = Date.now(), future = now + 3600000, past = now - 3600000;
  const blank = { Facebook: [], Instagram: [], TikTok: [], YouTube: [] };
  const scores = autonomousRefillScoresFromOverview([
    { id: "low", name: "New York", ready_by_platform: ready(300, 300, 200, 199),
      scheduled: ready(0, 0, 0, 0),
      approved_calendar_slots: { ...blank, Instagram: [future], TikTok: [past] }, approval: 200 },
    { id: "full", name: "Miami", ready_by_platform: ready(350, 350, 150, 150),
      approved_calendar_slots: blank, approval: 0 },
  ]);
  assert.equal(scores.low.pipeline_load, 999);
  assert.equal(scores.low.estimated_ideas_needed, 1);
  assert.equal(scores.low.awaiting_approval, 200);
  assert.equal(scores.low.needed, true);
  assert.equal(scores.full.pipeline_load, 1000);
  assert.equal(scores.full.estimated_ideas_needed, 0);
  assert.equal(scores.full.needed, false);
});

test("an obsolete overview without per-platform ready inventory is not verified", () => {
  const scores = autonomousRefillScoresFromOverview([
    { id: "old", name: "Legacy", scheduled: { Instagram: 998 }, approval: 5 },
  ]);
  assert.equal(scores.old.ready_inventory_verified, false);
});
