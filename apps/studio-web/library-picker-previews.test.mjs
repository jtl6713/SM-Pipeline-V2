import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  driveThumbnailPreviewUrl,
  libraryPickerApiPreviewUrl,
  libraryPickerPreviewCandidates,
  previewImageLooksReady,
} from "./library-picker-previews.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");

test("library picker prefers the authenticated preview then a Drive JPEG thumb", () => {
  const item = {
    id: "recPhoto1",
    preview_path: "/api/media-assets/recPhoto1/preview",
    google_drive_file_id: "abc123",
  };
  assert.deepEqual(libraryPickerPreviewCandidates(item, ""), [
    "/api/media-assets/recPhoto1/preview",
    "https://drive.google.com/thumbnail?id=abc123&sz=w640",
  ]);
  assert.equal(libraryPickerApiPreviewUrl({ id: "recPhoto2" }, "https://studio.example"), "https://studio.example/api/media-assets/recPhoto2/preview");
  assert.equal(driveThumbnailPreviewUrl(""), "");
});

test("an image that loaded without pixels is treated as not ready", () => {
  assert.equal(previewImageLooksReady({ naturalWidth: 0 }), false);
  assert.equal(previewImageLooksReady({ naturalWidth: 640 }), true);
});

test("Idea and Production pickers bind preview fallbacks", () => {
  assert.match(app, /bindLibraryPickerPreviews/);
  assert.match(app, /previewImageLooksReady/);
  assert.match(app, /libraryPickerPreviewCandidates/);
});
