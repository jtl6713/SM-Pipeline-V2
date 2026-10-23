import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here,"index.html"),"utf8");
const js = fs.readFileSync(path.join(here,"assets/global-idea-target.js"),"utf8");

test("Global Admin exposes one combined limit independent of selected city", () => {
  assert.match(html, /id="operationsGlobalPanel"/);
  assert.match(html, /id="operationsGlobalIdeaTarget"/);
  assert.match(html, /id="operationsSaveGlobalIdeaTarget"/);
  assert.match(html, /across every active Shining Cities profile/i);
  assert.match(html, /assets\/global-idea-target\.js/);
});
test("control loads persisted value and independently PUTs only global automatic target", () => {
  assert.match(js, /request\("GET"\)/);
  assert.match(js, /request\("PUT", \{ global_automatic_idea_target: value \}\)/);
  assert.match(js, /verified\.global_automatic_idea_target !== value/);
  assert.doesNotMatch(js, /scheduling_horizon_days:/);
});
