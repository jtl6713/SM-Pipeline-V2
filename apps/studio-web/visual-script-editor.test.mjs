import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(here, "assets/visual-script-editor.js"), "utf8");
const context = {};
vm.runInNewContext(source, context);
const helpers = context.StudioVisualScriptEditor.__test;

test("client fit estimate follows the server visual-window contract", () => {
  assert.equal(helpers.estimateSeconds("one two three four five"), 2);
  assert.equal(helpers.fitsVisual("one two three four five", 2000), true);
  assert.equal(helpers.fitsVisual("one two three four five six", 2000), false);
});

test("mode and selected scene helpers are deterministic", () => {
  assert.equal(helpers.normalizeMode("SELECTED"), "selected");
  assert.equal(helpers.normalizeMode("anything"), "all");
  assert.deepEqual(
    Array.from(helpers.selectedIdsFromRows([
      { scene_id: "a", selected: true, voiceover_mode: "narrated" },
      { scene_id: "b", selected: true, voiceover_mode: "silent" },
      { scene_id: "c", selected: false, voiceover_mode: "narrated" },
    ])),
    ["a"],
  );
});

test("editor exposes compare, selected-scene, lock, accept and discard controls", () => {
  assert.match(source, /All unlocked narrated scenes/);
  assert.match(source, /Selected scenes only/);
  assert.match(source, /data-script-lock/);
  assert.match(source, /data-script-current/);
  assert.match(source, /data-script-proposed/);
  assert.match(source, /Accept proposal/);
  assert.match(source, /Discard proposal/);
  assert.match(source, /TTS\/render have not started/);
});

test("editor never treats proposal generation as an implicit accept", () => {
  assert.match(source, /await b\.propose/);
  assert.match(source, /await b\.accept/);
  assert.match(source, /state\.proposal = result\.proposal/);
  assert.doesNotMatch(source, /propose\([^)]*\)[\s\S]{0,120}accept\(/);
});
