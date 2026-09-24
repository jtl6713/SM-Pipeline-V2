import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("manual output schedule route preserves the requested time exactly", () => {
  assert.match(source, /exactOverride = options\.exactOverride === true && !immediate/);
  assert.match(source, /occupiedMs && !exactOverride \? studioNextOpenScheduleIso/);
  assert.match(source, /if \(exactOverride\) fields\.Studio_Scheduled_At = iso/);
  assert.match(source, /payload\?\.manual_schedule_override === true/);
});

test("approval preserves a previously saved manual schedule marker", () => {
  assert.match(source, /const markerIso = String\(f\(record, "Studio_Scheduled_At"\)/);
  assert.match(source, /Math\.abs\(requestedMs - markerMs\) < 60000/);
  assert.match(source, /exactOverride: manualScheduleOverride/);
});
