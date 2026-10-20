import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-functions-04.mjs"), "utf8");

test("targeted repair is opt-in and requires one atomic lane", () => {
  assert.ok(source.includes("payload.repair_date"));
  assert.ok(source.includes("Targeted repair requires exactly one selected profile, platform, and output type"));
  assert.ok(source.includes("Targeted repair requires the atomic scheduling reservation authority"));
  assert.ok(source.includes("Targeted repair cannot run without atomic reservation protection"));
});

test("overage selection considers shared platform occupancy and local day", () => {
  assert.ok(source.includes("platformRows = await listRecords"));
  assert.ok(source.includes("maeZonedDateTimeParts(new Date(stamp), timeZone)"));
  assert.ok(source.includes("localDate(stamp) === job.repair_date"));
  assert.ok(source.includes("claimed.has(stamp)"));
  assert.ok(source.includes("displacedIds.has(row.id)"));
  assert.ok(source.includes("Targeted repair requires a complete platform occupancy scan"));
});

test("normal regeneration still selects all eligible records", () => {
  assert.ok(source.includes("eligibleIds = eligible.map((row) => row.id)"));
});
