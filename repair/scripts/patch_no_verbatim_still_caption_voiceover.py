from pathlib import Path

worker_path = Path("apps/studio-api/worker.js")
worker = worker_path.read_text()

needle = 'covered_text: covered.map((text, index) => `${index + 1}. ${text}`).join("\\n") || "(none)",'
replacement = '''covered_text: covered.map((text, index) => `${index + 1}. ${text}`).join("\\n") || "(none)",
      narration_caption_policy: "Still captions are visual/topic context only. Never use a still caption as a narration sentence or script line; never concatenate or repeat captions to form narration. Write original prose that explains/connects the scenes. Proper names may be mentioned naturally when needed, but caption wording is not voiceover copy.",'''
if needle not in worker:
    raise SystemExit("SAI1 covered_text payload anchor not found")
worker = worker.replace(needle, replacement, 1)

anchor = 'return { slides, voiceoverScript: String(parsed?.voiceover_script || "").trim() };'
guard = '''const rawVoiceoverScript = String(parsed?.voiceover_script || "").trim();
  const normalizeNarrationText = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\\s+/g, " ");
  const normalizedScript = normalizeNarrationText(rawVoiceoverScript);
  const captionNorms = covered.map(normalizeNarrationText).filter((x) => x.length >= 4);
  const captionOnlyTokens = captionNorms.join(" ").split(/\\s+/).filter(Boolean);
  const scriptTokens = normalizedScript.split(/\\s+/).filter(Boolean);
  const captionTokenSet = new Set(captionOnlyTokens);
  const captionTokenShare = scriptTokens.length
    ? scriptTokens.filter((token) => captionTokenSet.has(token)).length / scriptTokens.length
    : 0;
  const repeatedCaption = captionNorms.some((caption) => caption && normalizedScript.split(caption).length - 1 > 1);
  const captionDrivenNarration = Boolean(rawVoiceoverScript)
    && (repeatedCaption || (captionNorms.length > 1 && captionTokenShare >= 0.72));
  if (captionDrivenNarration) {
    console.warn("Rejected caption-driven Studio AI narration", parent?.id || null, {
      captionTokenShare,
      captionCount: captionNorms.length,
    });
  }
  return { slides, voiceoverScript: captionDrivenNarration ? "" : rawVoiceoverScript };'''
if anchor not in worker:
    raise SystemExit("SAI1 voiceover return anchor not found")
worker = worker.replace(anchor, guard, 1)
worker_path.write_text(worker)

test_path = Path("apps/studio-api/no-verbatim-still-caption-voiceover.test.mjs")
test_path.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("still captions are context, never narration copy", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("async function item4RequestAiSlideThemes");
  assert.ok(start >= 0, "AI slide narration helper is present");
  const end = worker.indexOf("async function item4SeedAiCarouselSlides", start);
  const handler = worker.slice(start, end);
  assert.match(handler, /visual\\/topic context only/);
  assert.match(handler, /Never use a still caption as a narration sentence or script line/);
  assert.match(handler, /captionDrivenNarration/);
  assert.match(handler, /repeatedCaption/);
  assert.match(handler, /captionTokenShare/);
  assert.match(handler, /voiceoverScript: captionDrivenNarration \\? "" : rawVoiceoverScript/);
});
''')