import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { item4UrlIsRenderServerVideo } from "./output-preview-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

const RENDER_MP4 = "https://render.chicagoshining.com/out/platform-output-2487.mp4";

test("render-server /out MP4s are accepted for Studio preview streaming", () => {
  assert.equal(item4UrlIsRenderServerVideo(RENDER_MP4), true);
  assert.equal(item4UrlIsRenderServerVideo(`${RENDER_MP4}?t=1`), true);
  assert.equal(item4UrlIsRenderServerVideo("https://render.chicagoshining.com/out/job.mov"), true);
});

test("render-server accept path rejects non-video and off-host URLs", () => {
  assert.equal(item4UrlIsRenderServerVideo("https://render.chicagoshining.com/"), false);
  assert.equal(item4UrlIsRenderServerVideo("https://render.chicagoshining.com/out/"), false);
  assert.equal(item4UrlIsRenderServerVideo("https://render.chicagoshining.com/health"), false);
  assert.equal(item4UrlIsRenderServerVideo("https://render.chicagoshining.com/out/job.json"), false);
  assert.equal(item4UrlIsRenderServerVideo("http://render.chicagoshining.com/out/job.mp4"), false);
  assert.equal(item4UrlIsRenderServerVideo("https://evil.example/out/job.mp4"), false);
  assert.equal(item4UrlIsRenderServerVideo("https://media.chicagoshining.com/studio/previews/x/current.mp4"), false);
  assert.equal(item4UrlIsRenderServerVideo(""), false);
});

test("outputPreview wires Render_Server_URL through the render-server accept helper", () => {
  assert.match(worker, /from "\.\/output-preview-source\.mjs"/);
  assert.match(worker, /item4UrlIsRenderServerVideo\(href\)/);
  assert.match(worker, /f\(record, "Render_Server_URL"\)/);
  assert.match(worker, /studio_render_server_preview_v1: true/);
  assert.match(worker, /version: "0\.10\.555-ops-queue-fields"/);
  assert.match(worker, /previewSource = item4UrlIsRenderServerVideo\(studioPreviewUrl\)/);
  assert.match(worker, /"render-server-out"/);
});

test("Review Open rendered file prefers /api/outputs/:id/preview for finished video", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.638-ops-queue-fields"/);
  const fn = app.match(/function phase6ReviewWatchUrl\(output = \{\}\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /phase6OutputHasVideoFinal\(output\)/);
  assert.match(fn, /\/api\/outputs\/\$\{encodeURIComponent\(output\.id\)\}\/preview/);
  assert.doesNotMatch(fn, /phase6PreviewLooksLikeImage\(stored\)/);
});
