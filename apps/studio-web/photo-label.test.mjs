import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const labels = fs.readFileSync(new URL("./assets/production-asset-labels.js", import.meta.url), "utf8");

test("Production cards hide opaque asset ids behind a photo label", () => {
  assert.match(app, /function studioAssetLabelIsOpaque/);
  assert.match(app, /function studioPhotoLabel/);
  assert.match(app, /studioPhotoLabel\(asset, index, "Photo"\)/);
  assert.match(app, /studioPhotoLabel\(asset, Math\.max\(0, Number\(asset\.order \|\| index \+ 1\) - 1\)/);
  assert.match(app, /studioPhotoLabel\(r, null, video \? "Clip" : "Photo"\)/);
  assert.match(labels, /production-render-frame-meta strong/);
  assert.match(labels, /library-card\[data-library-record-type='media_asset'\] h3/);
  assert.match(html, /production-asset-labels\.js\?v=0\.6\.669-idea-find-images-local/);
  assert.match(html, /app-item4-1008\.js\?v=0\.6\.669-idea-find-images-local/);
  assert.match(app, /BUILD_ID = "item4-0.6.670-schedule-4wk"/);
});
