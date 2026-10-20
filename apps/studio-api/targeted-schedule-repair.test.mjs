import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectTargetedScheduleOverages } from "./targeted-schedule-selection.mjs";

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-functions-04.mjs"), "utf8");
const t = "2026-11-17T16:30:00Z";
const r = (id, outputId, type, immutable = false, scheduledAt = t) =>
  ({ id, outputId, type, immutable, scheduledAt });

test("published/blocked reservation wins and only eligible excess moves", () => {
  const rows = [r("reel", 1, "Reel"), r("published-story", 20, "Story", true)];
  assert.deepEqual(selectTargetedScheduleOverages(rows, ["reel"]), ["reel"]);
});
test("different output types on the same platform cannot share the timestamp", () => {
  const rows = [r("reel", 10, "Reel"), r("story", 11, "Story")];
  assert.deepEqual(selectTargetedScheduleOverages(rows, ["reel", "story"]), ["story"]);
  assert.deepEqual(selectTargetedScheduleOverages(rows, ["story"]), ["story"]);
  assert.deepEqual(selectTargetedScheduleOverages(rows, ["reel"]), []);
});
test("only exact duplicate stamps are displaced and no unrelated item moves", () => {
  const rows = [r("one", 1, "Reel"), r("two", 2, "Reel"), r("elsewhere", 3, "Reel", false, "2026-11-17T18:00:00Z")];
  assert.deepEqual(selectTargetedScheduleOverages(rows, ["one", "two", "elsewhere"]), ["two"]);
});
test("repair is single lane, opt-in and atomic only", () => {
  assert.ok(source.includes("payload.repair_date"));
  assert.ok(source.includes("Targeted repair requires exactly one selected profile, platform, and output type"));
  assert.ok(source.includes("Targeted repair requires the atomic scheduling reservation authority"));
  assert.ok(source.includes("Targeted repair cannot run without atomic reservation protection"));
  assert.ok(source.includes("selectTargetedScheduleOverages(matching"));
  assert.ok(source.includes("Targeted repair requires a complete platform occupancy scan"));
});
test("ordinary regeneration retains original selection", () => {
  assert.ok(source.includes("eligibleIds = eligible.map((row) => row.id)"));
});
