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
  assert.match(source, /const existingScheduleIso = String\(/);
  assert.match(source, /else if \(markerIso\) \{\s*requestedRaw = markerIso;\s*exactOverride = true;/);
  assert.match(source, /studio_yt_manual_schedule_lock_v1: true/);
});

test("schedule grid returns linked Content ID and title for calendar labels", () => {
  assert.match(source, /async function scheduleGridContentById/);
  assert.match(source, /fields: \["Content_ID", "Content_Title"\]/);
  assert.match(source, /content_id: content \? f\(content, "Content_ID"\) : null/);
  assert.match(source, /content_title: content \? f\(content, "Content_Title"\)/);
});
