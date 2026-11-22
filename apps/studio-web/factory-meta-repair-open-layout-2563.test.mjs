import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/factory-layout-0680.css", import.meta.url), "utf8");

test("held Meta Repair outputs have two exact-output Open controls", () => {
  assert.match(js, /class="factory-repair-title-link" data-factory-open="\$\{esc\(card\.id\)\}"/);
  assert.match(js, /meta_repair_required === true \? "Open output" : "Open"/);
  assert.match(js, /querySelectorAll\("\[data-factory-open\]"\)/);
  assert.match(js, /await openStudioTarget\(card\)/);
  assert.match(js, /FactoryOpenTargets\?\.resolve\?\.\(card\)/);
});

test("Repair rows and action buttons are never compressed into the 28px legacy row", () => {
  const rules = css.slice(css.indexOf("FACTORY_REPAIR_ROWS_2563"));
  assert.ok(rules.startsWith("FACTORY_REPAIR_ROWS_2563"));
  assert.match(rules, /\.factory-band-manual \.factory-line\s*\{[^}]*height:auto;[^}]*min-height:92px;/);
  assert.match(rules, /\.factory-band-manual \.factory-line-title\s*\{[^}]*white-space:normal;[^}]*overflow:visible;/);
  assert.match(rules, /\.factory-band-manual \.factory-line-actions > button\s*\{[^}]*min-height:36px;/);
  assert.match(rules, /\.factory-repair-title-link:focus-visible/);
  assert.match(rules, /@media \(max-width:1200px\)/);
  assert.match(rules, /@media \(max-width:760px\)/);
  assert.match(rules, /\.factory-band-manual \.factory-line \.factory-line-cell \{ display:block; \}/);
});

test("repair navigation remains read-only: no auto approval or publication on Open", () => {
  const open = js.slice(js.indexOf("async function openStudioTarget("),js.indexOf("function canReviewActions(",js.indexOf("async function openStudioTarget(")));
  assert.match(open, /StudioOpenPipelineOutputById/);
  assert.doesNotMatch(open, /\/api\/factory\/approve|publish-now|do_not_publish\s*=\s*false/);
});
