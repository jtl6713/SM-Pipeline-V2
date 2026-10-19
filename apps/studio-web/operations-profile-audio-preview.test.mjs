import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../studio-api/worker.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/profile-admin-creative.css", import.meta.url), "utf8");
const start = app.indexOf("  function renderOperationsProfiles(profiles, canEdit) {");
const end = app.indexOf("  function stopOperationsQueuePoll()", start);
const render = app.slice(start, end);

test("Profile Admin voice dropdown shows accessible non-saving preview button", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(render, /data-ops-voice-preview/);
  assert.match(render, /aria-label="Preview selected narration voice"/);
  assert.match(render, /data-preview="\$\{escapeHtml\(voice\.preview_url/);
  assert.match(render, /DEFAULT_VOICE_ID/);
  assert.match(render, /playStudioAudioPreview\(preview, event\.currentTarget, setOperationsMessage, voiceName\)/);
  assert.match(render, /\/api\/voices\//);
});
test("Autonomous music pool has an independent preview for each track", () => {
  assert.match(render, /ops-music-preview-row/);
  assert.match(render, /data-ops-music-preview/);
  assert.match(render, /musicPreviewUrl\(track\)/);
  assert.match(render, /playStudioAudioPreview\(preview, button, setOperationsMessage, label\)/);
  assert.match(render, /\/api\/music\//);
  assert.match(render, /data-ops-music-option/);
  assert.ok(render.indexOf('button.addEventListener("click"') !== -1);
});
test("Audio preview uses existing shared play-stop behavior and avoids PATCH", () => {
  assert.match(app, /function stopStudioAudioPreview\(\)/);
  assert.match(app, /function playStudioAudioPreview\(url/);
  assert.match(render, /Preview is read-only: it never calls saveVoice\/saveMusicPool or PATCH/);
  const previewStart = render.indexOf('card.querySelector("[data-ops-voice-preview]")');
  const previewEnd = render.indexOf("    syncOperationsProfileContext();", previewStart);
  const previewListeners = render.slice(previewStart, previewEnd);
  assert.doesNotMatch(previewListeners, /method:\s*["']PATCH/);
  assert.match(render, /if \(studioPreviewButton && target\.contains\(studioPreviewButton\)\) stopStudioAudioPreview\(\)/);
});
test("Worker supports the existing safe voice and music preview endpoints", () => {
  assert.match(worker, /const isMusicPreviewRoute/);
  assert.match(worker, /const isVoicePreviewRoute/);
  assert.match(worker, /return musicPreview\(request, env, url\)/);
  assert.match(worker, /return phase6VoicePreview\(request, env, url\)/);
  assert.match(css, /ops-music-preview-row/);
  assert.match(css, /ops-voice-preview-row/);
});
