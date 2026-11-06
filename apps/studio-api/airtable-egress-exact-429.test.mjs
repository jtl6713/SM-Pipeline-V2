import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./profile-summary-do.mjs", import.meta.url), "utf8");

test("Worker durable egress records rate limits explicitly without schema migration", () => {
  assert.match(source, /status === 429 \? "429" : status === 0 \? "network"/);
  assert.match(source, /status_class TEXT NOT NULL/);
  assert.match(source, /ON CONFLICT\(hour_utc,source,method,status_class\) DO UPDATE SET attempts=attempts\+1/);
  assert.match(source, /SELECT hour_utc,source,method,status_class,attempts FROM airtable_egress_hourly/);
});

test("Worker still counts every attempted request by source, method, status, and hour", () => {
  assert.match(source, /const status = Number\(input.status\)/);
  assert.match(source, /this.recordAirtableEgress\(source,method,status,occurred\)/);
  assert.match(source, /status < 0 \|\| status > 599/);
});
