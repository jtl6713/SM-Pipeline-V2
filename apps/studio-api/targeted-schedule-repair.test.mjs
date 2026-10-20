import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-functions-04.mjs"), "utf8");

test("targeted repair is opt-in and requires a single atomic lane", () => {
  assert.match(source, /payload\.repair_date/);
  assert.match(source, /Targeted repair requires exactly one selected profile, platform, and output type/);
  assert.match(source, /Targeted repair requires the atomic scheduling reservation authority/);
  assert.match(source, /Targeted repair cannot run without atomic reservation protection/);
});

test("targeted repair selects only duplicate scheduled stamps on the profile-local date", () => {
  assert.match(source, /maeZonedDateTimeParts\(new Date\(stamp\), timeZone\)/);
  assert.match(source, /localDay === job\.repair_date/);
  assert.match(source, /claimed\.has\(stamp\) \|\| protectedTimes\.includes\(stamp\)/);
  assert.match(source, /eligibleIds = displaced\.map\(\(row\) => row\.id\)/);
});

test("ordinary regeneration keeps its existing full eligible selection", () => {
  assert.match(source, /else \{\s*eligibleIds = eligible\.map\(\(row\) => row\.id\)/);
});
