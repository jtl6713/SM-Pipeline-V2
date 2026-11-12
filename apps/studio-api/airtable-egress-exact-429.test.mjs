import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeStudioAirtableActivity } from "./profile-summary-controller.mjs";

const source = readFileSync(new URL("./profile-summary-do.mjs", import.meta.url), "utf8");

test("Worker durable egress records rate limits explicitly without schema migration", () => {
  assert.match(source, /status === 429 \? "429" : status === 0 \? "network"/);
  assert.match(source, /status_class TEXT NOT NULL/);
  assert.match(source, /ON CONFLICT\(hour_utc,source,method,status_class\) DO UPDATE SET attempts=attempts\+1/);
  assert.match(source, /SELECT hour_utc,source,method,status_class,attempts FROM airtable_egress_hourly/);
});

test("Airtable activity separates reads from write attempts", () => {
  const activity = summarizeStudioAirtableActivity([
    { method: "GET", attempts: 3 },
    { method: "PATCH", attempts: 1 },
    { method: "POST", attempts: 2 },
    { method: "DELETE", attempts: 1 },
  ], 6);
  assert.equal(activity.read_attempts, 3);
  assert.equal(activity.write_attempts, 4);
  assert.equal(activity.any_read, true);
  assert.equal(activity.any_write, true);
  const quiet = summarizeStudioAirtableActivity([], 6);
  assert.equal(quiet.any_read, false);
  assert.equal(quiet.any_write, false);
  assert.equal(quiet.any_activity, false);
});

test("Worker still counts every attempted request by source, method, status, and hour", () => {
  assert.match(source, /const status = Number\(input.status\)/);
  assert.match(source, /this.recordAirtableEgress\(source,method,status,occurred\)/);
  assert.match(source, /status < 0 \|\| status > 599/);
});
