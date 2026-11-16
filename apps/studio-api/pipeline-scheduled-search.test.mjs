import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { pipelineTitleSearchLike, pipelineTitleSearchTokens } from "./supabase-pipeline-reads.mjs";

test("scheduled title search drops quotes and a trailing plural", () => {
  assert.deepEqual(pipelineTitleSearchTokens('"fall colors"'), ["fall", "color"]);
  assert.equal(pipelineTitleSearchLike("fall color"), "*fall*color*");
  assert.equal(pipelineTitleSearchLike("  "), "");
});

test("pipeline search asks for every week instead of the calendar window", () => {
  const app = fs.readFileSync(new URL("../studio-web/assets/app-item4-1008.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  assert.match(app, /mode=scheduled_search/);
  assert.match(app, /Searching every week/);
  assert.match(app, /all weeks/);
  assert.match(worker, /mode"\) === "scheduled_search"/);
  assert.match(worker, /scope: "all_weeks"/);
  assert.doesNotMatch(worker.slice(worker.indexOf('mode") === "scheduled_search"'), worker.indexOf('mode") === "latest"')), /8 \* 24 \* 60 \* 60 \* 1000/);
});
