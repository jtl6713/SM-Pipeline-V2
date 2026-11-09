import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOME_OVERVIEW_PARITY_COLUMNS,
  compareHomeOverviewParity,
  reconcileHomeOverviewWithAirtable,
  homeOverviewParityMetric,
  homeOverviewDisplayMetrics,
} from "./home-supabase-airtable-parity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-11-09T18:00:00.000Z");

function row(id, patch = {}) {
  return {
    id,
    name: id,
    manual: 0,
    failed: 0,
    approval: 0,
    ideas: 0,
    approved_past_due: 0,
    approved_missing_date: 0,
    approved_future: 0,
    pipeline_total: 0,
    scheduled: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    awaiting_final_by_platform: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    approved_future_by_platform: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    pipeline_by_platform: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 },
    approved_calendar_slots: { Facebook: [], Instagram: [], TikTok: [], YouTube: [] },
    metrics: {},
    read_source: "supabase",
    ...patch,
  };
}

test("Home parity columns cover the All Profiles action counts and pipeline cells", () => {
  for (const column of [
    "manual", "failed", "approval", "ideas",
    "approved_past_due", "approved_missing_date",
    "approved_future", "pipeline_total",
    "pipeline.Facebook", "pipeline.Instagram", "pipeline.TikTok", "pipeline.YouTube",
  ]) {
    assert.ok(HOME_OVERVIEW_PARITY_COLUMNS.includes(column), column);
  }
});

test("display metrics match the Home UI calendar math for Pipeline and Past Due", () => {
  const sample = row("recChicago0000001", {
    approval: 2,
    awaiting_final_by_platform: { Facebook: 1, Instagram: 1, TikTok: 0, YouTube: 0 },
    approved_calendar_slots: {
      Facebook: [NOW - 60_000, NOW + 60_000],
      Instagram: [NOW + 120_000],
      TikTok: [],
      YouTube: [NOW - 30_000],
    },
  });
  const metrics = homeOverviewDisplayMetrics(sample, NOW);
  assert.equal(metrics.approved_future, 2); // FB future + IG future
  assert.equal(metrics.approved_past_due, 2); // FB past + YT past
  assert.equal(metrics["pipeline.Facebook"], 2); // 1 future slot + 1 awaiting
  assert.equal(metrics["pipeline.Instagram"], 2); // 1 future slot + 1 awaiting
  assert.equal(metrics.pipeline_total, 4); // 2 future + 2 awaiting
  assert.equal(metrics.approval, 2);
});

test("matching Airtable and Supabase Home rows report counts_match", () => {
  const shared = {
    ideas: 2,
    failed: 3,
    approval: 1,
    awaiting_final_by_platform: { Facebook: 1, Instagram: 0, TikTok: 0, YouTube: 0 },
    approved_calendar_slots: {
      Facebook: [NOW + 10_000],
      Instagram: [],
      TikTok: [],
      YouTube: [],
    },
  };
  const airtable = [row("recChicago0000001", { ...shared, read_source: "airtable" })];
  const supabase = [row("recChicago0000001", shared)];
  const parity = compareHomeOverviewParity(airtable, supabase, { now: NOW });
  assert.equal(parity.status, "counts_match");
  assert.equal(parity.compared_profiles, 1);
  assert.equal(parity.differences.length, 0);
});

test("Ideas and Failed mismatches are reported with Airtable as the authority", () => {
  const airtable = [row("recChicago0000001", { ideas: 2, failed: 3 })];
  const supabase = [row("recChicago0000001", { ideas: 445, failed: 9 })];
  const parity = compareHomeOverviewParity(airtable, supabase, { now: NOW });
  assert.equal(parity.status, "mismatch");
  assert.deepEqual(
    parity.differences.map((diff) => [diff.column, diff.airtable, diff.supabase]),
    [
      ["failed", 3, 9],
      ["ideas", 2, 445],
    ],
  );
});

test("calendar-slot drift is flagged even when stale rollups look equal", () => {
  const airtable = [row("recChicago0000001", {
    approved_past_due: 0,
    approved_future: 1,
    pipeline_total: 1,
    approved_calendar_slots: {
      Facebook: [NOW + 10_000],
      Instagram: [],
      TikTok: [],
      YouTube: [],
    },
  })];
  const supabase = [row("recChicago0000001", {
    approved_past_due: 0,
    approved_future: 1,
    pipeline_total: 1,
    // Stale rollups claim one future, but the slot is already past due.
    approved_calendar_slots: {
      Facebook: [NOW - 10_000],
      Instagram: [],
      TikTok: [],
      YouTube: [],
    },
  })];
  const parity = compareHomeOverviewParity(airtable, supabase, { now: NOW });
  assert.equal(parity.status, "mismatch");
  assert.ok(parity.differences.some((diff) => diff.column === "approved_future" || diff.column === "approved_past_due" || diff.column === "pipeline.Facebook"));
});

test("reconcile replaces the full Airtable display payload for mismatched profiles", () => {
  const airtable = [row("recChicago0000001", {
    ideas: 2,
    failed: 3,
    manual: 1,
    approval: 7,
    awaiting_final_by_platform: { Facebook: 7, Instagram: 0, TikTok: 0, YouTube: 0 },
    approved_calendar_slots: {
      Facebook: [NOW + 50_000],
      Instagram: [],
      TikTok: [],
      YouTube: [],
    },
    scheduled: { Facebook: 4, Instagram: 0, TikTok: 0, YouTube: 0 },
    read_source: "airtable",
    ideas_source: "airtable",
  })];
  const supabase = [row("recChicago0000001", {
    ideas: 445,
    failed: 9,
    manual: 1,
    approval: 7,
    awaiting_final_by_platform: { Facebook: 2, Instagram: 0, TikTok: 0, YouTube: 0 },
    approved_calendar_slots: {
      Facebook: [NOW - 50_000],
      Instagram: [],
      TikTok: [],
      YouTube: [],
    },
    scheduled: { Facebook: 1, Instagram: 0, TikTok: 0, YouTube: 0 },
  })];
  const parity = compareHomeOverviewParity(airtable, supabase, { now: NOW });
  const reconciled = reconcileHomeOverviewWithAirtable(supabase, airtable, parity);
  assert.equal(reconciled[0].ideas, 2);
  assert.equal(reconciled[0].failed, 3);
  assert.equal(reconciled[0].manual, 1);
  assert.equal(reconciled[0].approval, 7);
  assert.deepEqual(reconciled[0].approved_calendar_slots.Facebook, [NOW + 50_000]);
  assert.equal(reconciled[0].awaiting_final_by_platform.Facebook, 7);
  assert.equal(homeOverviewParityMetric(reconciled[0], "pipeline.Facebook", NOW), 8);
  assert.equal(reconciled[0].ideas_source, "airtable");
  assert.equal(reconciled[0].read_source, "supabase_reconciled_airtable");
  assert.equal(reconciled[0].parity_reconciled, true);
});

test("force refresh publishes first, then runs Airtable parity off the critical path with a stable generation", () => {
  const functions04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
  const start = functions04.indexOf("export async function runStudioProfilesOverviewForceRefresh");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:runStudioProfilesOverviewForceRefresh__*/", start);
  const force = functions04.slice(start, end);
  const completedAt = force.indexOf('status: "completed"');
  const parityAt = force.indexOf("runHomeOverviewAirtableParityAfterRefresh");
  assert.ok(completedAt > 0 && parityAt > completedAt, "parity must run after status=completed");
  assert.match(force, /status: "pending"/);
  assert.match(functions04, /compareHomeOverviewParity/);
  assert.match(functions04, /reconcileHomeOverviewWithAirtable/);
  assert.match(functions04, /forceAirtable: true/);
  assert.match(functions04, /overview-force-airtable-parity/);
  assert.match(functions04, /options\.forceAirtable !== true && studioHomeReadSource\(env\) === "supabase"/);
  assert.match(functions04, /const parityGeneration = String\(baselineGeneration \|\| ""\)/);
  assert.doesNotMatch(functions04, /\$\{baselineGeneration\}-parity/);
});
