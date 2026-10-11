import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  VIBE_CUT_INPUT,
  VIBE_CUT_STYLES,
  anotherCutFromUnused,
  buildVibeCutEdit,
  defaultVibeCutConfig,
  formatVibeCutDirective,
  isVibeCutNotes,
  mergeVibeCutIntoNotes,
  normalizeVibeCutEnergy,
  normalizeVibeCutStyle,
  parseVibeCutDirective,
  proposeVibeCuts,
  provisionalSelectsFromDuration,
  rankVibeSelects,
  selectsFromSceneTimestamps,
  stripVibeCutDirective,
  vibeCutOriginNotes,
  vibeCutProductionDefaults,
  vibeCutRenderSettings,
  vibeCutStyleParams,
} from "./vibe-cut.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("style and energy normalize with Beat Cut default", () => {
  assert.equal(normalizeVibeCutStyle("Beat Cut"), VIBE_CUT_STYLES.BEAT_CUT);
  assert.equal(normalizeVibeCutStyle("smooth"), VIBE_CUT_STYLES.SMOOTH_VIBES);
  assert.equal(normalizeVibeCutStyle("FAST_CUTS"), VIBE_CUT_STYLES.FAST_CUTS);
  assert.equal(normalizeVibeCutEnergy(null, "smooth-vibes"), 2);
  assert.equal(normalizeVibeCutEnergy(9, "beat-cut"), 3);
  assert.equal(normalizeVibeCutEnergy(4), 4);
});

test("energy shortens preferred clip length", () => {
  const calm = vibeCutStyleParams("beat-cut", 1);
  const hot = vibeCutStyleParams("beat-cut", 5);
  assert.ok(hot.preferredClip < calm.preferredClip);
  assert.ok(hot.speedRampChance >= calm.speedRampChance);
});

test("directive round-trips through Production Notes", () => {
  const config = defaultVibeCutConfig({
    style: "smooth-vibes",
    energy: 2,
    target_seconds: 45,
    chronology: "chronological",
    versions: 3,
  });
  const line = formatVibeCutDirective(config);
  assert.match(line, /^\[vibe-cut\] \{/);
  const parsed = parseVibeCutDirective(`${line}\noperator note`);
  assert.equal(parsed.style, VIBE_CUT_STYLES.SMOOTH_VIBES);
  assert.equal(parsed.energy, 2);
  assert.equal(parsed.target_seconds, 45);
  assert.equal(parsed.versions, 3);
  assert.equal(parsed.voiceover, "off");
  assert.equal(stripVibeCutDirective(`${line}\nkeep me`), "keep me");
});

test("origin notes stamp ez-input=vibe-cut", () => {
  const notes = vibeCutOriginNotes({
    config: { style: "beat-cut", energy: 3, target_seconds: 30 },
  });
  assert.match(notes, /ez-input=vibe-cut/);
  assert.match(notes, /ez-package=video/);
  assert.match(notes, /\[vibe-cut\]/);
  assert.equal(isVibeCutNotes(notes), true);
});

test("mergeVibeCutIntoNotes rewrites input and render-settings", () => {
  const merged = mergeVibeCutIntoNotes(
    "origin=ez-wizard; ez-input=single-photo; ez-caption=ai\n[render-settings] preset=auto; beat_sync=off",
    { style: "fast-cuts", energy: 5, target_seconds: 15 },
  );
  assert.match(merged, /ez-input=vibe-cut/);
  assert.match(merged, /\[vibe-cut\]/);
  assert.match(merged, /\[render-settings\].*beat_sync=on/);
  assert.match(merged, /pacing=fast/);
  assert.equal(isVibeCutNotes(merged), true);
});

test("production defaults turn voiceover off and music on", () => {
  const defaults = vibeCutProductionDefaults({ target_seconds: 30 });
  assert.equal(defaults.voiceover_mode, "No");
  assert.equal(defaults.background_music_mode, "Yes");
  assert.equal(defaults.content_type, "Vertical Short Video");
  assert.equal(defaults.video_duration_seconds, 30);
  const render = vibeCutRenderSettings({ style: "beat-cut", energy: 3 });
  assert.equal(render.beat_sync, "on");
  assert.equal(render.transition, "cut");
});

test("rank prefers unused footage when asked", () => {
  const selects = [
    { id: "a", start_seconds: 0, end_seconds: 3, score: 0.9 },
    { id: "b", start_seconds: 10, end_seconds: 13, score: 0.7 },
  ];
  const used = [{ start_seconds: 0, end_seconds: 3 }];
  const ranked = rankVibeSelects(selects, { preferUnused: true, usedRanges: used });
  assert.equal(ranked[0].id, "b");
});

test("build edit snaps to beats and varies clip length with motion", () => {
  const selects = provisionalSelectsFromDuration(120, { count: 18 });
  selects[0].motion_score = 0.1;
  selects[0].score = 0.95;
  selects[1].motion_score = 0.9;
  selects[1].score = 0.9;
  const beats = [];
  for (let t = 0; t <= 30; t += 0.5) beats.push(t);
  const edit = buildVibeCutEdit({
    selects,
    beats,
    config: { style: "beat-cut", energy: 3, target_seconds: 22, chronology: "best-moments" },
  });
  assert.ok(edit.clip_count >= 6);
  assert.ok(edit.duration_seconds <= 22.05);
  assert.ok(edit.clips.every((clip) => clip.duration_seconds >= 0.4));
  assert.ok(edit.clips.some((clip) => clip.beat_sync === true));
  assert.match(edit.label, /Vibe Cut 1/);
});

test("proposeVibeCuts returns multiple versions that avoid reused ranges", () => {
  const selects = provisionalSelectsFromDuration(240, { count: 24 });
  const beats = Array.from({ length: 60 }, (_, i) => i * 0.5);
  const proposal = proposeVibeCuts({
    selects,
    beats,
    config: { style: "beat-cut", energy: 3, target_seconds: 20, versions: 3 },
  });
  assert.equal(proposal.cut_count, 3);
  assert.deepEqual(proposal.actions, ["keep", "regenerate", "create_another_from_unused"]);
  const firstUsed = new Set(proposal.cuts[0].used_ranges.map((r) => `${r.start_seconds}-${r.end_seconds}`));
  const thirdStarts = proposal.cuts[2].used_ranges.map((r) => `${r.start_seconds}-${r.end_seconds}`);
  const overlap = thirdStarts.filter((key) => firstUsed.has(key));
  assert.ok(overlap.length < thirdStarts.length, "later versions should prefer unused ranges");
});

test("anotherCutFromUnused favors remaining footage", () => {
  const selects = [
    { id: "used", start_seconds: 0, end_seconds: 4, score: 0.99, motion_score: 0.5 },
    { id: "fresh", start_seconds: 40, end_seconds: 45, score: 0.7, motion_score: 0.5 },
  ];
  const edit = anotherCutFromUnused({
    selects,
    beats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    config: { target_seconds: 8, style: "smooth-vibes", energy: 2 },
    usedRanges: [{ start_seconds: 0, end_seconds: 4 }],
  });
  assert.ok(edit.clips.some((clip) => clip.select_id === "fresh"));
});

test("scene timestamps become selects; empty falls back to provisional", () => {
  const fromScenes = selectsFromSceneTimestamps([2, 5, 12, 20], 30);
  assert.ok(fromScenes.length >= 3);
  assert.ok(fromScenes[0].start_seconds < fromScenes[0].end_seconds);
  const provisional = selectsFromSceneTimestamps([], 60);
  assert.ok(provisional.length >= 6);
  assert.equal(provisional[0].provisional, true);
});

test("Worker wires vibe-cut module and plan route", () => {
  const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /from "\.\/vibe-cut\.mjs"/);
  assert.match(worker, /planVibeCutRoute/);
  assert.match(worker, /\/api\/vibe-cut\/plan/);
  assert.match(worker, /isVibeCutNotes|studioIsVibeCut/);
});

test("Worker never treats Vibe Cut as finished-video passthrough", () => {
  const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /function studioFinishedOriginKind\(record\)/);
  assert.match(worker, /if \(studioIsVibeCut\(record\)\) return ""/);
  assert.match(worker, /vibeCutPassthrough/);
  assert.match(worker, /studioClearVibeCutPassthroughOutputs/);
  assert.match(worker, /vibeCutNeedsRemount/);
  assert.match(worker, /force_multiclip_remount/);
  assert.match(worker, /parsedClipCount/);
  assert.match(worker, /shortSingle/);
  assert.match(worker, /force_multiclip_remount: false/);
  assert.match(worker, /Rebuilding Vibe Cut multi-clip montage/);
  assert.match(worker, /Must go through enqueueStudioProductionJob so Vibe Cut/);
  assert.match(worker, /version: "0.10.521-footer-health-fast"/);
});

test("Studio web exposes Vibe Cut creation path", () => {
  const webRoot = path.join(here, "../studio-web");
  const app = fs.readFileSync(path.join(webRoot, "assets/app-item4-1008.js"), "utf8");
  const ez = fs.readFileSync(path.join(webRoot, "assets/ez-plan.js"), "utf8");
  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  assert.match(ez, /VIBE_CUT:\s*"vibe-cut"/);
  assert.match(app, /Vibe Cut/);
  assert.match(app, /startEzVibeCutWizard/);
  assert.match(app, /vibeTarget|vibeStyle|vibeEnergy/);
  assert.match(app, /ez-input=vibe-cut|inputKind:\s*"vibe-cut"/);
  assert.match(html, /vibe-cut\.js/);
  assert.match(html, /id="ezVibeCutLaunch"/);
});
