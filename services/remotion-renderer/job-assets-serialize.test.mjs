import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverSrc = fs.readFileSync(path.join(here, "render-server.js"), "utf8");

test("job assets live outside public/ so Remotion does not copy multi-GB dirs", () => {
  assert.match(serverSrc, /RENDER_ASSETS_DIR = path\.join\(PROJECT_DIR, 'job-assets'\)/);
  assert.doesNotMatch(
    serverSrc,
    /RENDER_ASSETS_DIR = path\.join\(PUBLIC_DIR, 'render-assets'\)/,
  );
  assert.match(serverSrc, /app\.use\(RENDER_ASSETS_URL_PREFIX, express\.static\(RENDER_ASSETS_DIR\)\)/);
  assert.match(serverSrc, /--public-dir=/);
  assert.match(serverSrc, /public-empty/);
});

test("Remotion renders are serialized to one concurrent child", () => {
  assert.match(serverSrc, /MAX_CONCURRENT_REMOTION_RENDERS/);
  assert.match(serverSrc, /acquireRemotionSlot/);
  assert.match(serverSrc, /releaseRemotionSlot/);
  assert.match(serverSrc, /jobAssetsOutsidePublic: true/);
  assert.match(serverSrc, /2026-10-11-force-release-slots/);
  assert.match(serverSrc, /remotionJobs/);
  assert.match(serverSrc, /\/admin\/force-release-slots/);
});

test("rewriteClipAssets reuses one Drive download across vibe-cut clip stamps", () => {
  const start = serverSrc.indexOf("async function rewriteClipAssets");
  const end = serverSrc.indexOf("async function rewriteMusicAsset", start);
  assert.ok(start >= 0 && end > start);
  const fn = serverSrc.slice(start, end);
  assert.match(fn, /driveLocalCache/);
  assert.match(fn, /Reusing downloaded Drive file/);
  assert.match(fn, /driveLocalCache\.set\(driveFileId/);
  assert.match(fn, /driveLocalCache\.has\(driveFileId\)/);
});

test("resolvePublicAssetPath maps http job-assets URLs to the filesystem for ffprobe", () => {
  const start = serverSrc.indexOf("function resolvePublicAssetPath");
  const end = serverSrc.indexOf("function probeMediaDurationSeconds", start);
  assert.ok(start >= 0 && end > start);
  const fn = serverSrc.slice(start, end);
  assert.ok(fn.includes("new URL(trimmed)"));
  assert.ok(fn.includes("RENDER_ASSETS_URL_PREFIX"));
  assert.ok(fn.includes("path.join(RENDER_ASSETS_DIR, under)"));
  assert.ok(fn.includes("public\\http:"));
});

test("watermark localization prefers Drive File ID over Access-gated Studio branding URL", () => {
  assert.match(serverSrc, /CHICAGO_WATERMARK_DRIVE_FILE_ID/);
  assert.match(serverSrc, /1WQyd5W1__HkaEkWyC38IMErW8702Rd4u/);
  assert.match(serverSrc, /isStudioBrandWatermarkUrl/);
  assert.match(serverSrc, /assertDownloadedImageFile/);
  assert.match(serverSrc, /expectImage:\s*true/);
  assert.match(serverSrc, /contentType\.includes\('text\/html'\)/);
  const start = serverSrc.indexOf("async function rewriteWatermarkAsset");
  const end = serverSrc.indexOf("function compactRemotionFailure", start);
  assert.ok(start >= 0 && end > start);
  const fn = serverSrc.slice(start, end);
  assert.match(fn, /CHICAGO_WATERMARK_DRIVE_FILE_ID/);
  assert.match(fn, /\/internal\/drive-media\//);
  assert.match(fn, /Ignoring non-brand watermark Drive id/);
  assert.match(fn, /expectImage:\s*true/);
});

test("image assert is watermark-only so music/VO MP3 downloads are allowed", () => {
  const start = serverSrc.indexOf("function downloadUrlToFile");
  const end = serverSrc.indexOf("async function rewriteClipAssets", start);
  assert.ok(start >= 0 && end > start);
  const fn = serverSrc.slice(start, end);
  assert.match(fn, /expectImage/);
  assert.match(fn, /if \(expectImage\)/);
  assert.match(fn, /Accept: expectImage/);
});
