import assert from "node:assert/strict";
import test from "node:test";

import {
  item4MappedStudioPreviewUrl,
  item4MixInProgress,
  item4OutputHasVideoFinal,
  item4PreviewKind,
  item4PreviewPlayerFallback,
  item4ReviewWatchUrl,
  item4ShowTiktokCompleteCard,
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
  assert.equal(item4MappedStudioPreviewUrl(DRIVE_MP4, COVER), `/api/outputs/${DRIVE_MP4.id}/preview`);
});

test("Open rendered file uses the Studio preview endpoint, not Drive", () => {
  assert.equal(item4ReviewWatchUrl({ ...DRIVE_MP4, studio_preview_url: COVER }), `/api/outputs/${DRIVE_MP4.id}/preview`);
  assert.equal(item4ReviewWatchUrl(DRIVE_MP4), `/api/outputs/${DRIVE_MP4.id}/preview`);
});

test("preview player uses native video, not a Drive embed", () => {
  assert.equal(item4PreviewPlayerFallback(DRIVE_MP4), "native");
  assert.equal(item4PreviewPlayerFallback({ thumbnail_url: COVER }), "cover");
});

test("R2 story MP4 stays the preview and watch URL", () => {
  const story = {
    id: "recLwLnWlkL3SNoP9",
    studio_preview_url: "https://media.chicagoshining.com/studio/previews/recLwLnWlkL3SNoP9/current.mp4",
    final_file_id: "1wgJUK15WQrhlm6vX06fQS2n9WJNyZtaP",
  };
  assert.equal(item4MappedStudioPreviewUrl(story, COVER), `/api/outputs/${story.id}/preview`);
  assert.equal(item4ReviewWatchUrl(story), `/api/outputs/${story.id}/preview`);
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

test("TikTok live URL card stays off Instagram, Facebook, and YouTube Review", () => {
  const leftoverTiktokUrl = "https://www.tiktok.com/@chicago.shining/video/123";
  for (const platform of ["Instagram", "Facebook", "YouTube"]) {
    assert.equal(item4ShowTiktokCompleteCard({
      platform,
      platform_post_url: leftoverTiktokUrl,
      manual_completion_status: "Required",
      studio_state: "Draft Delivered",
    }), false);
  }
});

test("TikTok Review shows the live URL card when a URL is needed or already pasted", () => {
  assert.equal(item4ShowTiktokCompleteCard({
    platform: "TikTok",
    manual_completion_status: "Required",
  }), true);
  assert.equal(item4ShowTiktokCompleteCard({
    platform: "tiktok",
    platform_post_url: "https://www.tiktok.com/@chicago.shining/video/123",
    publish_status: "Published",
  }), true);
  assert.equal(item4ShowTiktokCompleteCard({
    platform: "TikTok",
    output_status: "Ready for Review",
  }), false);
});
