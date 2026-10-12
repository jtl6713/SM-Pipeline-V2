import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const quality = fs.readFileSync(path.join(here, "quality-checks.mjs"), "utf8");
const desk = fs.readFileSync(path.join(here, "desk-inventory.mjs"), "utf8");

test("Worker 0.10.479 heals Blocked spoken-past-end by extending last clip (Output 2156)", () => {
  assert.match(worker, /version: "0.10.549-ideas-generate-async"/);
  assert.match(worker, /function studioExtendClipsToCoverVoiceover/);
  assert.match(worker, /async function studioHealVoiceoverExceedsRender/);
  assert.match(worker, /R4_VO_EXCEEDS_RENDER/);
  assert.match(worker, /Spoken audio must never run past the video end/);
  assert.match(worker, /Math\.ceil\(voiceSeconds \* 30\)/);
  assert.match(desk, /kind: "voiceover_exceeds_render"/);
  assert.match(desk, /fingerprint\("voiceover_exceeds_render", recordId, "spoken_past_end"\)/);
  assert.match(quality, /id: "voiceover_exceeds_render"/);
  assert.match(quality, /extend_last_clip_requeue_r4/);
});
