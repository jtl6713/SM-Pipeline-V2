import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");
const cssPath = path.join(here, "assets", "styles-phase7-0621.css");

test("Production clip frames preserve native video aspect ratio", async () => {
  const [app, css] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  assert.match(app, /function item4ClipPreviewRatio\(asset, status = item4Workspace\)/);
  assert.match(app, /const width = Number\(asset\?\.width/);
  assert.match(app, /nativeFrame\.style\.aspectRatio = `\$\{nativeWidth\} \/ \$\{nativeHeight\}`/);
  assert.match(app, /data-item4-native-clip-frame style="aspect-ratio:\$\{escapeHtml\(cssRatio\)\}"/);
  assert.doesNotMatch(app, /item4-variant-image-wrap" style="aspect-ratio:9 \/ 16">\$\{visual\}/);
  assert.match(css, /item4-variant-thumb\.item4-variant-clip[\s\S]*object-fit:contain/);
});
