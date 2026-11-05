import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");

test("Manage Idea immediately presents assigned assets before edit fields", () => {
  const gallery = html.indexOf('id="ideaMatchedPhotos"');
  const form = html.indexOf('id="ideaEditForm"');
  assert.ok(gallery > 0 && gallery < form, "assigned assets must appear high in the drawer");
  assert.match(html, /id="ideaMatchedPhotosHeading">Assigned assets \(0\)/);
  assert.doesNotMatch(html.slice(gallery - 95, gallery + 80), /id="ideaMatchedPhotos" hidden/);
  assert.match(app, /function renderIdeaMatchedPhotos/);
  assert.match(app, /wrap\.hidden = false/);
  assert.match(app, /Assigned assets \(\$\{items\.length\}\)/);
  assert.match(app, /renderIdeaMatchedPhotos\(idea\)/);
});

test("gallery includes all persisted idea links independent of Ready photo wait status", () => {
  const ids = app.slice(app.indexOf("function ideaLibraryIdsFromIdea"), app.indexOf("function ideaAssignedAssetRows"));
  assert.match(ids, /library_asset_ids/);
  assert.match(ids, /matched_media_asset_links/);
  assert.match(ids, /photo_match\?\.selected/);
  assert.match(ids, /media_asset_ids=/);
  const gallery = app.slice(app.indexOf("function renderIdeaMatchedPhotos"), app.indexOf("async function hydrateIdeaAssignedAssets"));
  assert.doesNotMatch(gallery, /photo_wait_status|=== "Ready"/);
  assert.match(gallery, /item4ClipPlayerHtml/);
  assert.match(gallery, /Clip/);
  assert.match(gallery, /loading="eager"/);
});

test("drawer enriches true links and linked Production draft without auto-assigning suggestions", () => {
  const hydration = app.slice(app.indexOf("async function hydrateIdeaAssignedAssets"), app.indexOf("function updateIdeaDrawer"));
  assert.match(hydration, /new Set\(ideaLibraryIdsFromIdea\(activeIdea\)\)/);
  assert.match(hydration, /linked\.has\(String\(item\?\.id/);
  assert.match(hydration, /\/item4\?snapshot=1/);
  assert.match(hydration, /Promise\.allSettled/);
  assert.match(hydration, /ideaAssignedAssetLoadSequence/);
  assert.match(app, /hydrateIdeaAssignedAssets\(idea\)\.catch/);
  assert.match(app, /\/api\/media-assets\/\$\{encodeURIComponent\(id\)\}\/preview/);
  assert.match(app, /bindLibraryPickerPreviews\(grid, items\)/);
  assert.match(app, /item4BindClipPlayers\(grid\)/);
});
