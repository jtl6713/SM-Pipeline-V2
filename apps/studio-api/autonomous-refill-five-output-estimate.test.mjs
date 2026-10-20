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
    { id: "recLA", name: "Los Angeles", scheduled: { Instagram: 390 }, approval: 6 },
    { id: "recMiami", name: "Miami", scheduled: { Instagram: 500 }, approval: 0 },
  ]);
  assert.equal(scores.recLA.pipeline_load, 396);
  assert.equal(scores.recLA.deficit, 104);
  assert.equal(scores.recLA.estimated_ideas_needed, 21);
  assert.equal(scores.recLA.expected_outputs_per_idea, 5);
  assert.equal(scores.recMiami.estimated_ideas_needed, 0);
});

test("refill uses future-approved timestamps plus rendered-awaiting count, not dispatch queue",()=>{
  const now=Date.now(), future=now+3600000, past=now-3600000;
  const blank={Facebook:[],Instagram:[],TikTok:[],YouTube:[]};
  const scores=autonomousRefillScoresFromOverview([
    {id:"new",name:"New York",scheduled:{Instagram:999},approved_calendar_slots:{...blank,Instagram:Array.from({length:390},()=>future),TikTok:[past]},approval:6},
    {id:"full",name:"Miami",scheduled:{Instagram:0},approved_calendar_slots:{...blank,Facebook:Array.from({length:500},()=>future)},approval:0},
    {id:"review",name:"Chicago",scheduled:{Instagram:500},approved_calendar_slots:{...blank},approval:500},
  ]);
  assert.equal(scores.new.scheduled_total,390);
  assert.equal(scores.new.awaiting_approval,6);
  assert.equal(scores.new.pipeline_load,396);
  assert.equal(scores.new.estimated_ideas_needed,21);
  assert.equal(scores.full.estimated_ideas_needed,0);
  assert.equal(scores.review.estimated_ideas_needed,0);
});
