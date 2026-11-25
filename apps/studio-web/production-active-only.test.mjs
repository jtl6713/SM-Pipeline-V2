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
    { Rendered: 1, Scheduled: 2 },
    { "Review Held": 1, Approved: 2 },
    { "Changes Requested": 1, Published: 2 },
    { "Waiting in Render Queue": 1, Published: 3 },
    { "Trying Again": 1, Approved: 1 },
  ]) {
    assert.equal(needsWork({ output_state_counts, studio_stage: "Approved" }), true);
  }
});

test("approved, scheduled, publishing and terminal outputs move to Pipeline", () => {
  for (const output_state_counts of [
    { "Ready for Review": 1, Scheduled: 2 },
    { "Ready for Review": 4 },
    { "Ready for Review": 1, Failed: 1 },
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

test("legacy content without rollups requires real linked outputs", () => {
  assert.equal(needsWork({ studio_stage: "Configuring", output_links: ["recLegacy1"] }), true);
  assert.equal(needsWork({ studio_stage: "Review", output_links: ["recLegacy1"] }), true);
  assert.equal(needsWork({ studio_stage: "Generating", output_links: [] }), false);
  assert.equal(needsWork({ studio_stage: "Review", output_links: [] }), false);
  assert.equal(needsWork({ studio_stage: "Generating" }), false);
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

test("Factory returned Chicago River Draft remains visible with its promoted content link", () => {
  const revision = {
    id: "recwSzrkVi1LuwuJW",
    status: "Draft",
    active: true,
    revision_open: true,
    promoted_content_item_links: ["recRFZDxZ1vx8Mkvn"],
    studio_item4_state: "Review",
  };
  assert.equal(isOpenDraft(revision), true);
  assert.equal(isOpenDraft({ ...revision, active: false }), true,
    "the verified return marker overrides an older promoted Active=false");
  assert.equal(isOpenDraft({ ...revision, status: "Promoted" }), true);
  assert.equal(isOpenDraft({ ...revision, status: "Ready" }), true);
  assert.equal(isOpenDraft({ ...revision, revision_open: false }), false,
    "an ordinary promoted-content Draft must remain hidden");
  assert.equal(isOpenDraft({ ...revision, status: "Submitted" }), false,
    "the normal submitted pipeline stage remains separate");
  assert.equal(isOpenDraft({ ...revision, status: "Cancelled" }), false,
    "the return marker cannot resurrect cancelled requests");
  assert.match(source, /r\.revision_open === true \|\| String\(r\.status \|\| ""\)\.toLowerCase\(\) === "promoted" \? "Revise"/);
});

test("Draft list uses eligibility guard, collapses empty section, retains errors", () => {
  assert.match(source, /records\.filter\(productionRequestIsOpenDraft\)/);
  assert.match(source, /if \(listPanel\) listPanel\.hidden = !drafts\.length/);
  assert.match(source, /if \(listPanel\) listPanel\.hidden = false/);
  const draftList = source.slice(source.indexOf("  async function loadProductionRequests("), source.indexOf("  function ideaStructureLabel("));
  assert.doesNotMatch(draftList, /new Set\(\["Draft", "Ready", "Submitted"\]\)/);
});

test("Home eligibility wins over stale Production stage and private revision outputs", () => {
  assert.equal(needsWork({
    content_id: 1933, studio_stage: "Needs Attention",
    output_state_counts: { "Changes Requested": 4, Approved: 2 },
    production_active_output_count: 0,
  }), false, "Chicago Do_Not_Publish revisions must not look active");
  assert.equal(needsWork({
    content_id: 1535, studio_stage: "Preparing Assets",
    output_state_counts: { "Preparing Assets": 1 },
    production_active_output_count: 0,
  }), false, "Miami ghost row with no Home-eligible outputs must be hidden");
  assert.equal(needsWork({
    title: "Coney Off-Season Vibes", production_active_output_count: 3,
    studio_stage: "Rendering", output_state_counts: { "Preparing Assets": 3 },
  }), true);
  assert.equal(needsWork({
    title: "Astoria N-Line Soundscape", production_active_output_count: 4,
    studio_stage: "Preparing Assets", output_state_counts: { "Waiting in Render Queue": 1, "Preparing Assets": 3 },
  }), true, "undated Astoria parent must remain visible");
  assert.equal(needsWork({
    title: "Astoria N-Line Soundscape", production_active_output_count: 4,
    lifecycle_complete: true,
  }), true, "output proof wins over stale complete parent badge");
});

test("Production summary explains Home output counts separately from parent content rows", () => {
  assert.match(source, /production-active-summary/);
  assert.match(source, /Home counts outputs; Production groups them by piece/);
  assert.match(source, /r\.production_active_output_count,\s*r\.production_diagnostics,\s*r\.lifecycle_complete/);
});
