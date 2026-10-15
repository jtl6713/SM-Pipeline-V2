import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("manual output schedule route preserves the requested time exactly", () => {
  assert.match(source, /exactOverride = options\.exactOverride === true && !immediate/);
  assert.match(source, /exactOverride && !blackout/);
  assert.match(source, /if \(exactOverride\) fields\.Studio_Scheduled_At = iso/);
  assert.match(source, /payload\?\.manual_schedule_override === true/);
});

test("calendar Save Schedule does not 500 when occupancy Brand is missing", () => {
  const scheduleFn = source.slice(
    source.indexOf("async function scheduleStudioPublishOutput"),
    source.indexOf("function isTikTokPostUrl"),
  );
  assert.match(scheduleFn, /manualScheduleOverride \|\| publishNowImmediate/);
  assert.match(scheduleFn, /studioOccupiedSchedulesOrEmpty/);
  const loadFn = source.slice(
    source.indexOf("async function studioLoadOccupiedScheduleRows"),
    source.indexOf("async function studioLoadOccupiedSchedules"),
  );
  assert.doesNotMatch(loadFn, /"Brand"/);
  assert.match(loadFn, /"Content_Profile"/);
  assert.match(source, /studio_schedule_occupancy_fields_v1: true/);
});


test("Approve and Approve All fail soft when schedule occupancy cannot be read", () => {
  const singleApprove = source.slice(
    source.indexOf("async function approveOutputRecordForPublishing"),
    source.indexOf("async function approveAllOutputsForPublishing"),
  );
  const approveAllStart = source.indexOf("async function approveAllOutputsForPublishing");
  const approveAll = source.slice(
    approveAllStart,
    source.indexOf("async function", approveAllStart + 20),
  );
  assert.match(singleApprove, /studioOccupiedSchedulesOrEmpty/);
  assert.match(approveAll, /studioOccupiedSchedulesOrEmpty/);
  assert.doesNotMatch(singleApprove, /await studioLoadOccupiedSchedules/);
  assert.doesNotMatch(approveAll, /await studioLoadOccupiedSchedules/);
});

test("approval preserves a previously saved manual schedule marker", () => {
  assert.match(source, /const markerIso = String\(f\(record, "Studio_Scheduled_At"\)/);
  assert.match(source, /const existingScheduleIso = String\(/);
  assert.match(source, /else if \(markerIso && !recheckBestSlot\) \{\s*requestedRaw = markerIso;\s*exactOverride = true;/);
  assert.match(source, /const recheckBestSlot = options\.recheckBestSlot === true/);
  assert.match(source, /studio_yt_manual_schedule_lock_v1: true/);
});

test("schedule grid returns linked Content ID and title for calendar labels", () => {
  assert.match(source, /async function scheduleGridContentById/);
  assert.match(source, /fields: \["Content_ID", "Content_Title"\]/);
  assert.match(source, /content_id: content \? f\(content, "Content_ID"\) : null/);
  assert.match(source, /content_title: content \? f\(content, "Content_Title"\)/);
});
