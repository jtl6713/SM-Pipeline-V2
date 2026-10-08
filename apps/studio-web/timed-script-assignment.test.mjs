import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "assets/timed-script.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const api = context.StudioTimedScript;

function timeline(sceneCount) {
  return api.buildTimeline(Array.from({ length: sceneCount }, (_, index) => ({
    start_seconds: index * 4,
    end_seconds: (index + 1) * 4,
    voiceover_text: `Scene ${index + 1}`,
    suggested_visual: "Chicago River bridge",
    asset_id: "",
  })));
}

const assets = Array.from({ length: 6 }, (_, index) => ({
  id: `bridge-${index + 1}`,
  name: `Chicago River ${index + 1}.jpeg`,
  order: index + 1,
}));

test("Match stills in order fills fewer scenes than available photos", () => {
  const assigned = api.assignStillsInOrder(timeline(3), assets);
  assert.deepEqual(Array.from(assigned.segments, (scene) => scene.asset_id), ["bridge-1", "bridge-2", "bridge-3"]);
});

test("a named clip fills the scene that asks for it and leaves the photos in place", () => {
  const scenes = api.buildTimeline([
    ...Array.from({ length: 6 }, (_, index) => ({
      start_seconds: index * 4,
      end_seconds: (index + 1) * 4,
      voiceover_text: `Scene ${index + 1}`,
      suggested_visual: `Photo ${index + 1}`,
      asset_id: `photo-${index + 1}`,
    })),
    {
      start_seconds: 24,
      end_seconds: 28,
      voiceover_text: "Sunset seals it.",
      suggested_visual: "Navy Pier Fireworks 12.mp4",
      asset_id: "",
    },
  ]);
  const media = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `photo-${index + 1}`,
      name: `Photo ${index + 1}`,
      order: index + 1,
      media_kind: "photo",
    })),
    { id: "clip-fireworks", name: "Navy Pier Fireworks 12.mp4", order: 7, media_kind: "video" },
  ];
  const assigned = api.assignStillsInOrder(scenes, media);
  assert.deepEqual(
    Array.from(assigned.segments.slice(0, 6), (scene) => scene.asset_id),
    media.slice(0, 6).map((asset) => asset.id),
  );
  assert.equal(assigned.segments[6].asset_id, "clip-fireworks");
});

test("Match stills in order reuses relevant photos after every unique photo is used", () => {
  const assigned = api.assignStillsInOrder(timeline(7), assets);
  assert.equal(assigned.segments.length, 7);
  assert.deepEqual(Array.from(assigned.segments).slice(0, 6).map((scene) => scene.asset_id), assets.map((asset) => asset.id));
  assert.equal(assigned.segments[6].asset_id, "bridge-1");
});
