import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const match = source.match(/  function productionContentNeedsWork\(record\) \{[\s\S]*?\n  \}/);
assert.ok(match, "Production filtering helper exists");
const needsWork = vm.runInNewContext("(" + match[0].trim() + ")");

test("keep unapproved or mixed render/review content in Production", () => {
  for (const output_state_counts of [
    { Queued: 1 },
    { Rendering: 1, Approved: 4 },
    { "Ready for Review": 1, Scheduled: 2 },
    { "Waiting in Render Queue": 1, Published: 3 },
    { "Trying Again": 1, Approved: 1 },
  ]) {
    assert.equal(needsWork({ output_state_counts, studio_stage: "Approved" }), true);
  }
});

test("approved, scheduled, publishing and terminal outputs move to Pipeline", () => {
  for (const output_state_counts of [
    { Approved: 6 }, { Scheduled: 2, Approved: 2 },
    { Published: 3 }, { Uploading: 1, Approved: 2 },
    { "Platform Processing": 1, "Draft Delivered": 1 },
    { Failed: 1, Approved: 2 },
  ]) {
    assert.equal(needsWork({ output_state_counts, studio_stage: "In Pipeline" }), false);
  }
  assert.equal(needsWork({ output_state_counts: { Queued: 1 }, lifecycle_complete: true }), false);
  assert.equal(needsWork({ output_state_counts: { Rendering: 1 }, studio_stage: "Archived" }), false);
});

test("legacy content without rollups follows production/review stage", () => {
  assert.equal(needsWork({ studio_stage: "Configuring" }), true);
  assert.equal(needsWork({ studio_stage: "Review" }), true);
  assert.equal(needsWork({ studio_stage: "Approved" }), false);
  assert.equal(needsWork({ studio_stage: "Rendering", review_status: "Approved" }), false);
  assert.equal(needsWork({ studio_stage: "Publishing" }), false);
  assert.equal(needsWork({ studio_stage: "Needs Attention" }), false);
});

const draftMatch = source.match(/  function productionRequestIsOpenDraft\(record\) \{[\s\S]*?\n  \}/);
assert.ok(draftMatch, "Draft eligibility helper exists");
const isOpenDraft = vm.runInNewContext("(" + draftMatch[0].trim() + ")");

test("Production Drafts only shows active, unsubmitted Draft and Ready requests", () => {
  assert.equal(isOpenDraft({ status: "Draft", active: true, studio_item4_state: "Draft" }), true);
  assert.equal(isOpenDraft({ status: " Ready ", active: true, studio_item4_state: "Assets Ready" }), true);
  assert.equal(isOpenDraft({ status: "Draft", studio_item4_state: "Plan Ready" }), true);
});

test("submitted, promoted, cancelled and inactive requests never appear in Drafts", () => {
  for (const status of ["Submitted", "Promoted", "Cancelled", "Publishing"]) {
    assert.equal(isOpenDraft({ status, active: true }), false, status);
  }
  assert.equal(isOpenDraft({ status: "Draft", active: false }), false);
  assert.equal(isOpenDraft({ status: "Draft", submitted_at: "2026-11-04T04:48:25.078Z" }), false);
  assert.equal(isOpenDraft({ status: "Ready", promoted_content_item_links: ["recPr6477vjSpwiWG"] }), false);
  assert.equal(isOpenDraft({ status: "Draft", promoted_content_item_links: ["recPr6477vjSpwiWG"], submitted_at: "" }), false);
  for (const stage of ["Production", "Review", "Approved", "Publishing", "Complete"]) {
    assert.equal(isOpenDraft({ status: "Draft", studio_item4_state: stage }), false, stage);
  }
  assert.equal(isOpenDraft(null), false);
});

test("Draft list uses eligibility guard, collapses empty section, retains errors", () => {
  assert.match(source, /records\.filter\(productionRequestIsOpenDraft\)/);
  assert.match(source, /if \(listPanel\) listPanel\.hidden = !drafts\.length/);
  assert.match(source, /if \(listPanel\) listPanel\.hidden = false/);
  assert.doesNotMatch(source, /new Set\(\["Draft", "Ready", "Submitted"\]\)/);
});
