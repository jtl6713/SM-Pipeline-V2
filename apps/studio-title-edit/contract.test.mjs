import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDIO_TITLE_EDIT,
  buildTitleRenderInput,
  combinedTitleIdentity,
  nextTitleVersion,
  resolveTitleLock,
  titleEditIdentity,
} from "./contract.mjs";

test("same title, caption, placement, and timing keep one identity", () => {
  const first = titleEditIdentity({
    text: "Riverwalk at dusk",
    caption: "Chicago evening",
    position: "lower-third",
    size: 64,
    start_fraction: 0,
    end_fraction: 1,
  });
  const second = titleEditIdentity({
    text: "Riverwalk at dusk",
    subtitle: "Chicago evening",
    position: "lower-third",
    size: 64,
    startFraction: 0,
    endFraction: 1,
  });
  assert.equal(first, second);
  assert.match(first, new RegExp(`^${STUDIO_TITLE_EDIT.schema}\\|`));
});

test("caption or title edits mint a new identity and bump version", () => {
  const prior = { text: "Slide A", caption: "One", position: "lower-third", version: 2 };
  assert.equal(nextTitleVersion(prior, prior), 2);
  assert.equal(nextTitleVersion(prior, { ...prior, text: "Slide B" }), 3);
  assert.equal(nextTitleVersion(prior, { ...prior, caption: "Two" }), 3);
  assert.equal(nextTitleVersion({}, { text: "First title" }), 1);
});

test("approved preview locks title edits until unlock", () => {
  const locked = resolveTitleLock({
    reviewStatus: "Approved",
    overlayChanged: true,
  });
  assert.equal(locked.allow, false);
  assert.equal(locked.code, "title-lock-conflict");
  assert.equal(locked.locked, true);

  const unchanged = resolveTitleLock({
    reviewStatus: "Approved",
    overlayChanged: false,
  });
  assert.equal(unchanged.allow, true);
  assert.equal(unchanged.code, "locked-unchanged");

  const unlocked = resolveTitleLock({
    reviewStatus: "Approved",
    overlayChanged: true,
    unlockRequested: true,
  });
  assert.equal(unlocked.allow, true);
  assert.equal(unlocked.locked, false);
  assert.equal(unlocked.code, "unlocked");
});

test("explicit lock flag survives a non-approved review status", () => {
  const locked = resolveTitleLock({
    reviewStatus: "Changes Requested",
    lock: { locked: true },
    overlayChanged: true,
  });
  assert.equal(locked.allow, false);
  const released = resolveTitleLock({
    reviewStatus: "Approved",
    lock: { locked: false },
    overlayChanged: true,
  });
  assert.equal(released.allow, true);
  assert.equal(released.locked, false);
});

test("TikTok 9:16 render input is deterministic and keeps Item 15 identity", () => {
  const first = buildTitleRenderInput({
    platform: "TikTok",
    ratio: "9:16",
    slide_name: "Slide 1",
    overlay: {
      text: "Riverwalk at dusk",
      caption: "Evening light",
      position: "lower-third",
      size: 64,
      version: 3,
    },
    duration_seconds: 4,
  });
  const second = buildTitleRenderInput({
    platform: "TikTok",
    ratio: "9:16",
    slide_name: "Slide 1",
    overlay: {
      text: "Riverwalk at dusk",
      subtitle: "Evening light",
      position: "lower-third",
      size: 64,
      version: 3,
    },
    duration_seconds: 4,
  });
  assert.equal(first.schema, "studio-title-edit-v1");
  assert.equal(first.recipe, "tiktok-title-overlay-v1");
  assert.equal(first.position, "lower-third");
  assert.equal(first.version, 3);
  assert.equal(first.caption, "Evening light");
  assert.equal(first.title_edit_key, second.title_edit_key);
  assert.equal(first.idempotency_key, second.idempotency_key);
  assert.equal(first.safe_area.top, 285);
  assert.notEqual(first.title_edit_key, first.idempotency_key);
});

test("combined slide identity is order-stable for approval snapshots", () => {
  const slides = [
    { id: "recA", overlay: { text: "A", caption: "one" } },
    { id: "recB", overlay: { text: "B", caption: "two", position: "lower-third" } },
  ];
  assert.equal(combinedTitleIdentity(slides), combinedTitleIdentity(slides));
  assert.notEqual(
    combinedTitleIdentity(slides),
    combinedTitleIdentity([{ ...slides[0], overlay: { text: "A2", caption: "one" } }, slides[1]]),
  );
});
