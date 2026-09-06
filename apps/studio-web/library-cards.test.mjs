import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLibraryClipDuration,
  isBrowserSafeLibraryImageUrl,
  libraryAddedLine,
  libraryCardKindLabel,
  libraryCardMetaParts,
  libraryDurationLine,
  libraryListClassName,
  publishedLibraryConfirmCopy,
  publishedLibraryPosterUrl,
  publishedLibraryStreamPath,
} from "./library-cards.mjs";

test("formatLibraryClipDuration uses m:ss and h:mm:ss", () => {
  assert.equal(formatLibraryClipDuration(42), "0:42");
  assert.equal(formatLibraryClipDuration(3723), "1:02:03");
  assert.equal(formatLibraryClipDuration(0), "");
  assert.equal(formatLibraryClipDuration(null), "");
  assert.equal(formatLibraryClipDuration(""), "");
});

test("duration line is video-only and hides blank Duration_Seconds", () => {
  assert.equal(libraryDurationLine({ media_kind: "video", duration_seconds: 42 }), "Length 0:42");
  assert.equal(libraryDurationLine({ media_kind: "photo", duration_seconds: 42 }), "");
  assert.equal(libraryDurationLine({ media_kind: "video", duration_seconds: null }), "");
  assert.equal(libraryDurationLine({ media_kind: "video", duration_seconds: 0 }), "");
  const parts = libraryCardMetaParts({ media_kind: "video" });
  assert.equal(parts.duration, "");
  assert.doesNotMatch(parts.duration, /0:00/);
});

test("source cards show Added from intake_date", () => {
  const formatDate = () => "Sep 1, 2026";
  assert.equal(libraryAddedLine("2026-09-01", formatDate), "Added Sep 1, 2026");
  assert.equal(libraryAddedLine("", formatDate), "");
  const parts = libraryCardMetaParts({ media_kind: "photo", intake_date: "2026-09-01" }, { formatDate });
  assert.equal(parts.added, "Added Sep 1, 2026");
  assert.equal(parts.duration, "");
});

test("published cards use Published badge and confirm copy", () => {
  assert.equal(libraryCardKindLabel({ record_type: "platform_output" }), "Published");
  assert.equal(libraryCardKindLabel({ record_type: "platform_output", file_released: true }), "File removed");
  const parts = libraryCardMetaParts({
    record_type: "platform_output",
    media_kind: "video",
    published_at: "2026-09-01T12:00:00.000Z",
    duration_seconds: 42,
  }, { formatDate: () => "Sep 1, 2026" });
  assert.equal(parts.published, "Published Sep 1, 2026");
  assert.equal(parts.added, "");
  assert.equal(parts.duration, "Length 0:42");
  assert.match(
    publishedLibraryConfirmCopy({ platform: "Instagram", outputType: "Reel" }),
    /Remove the Google Drive copy of this published Instagram Reel\?/,
  );
});

test("layout class names cover text, thumbnail list, and grid", () => {
  assert.equal(libraryListClassName("list"), "library-list library-list--text");
  assert.equal(libraryListClassName("thumbs"), "library-list library-list--thumbs");
  assert.equal(libraryListClassName("grid"), "library-grid");
  assert.equal(libraryListClassName(""), "library-grid");
});

test("published posters reject Drive URLs and videos use the output preview route", () => {
  assert.equal(isBrowserSafeLibraryImageUrl("https://drive.google.com/uc?id=abc"), false);
  assert.equal(isBrowserSafeLibraryImageUrl("https://media.chicagoshining.com/studio/previews/out.mp4"), false);
  assert.equal(
    isBrowserSafeLibraryImageUrl("https://media.chicagoshining.com/publish/cover.jpg"),
    true,
  );
  assert.equal(publishedLibraryPosterUrl({
    thumbnail_url: "https://drive.google.com/uc?id=abc",
    studio_preview_url: "https://media.chicagoshining.com/publish/cover.jpg",
  }), "https://media.chicagoshining.com/publish/cover.jpg");
  assert.equal(publishedLibraryStreamPath({
    id: "recOUT1",
    media_kind: "video",
  }), "/api/outputs/recOUT1/preview");
  assert.equal(publishedLibraryStreamPath({
    id: "recOUT1",
    media_kind: "photo",
  }), "");
});
