import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_PUT_DIRECT_MAX_BYTES,
  YOUTUBE_PRIVATE_SOURCE_HEAL_INNER,
  mpuPartRanges,
  shouldUseMultipart,
  youtubePublishAssetKey,
} from "./youtube-public-mp4.mjs";

test("YouTube 375 public key and 121MB file use 16MB multipart parts", () => {
  assert.equal(
    youtubePublishAssetKey("375", "1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI"),
    "publish/platform-output-375/1aM4EYlL0OXEGdP6O8lUzmmFEdCqs8UMI.mp4"
  );
  const size = 121522084;
  assert.equal(shouldUseMultipart(size), true);
  assert.equal(shouldUseMultipart(PUBLIC_PUT_DIRECT_MAX_BYTES), false);
  const ranges = mpuPartRanges(size);
  assert.equal(ranges.length, 8);
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges[0].length, 16 * 1024 * 1024);
  assert.equal(ranges.at(-1).end, size - 1);
  assert.equal(ranges.reduce((sum, part) => sum + part.length, 0), size);
  assert.match(YOUTUBE_PRIVATE_SOURCE_HEAL_INNER, /Ready to Publish/);
  assert.match(YOUTUBE_PRIVATE_SOURCE_HEAL_INNER, /Manual Publish Required/);
  assert.match(YOUTUBE_PRIVATE_SOURCE_HEAL_INNER, /YT1/);
});
