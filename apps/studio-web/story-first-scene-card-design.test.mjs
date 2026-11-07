import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const ui = read("./assets/story-first-workspace.js");
const css = read("./assets/story-first-workspace.css");
const html = read("./index.html");

test("scene cards have real preview provenance and accurately distinguish available candidates from selected media", () => {
  const render = ui.slice(ui.indexOf("function render()"), ui.indexOf("async function propose("));
  assert.match(render, /story-first-shot-hero/);
  assert.match(render, /story-first-shot-thumbnail/);
  assert.match(render, /story-first-shot-title-line/);
  assert.match(render, /story-first-time-pill/);
  assert.match(render, /story-first-status-chip/);
  assert.match(render, /selected_approved&&isId\(shot\.assigned_asset_id\)/);
  assert.match(render, /current\.candidates\[index\]\?\.\[0\]\?\.id/);
  assert.match(render, /Library suggestion · not selected/);
  assert.match(render, /AI image · awaiting review/);
  assert.match(render, /Visual not selected/);
  assert.match(render, /preview\.onerror=/);
  assert.doesNotMatch(render, /https?:\/\/(?:images\.unsplash\.com|source\.unsplash\.com|picsum\.photos)/);
});
test("every editable story field survives the visual redesign", () => {
  assert.match(ui, /const time=sceneField\(card,"timing"/);
  assert.match(ui, /const visual=sceneField\(card,"visual"/);
  assert.match(ui, /const voice=sceneField\(card,"voice"/);
  assert.match(ui, /const media=sceneField\(card,"media"/);
  assert.match(ui, /const mode=sceneField\(card,"sourcing"/);
  assert.match(ui, /time\.oninput=/);
  assert.match(ui, /visual\.oninput=/);
  assert.match(ui, /voice\.oninput=/);
  assert.match(ui, /media\.addEventListener\("change"/);
  assert.match(ui, /mode\.addEventListener\("change"/);
  assert.match(ui, /scenes\.forEach\(\(_,i\)=>discoverScene\(i\)\)/);
});
test("scene-specific responsive styles enforce full-width fields without disturbing other Studio screens", () => {
  const scoped = css.slice(css.indexOf("Script a Short · scene cards v2"));
  assert.ok(scoped.length > 3000, "expected complete scoped redesign");
  assert.match(scoped, /#storyFirstPanel \.story-first-shot-list/);
  assert.match(scoped, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(scoped, /#storyFirstPanel \.story-first-shot > \.story-first-scene-field/);
  assert.match(scoped, /width:\s*100%\s*!important/);
  assert.match(scoped, /min-width:\s*0\s*!important/);
  assert.match(scoped, /@media \(max-width:\s*760px\)/);
  assert.match(scoped, /@media \(max-width:\s*1200px\)/);
  assert.ok(scoped.split("\n").filter(line => /^\s*\.(?:panel|form-field|card)\b/.test(line)).length === 0,
    "no broad global layout overrides");
  const key=html.match(/app-item4-1008\.js\?v=([^"&]+)/)?.[1];
  assert.ok(key,"Studio app release key must exist");
  assert.ok(html.includes("story-first-workspace.css?v="+key));
  assert.ok(html.includes("story-first-workspace.js?v="+key));
});
