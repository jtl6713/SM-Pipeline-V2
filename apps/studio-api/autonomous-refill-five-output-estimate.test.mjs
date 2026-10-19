import test from "node:test";
import assert from "node:assert/strict";
import {
  autonomousIdeasForOutputDeficit,
  autonomousRefillScoresFromOverview,
} from "./autonomous-produce.mjs";

test("five expected outputs per idea; round upward, never over-create for zero gap", () => {
  assert.equal(autonomousIdeasForOutputDeficit(104), 21);
  assert.equal(autonomousIdeasForOutputDeficit(100), 20);
  assert.equal(autonomousIdeasForOutputDeficit(1), 1);
  assert.equal(autonomousIdeasForOutputDeficit(0), 0);
  assert.equal(autonomousIdeasForOutputDeficit(-5), 0);
});
test("city inventory 396 requires 21 estimated ideas, but target 500 requires none", () => {
  const scores = autonomousRefillScoresFromOverview([
    { id: "recLA", name: "Los Angeles", scheduled: { total: 390 }, approval: 6 },
    { id: "recMiami", name: "Miami", scheduled: { total: 500 }, approval: 0 },
  ]);
  assert.equal(scores.recLA.pipeline_load, 396);
  assert.equal(scores.recLA.deficit, 104);
  assert.equal(scores.recLA.estimated_ideas_needed, 21);
  assert.equal(scores.recLA.expected_outputs_per_idea, 5);
  assert.equal(scores.recMiami.estimated_ideas_needed, 0);
});
