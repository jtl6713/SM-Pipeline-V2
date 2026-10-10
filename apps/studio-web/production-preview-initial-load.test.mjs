import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");

test("Production photo previews load eagerly when a prepared item opens", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /function item4BindProductionPreviewImages\(/);
  assert.match(app, /data-item4-production-preview=/);
  assert.match(app, /item4BindProductionPreviewImages\(summary, assets\)/);
  assert.match(app, /item4BindProductionPreviewImages\(host, assets\)/);
  assert.match(app, /loading="eager" decoding="async" draggable="false" data-item4-preview-image/);
});

test("stalled preview requests retry without waiting for a scroll repaint", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /const armPreviewWatchdog = \(\) =>/);
  assert.match(app, /if \(!img\.isConnected \|\| generation !== sourceGeneration \|\| previewImageLooksReady\(img\)\) return;/);
  assert.match(app, /failPreview\(\);\s*\}, ITEM4_PREVIEW_RETRY_MS\);/);
  assert.match(app, /else armPreviewWatchdog\(\);\s*\} else \{\s*armPreviewWatchdog\(\);/);
});
