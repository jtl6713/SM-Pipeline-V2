import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Production library picker uses flat operator search like Ideas", async () => {
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");
  assert.match(app, /BUILD_ID = "item4-0.6.662-factory-preview"/);
  assert.match(html, /UI build 0\.6\.662/);
  const start = app.indexOf("function renderItem4LibraryPicker");
  const fn = app.slice(start, start + 1600);
  assert.match(fn, /const operatorSearch = Boolean\(searchValue\)/);
  assert.match(fn, /\{ flat: operatorSearch \}/);
  assert.match(fn, /search is not limited to this idea/);
  const loadStart = app.indexOf("async function loadItem4LibraryStills");
  const load = app.slice(loadStart, loadStart + 2200);
  assert.match(load, /\(operatorSearch \|\| quoted\.phrase\)\s*\?\s*new Set\(\)/);
});

test("Save draft busy label is manual-only and survives control-state redraws", async () => {
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const saveStart = app.indexOf("async function saveActiveProductionRequest");
  const saveEnd = app.indexOf("outputMatrixInputs().forEach", saveStart);
  const save = app.slice(saveStart, saveEnd > saveStart ? saveEnd : saveStart + 5000);
  assert.match(save, /if \(!quiet && button\) \{\s*button\.disabled = true;/s);
  assert.match(save, /timeoutMs: quiet \? 20000 : 45000/);
  assert.match(save, /if \(!quiet && button\) \{\s*delete button\.dataset\.busy/s);

  const controlStart = app.indexOf("function setProductionRequestControlState");
  const control = app.slice(controlStart, controlStart + 2200);
  assert.match(control, /save\.dataset\.busy === "true"/);
  assert.match(control, /Saving draft…/);
});
