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
} from "./home-supabase-airtable-parity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

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
    metrics: {},
    read_source: "supabase",
    ...patch,
  };
}

test("Home parity columns cover the All Profiles action counts", () => {
  for (const column of [
    "manual", "failed", "approval", "ideas",
    "approved_past_due", "approved_missing_date",
  ]) {
    assert.ok(HOME_OVERVIEW_PARITY_COLUMNS.includes(column), column);
  }
  assert.ok(HOME_OVERVIEW_PARITY_COLUMNS.includes("scheduled.Instagram"));
});

test("matching Airtable and Supabase Home rows report counts_match", () => {
  const airtable = [row("recChicago0000001", { ideas: 2, failed: 3, scheduled: { Facebook: 1, Instagram: 2, TikTok: 0, YouTube: 1 } })];
  const supabase = [row("recChicago0000001", { ideas: 2, failed: 3, scheduled: { Facebook: 1, Instagram: 2, TikTok: 0, YouTube: 1 } })];
  const parity = compareHomeOverviewParity(airtable, supabase);
  assert.equal(parity.status, "counts_match");
  assert.equal(parity.compared_profiles, 1);
  assert.equal(parity.differences.length, 0);
});

test("Ideas and Failed mismatches are reported with Airtable as the authority", () => {
  const airtable = [row("recChicago0000001", { ideas: 2, failed: 3 })];
  const supabase = [row("recChicago0000001", { ideas: 445, failed: 9 })];
  const parity = compareHomeOverviewParity(airtable, supabase);
  assert.equal(parity.status, "mismatch");
  assert.deepEqual(
    parity.differences.map((diff) => [diff.column, diff.airtable, diff.supabase]),
    [
      ["failed", 3, 9],
      ["ideas", 2, 445],
    ],
  );
});

test("reconcile overwrites only mismatched columns from Airtable", () => {
  const airtable = [row("recChicago0000001", {
    ideas: 2,
    failed: 3,
    manual: 1,
    approval: 7,
    scheduled: { Facebook: 4, Instagram: 0, TikTok: 0, YouTube: 0 },
  })];
  const supabase = [row("recChicago0000001", {
    ideas: 445,
    failed: 9,
    manual: 1,
    approval: 7,
    scheduled: { Facebook: 1, Instagram: 0, TikTok: 0, YouTube: 0 },
  })];
  const parity = compareHomeOverviewParity(airtable, supabase);
  const reconciled = reconcileHomeOverviewWithAirtable(supabase, airtable, parity);
  assert.equal(reconciled[0].ideas, 2);
  assert.equal(reconciled[0].failed, 3);
  assert.equal(reconciled[0].manual, 1);
  assert.equal(reconciled[0].approval, 7);
  assert.equal(homeOverviewParityMetric(reconciled[0], "scheduled.Facebook"), 4);
  assert.equal(reconciled[0].ideas_source, "airtable");
  assert.equal(reconciled[0].read_source, "supabase_reconciled_airtable");
  assert.equal(reconciled[0].parity_reconciled, true);
});

test("force refresh runs Airtable parity when Home is on Supabase", () => {
  const functions04 = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
  const start = functions04.indexOf("export async function runStudioProfilesOverviewForceRefresh");
  const end = functions04.indexOf("/*__STUDIO_WORKER_END:runStudioProfilesOverviewForceRefresh__*/", start);
  const force = functions04.slice(start, end);
  assert.match(force, /compareHomeOverviewParity/);
  assert.match(force, /reconcileHomeOverviewWithAirtable/);
  assert.match(force, /forceAirtable: true/);
  assert.match(force, /overview-force-airtable-parity/);
  assert.match(force, /home_parity/);
  assert.match(functions04, /options\.forceAirtable !== true && studioHomeReadSource\(env\) === "supabase"/);
});
