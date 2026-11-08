import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const ui = read("./assets/story-first-workspace.js");
const css = read("./assets/story-first-workspace.css");
const begin = ui.indexOf("  function sceneDisclosure(index) {");
const end = ui.indexOf("  function render() {", begin);
assert.ok(begin >= 0 && end > begin, "scene disclosure function must exist");

function setup() {
  const current = { expandedScenes: new Set() };
  const node = (tag, cls) => {
    assert.equal(tag, "details");
    assert.equal(cls, "story-first-shot");
    return {
      open: false, isConnected: true,
      events: new Map(),
      addEventListener(type, callback) { this.events.set(type, callback); },
      toggle(value) { this.open = value; this.events.get("toggle")(); },
    };
  };
  const sceneDisclosure = vm.runInNewContext(
    "(() => {" + ui.slice(begin, end) + ";return sceneDisclosure;})()",
    { current, node },
  );
  return { current, sceneDisclosure };
}

test("all scene cards are collapsed by default, with independent native details toggles", () => {
  const { current, sceneDisclosure } = setup();
  const one = sceneDisclosure(0), two = sceneDisclosure(1);
  assert.equal(one.open, false);
  assert.equal(two.open, false);
  one.toggle(true);
  assert.equal(current.expandedScenes.has(0), true);
  assert.equal(current.expandedScenes.has(1), false);
  assert.equal(sceneDisclosure(0).open, true, "open state survives async scene-list rerender");
  assert.equal(sceneDisclosure(1).open, false, "other scenes stay collapsed");
  one.toggle(false);
  assert.equal(sceneDisclosure(0).open, false);
});

test("stale detached scene toggle events cannot mutate the active UI state", () => {
  const { current, sceneDisclosure } = setup();
  const stale = sceneDisclosure(2);
  stale.isConnected = false;
  stale.toggle(true);
  assert.equal(current.expandedScenes.size, 0);
  const active = sceneDisclosure(2);
  active.toggle(true);
  assert.equal(current.expandedScenes.has(2), true);
  current.expandedScenes.clear();
  assert.equal(sceneDisclosure(2).open, false, "a reopened or regenerated plan starts fully collapsed");
});

test("entire preview/title/time/status summary is clickable, including keyboard access", () => {
  const render = ui.slice(ui.indexOf("  function render() {"), ui.indexOf("  // Reject the whole AI storyboard"));
  assert.match(render, /const card=sceneDisclosure\(index\)/);
  assert.match(render, /const hero=node\("summary","story-first-shot-hero"\)/);
  assert.match(render, /put\(hero,thumb,heroCopy,caret\)/);
  assert.match(render, /card\.appendChild\(hero\)/);
  assert.match(css, /\.story-first-shot-hero:focus-visible/);
  assert.match(css, /details\.story-first-shot:not\(\[open\]\) > :not\(summary\)[\s\S]*?display: none !important/);
  assert.match(css, /details\.story-first-shot\[open\] \.story-first-shot-caret/);
  assert.doesNotMatch(render, /node\("article","story-first-shot"\)/);
});

test("scene disclosure resets on new plan, reopened Idea, rejection, and profile switch, not on save", () => {
  assert.equal((ui.match(/current\.expandedScenes\.clear\(\)/g) || []).length, 4);
  assert.match(ui, /current\.story = JSON\.parse\(JSON\.stringify\(story\)\);\s*current\.expandedScenes\.clear\(\)/);
  assert.match(ui, /current\.selectedAssetNames = \{\};\s*current\.expandedScenes\.clear\(\)/);
  const saving = ui.slice(ui.indexOf("  async function save() {"), ui.indexOf("  async function openAssetManager() {"));
  assert.doesNotMatch(saving, /expandedScenes/);
  assert.match(ui, /const time=sceneField\(card,"timing"/);
  assert.match(ui, /const voice=sceneField\(card,"voice"/);
  assert.match(ui, /const media=sceneField\(card,"media"/);
  assert.match(ui, /const mode=sceneField\(card,"sourcing"/);
});
