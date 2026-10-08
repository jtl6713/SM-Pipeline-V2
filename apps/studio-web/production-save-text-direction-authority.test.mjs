import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");

test("Production Save keeps just-saved title caption and script authoritative through output sync", async () => {
  const source = await readFile(appPath, "utf8");
  const start = source.indexOf("async function saveActiveProductionRequest");
  const end = source.indexOf("outputMatrixInputs().forEach", start);
  const fn = source.slice(start, end);
  assert.match(fn, /const savedTextDirections = \{/);
  assert.match(fn, /requested_title: payload\.requested_title/);
  assert.match(fn, /requested_caption: payload\.requested_caption/);
  assert.match(fn, /requested_script: payload\.requested_script/);
  assert.match(fn, /activeProductionRequest = \{ \.\.\.activeProductionRequest, \.\.\.savedTextDirections \};/);
});

test("output matrix save merges parent response instead of replacing the active Production Request", async () => {
  const source = await readFile(appPath, "utf8");
  const start = source.indexOf("async function saveProductionRequestOutputs");
  const end = source.indexOf("function setProductionRequestControlState", start);
  const fn = source.slice(start, end);
  assert.match(fn, /mergeProductionRequestRecord\(activeProductionRequest, result\.production_request\)/);
  assert.doesNotMatch(fn, /activeProductionRequest = result\.production_request;/);
});
