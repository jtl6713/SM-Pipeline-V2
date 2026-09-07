import assert from "node:assert/strict";
import test from "node:test";

import {
  item4MappedStudioPreviewUrl,
  item4MixInProgress,
  item4OutputHasVideoFinal,
  item4PreviewKind,
  item4PreviewPlayerFallback,
  item4ReviewWatchUrl,
} from "./item4-review-preview.mjs";

const COVER = "https://media.chicagoshining.com/studio/previews/thumbnails/recN5gK7L7ToiF7Uw/cover-9x16.png";
const DRIVE_MP4 = {
  id: "recHuGcxALtuIOS9Y",
  final_file_id: "1yiuoUz5BcAMKslb1yKkqWMlrbBgxGQV5",
  final_file_url: "https://drive.google.com/file/d/1yiuoUz5BcAMKslb1yKkqWMlrbBgxGQV5/view",
  studio_preview_url: "",
  thumbnail_url: COVER,
  render_status: "Rendering",
  output_status: "In Production",
};

test("a Drive final is a video even when Studio_Preview_URL is blank", () => {
  assert.equal(item4OutputHasVideoFinal(DRIVE_MP4), true);
  assert.equal(item4PreviewKind(DRIVE_MP4, { stillUrl: COVER }), "video");
  assert.equal(item4MappedStudioPreviewUrl(DRIVE_MP4, COVER), null);
});

test("Open rendered file uses the Drive MP4, not the cover PNG", () => {
  assert.equal(item4ReviewWatchUrl({ ...DRIVE_MP4, studio_preview_url: COVER }), DRIVE_MP4.final_file_url);
  assert.equal(item4ReviewWatchUrl(DRIVE_MP4), DRIVE_MP4.final_file_url);
});

test("preview player falls back to Drive embed, not the cover still", () => {
  assert.equal(item4PreviewPlayerFallback(DRIVE_MP4), "drive");
  assert.equal(item4PreviewPlayerFallback({ thumbnail_url: COVER }), "cover");
});

test("R2 story MP4 stays the preview and watch URL", () => {
  const story = {
    id: "recLwLnWlkL3SNoP9",
    studio_preview_url: "https://media.chicagoshining.com/studio/previews/recLwLnWlkL3SNoP9/current.mp4",
    final_file_id: "1wgJUK15WQrhlm6vX06fQS2n9WJNyZtaP",
  };
  assert.equal(item4MappedStudioPreviewUrl(story, COVER), story.studio_preview_url);
  assert.equal(item4ReviewWatchUrl(story), story.studio_preview_url);
  assert.equal(item4PreviewKind(story, { stillUrl: COVER }), "video");
});

test("native photo posts still use the cover still", () => {
  const photo = { studio_preview_url: "", final_file_id: "" };
  assert.equal(item4PreviewKind(photo, { nativePhoto: true, stillUrl: COVER }), "still");
  assert.equal(item4MappedStudioPreviewUrl(photo, COVER), COVER);
  assert.equal(item4ReviewWatchUrl({ ...photo, studio_preview_url: COVER }), COVER);
});

test("stale Rendering does not cover a finished Drive MP4", () => {
  assert.equal(item4MixInProgress(DRIVE_MP4), false);
  assert.equal(item4MixInProgress({ render_status: "Rendering" }), true);
  assert.equal(item4MixInProgress(DRIVE_MP4, { active: true, overall_status: "active" }), true);
});
