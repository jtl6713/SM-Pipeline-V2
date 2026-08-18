import assert from "node:assert/strict";
import test from "node:test";

import {
  TIKTOK_TITLE_OVERLAY,
  criticalContentInsideCentered4x5,
  overlayIdentityKey,
  resolveTikTokTitleOverlay,
} from "./contract.mjs";

test("TikTok overlay recipe keeps titles inside the centered 4:5 band", () => {
  assert.equal(TIKTOK_TITLE_OVERLAY.recipe, "tiktok-title-overlay-v1");
  assert.equal(TIKTOK_TITLE_OVERLAY.canvas.width, 1080);
  assert.equal(TIKTOK_TITLE_OVERLAY.canvas.height, 1920);
  assert.equal(TIKTOK_TITLE_OVERLAY.critical_4x5.height, 1350);
  assert.equal(TIKTOK_TITLE_OVERLAY.safe_area.top, 285);
  assert.equal(TIKTOK_TITLE_OVERLAY.safe_area.bottom, 285);
  assert.equal((1920 - 1350) / 2, 285);
  assert.equal(criticalContentInsideCentered4x5(), true);
});

test("same per-photo inputs produce the same idempotency key", () => {
  const first = resolveTikTokTitleOverlay({
    overlay: { text: "Riverwalk at dusk", position: "lower-third", size: 64 },
    duration_seconds: 4,
  });
  const second = resolveTikTokTitleOverlay({
    overlay: { text: "Riverwalk at dusk", position: "lower-third", size: 64 },
    duration_seconds: 4,
  });
  assert.equal(first.idempotency_key, second.idempotency_key);
  assert.equal(first.idempotency_key, overlayIdentityKey(first));
  assert.equal(first.enabled, true);
  assert.equal(first.start_fraction, 0);
  assert.equal(first.end_fraction, 1);
});

test("title, timing, or duration changes mint a new identity", () => {
  const base = resolveTikTokTitleOverlay({ overlay: { text: "Slide A" }, duration_seconds: 4 });
  const title = resolveTikTokTitleOverlay({ overlay: { text: "Slide B" }, duration_seconds: 4 });
  const timing = resolveTikTokTitleOverlay({
    overlay: { text: "Slide A", start_fraction: 0.1, end_fraction: 0.9 },
    duration_seconds: 4,
  });
  const duration = resolveTikTokTitleOverlay({ overlay: { text: "Slide A" }, duration_seconds: 5 });
  assert.notEqual(base.idempotency_key, title.idempotency_key);
  assert.notEqual(base.idempotency_key, timing.idempotency_key);
  assert.notEqual(base.idempotency_key, duration.idempotency_key);
});

test("blank title is a no-text overlay with a stable disabled identity", () => {
  const blank = resolveTikTokTitleOverlay({ overlay: { enabled: true, text: "" }, slide_name: "" });
  const again = resolveTikTokTitleOverlay({ overlay: { text: "   " } });
  assert.equal(blank.enabled, false);
  assert.equal(blank.text, "");
  assert.equal(blank.idempotency_key, again.idempotency_key);
});

test("slide name is the per-photo title fallback", () => {
  const resolved = resolveTikTokTitleOverlay({ overlay: {}, slide_name: "Navy Pier lights" });
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.text, "Navy Pier lights");
  assert.equal(resolved.position, "lower-third");
  assert.equal(resolved.safe_area_mode, "tiktok-9x16");
});
