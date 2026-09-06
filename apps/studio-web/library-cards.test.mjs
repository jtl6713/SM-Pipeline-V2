import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLibraryClipDuration,
  libraryAddedLine,
  libraryCardKindLabel,
  libraryCardMetaParts,
  libraryDurationLine,
  publishedLibraryConfirmCopy,
} from "./library-cards.mjs";

test("formatLibraryClipDuration uses m:ss and h:mm:ss", () => {
  assert.equal(formatLibraryClipDuration(42), "0:42");
  assert.equal(formatLibraryClipDuration(3723), "1:02:03");
  assert.equal(formatLibraryClipDuration(0), "");
  assert.equal(formatLibraryClipDuration(null), "");
  assert.equal(formatLibraryClipDuration(""), "");
});

test("duration line is video-only and hides blank Duration_Seconds", () => {
  assert.equal(libraryDurationLine({ media_kind: "video", duration_seconds: 42 }), "0:42");
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
  assert.equal(parts.duration, "0:42");
  assert.match(
    publishedLibraryConfirmCopy({ platform: "Instagram", outputType: "Reel" }),
    /Remove the Google Drive copy of this published Instagram Reel\?/,
  );
});
