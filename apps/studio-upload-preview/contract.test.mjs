import assert from "node:assert/strict";
import test from "node:test";

import {
  OBSERVABLE_UPLOAD_PREVIEW_STATES,
  UPLOAD_PREVIEW_SELF_HEAL,
  cacheBustedPreviewUrl,
  nextPreviewRetry,
  nextStatusPoll,
  observableUploadPreviewState,
} from "./contract.mjs";

test("self-heal never requires a hard refresh", () => {
  assert.equal(UPLOAD_PREVIEW_SELF_HEAL.schema, "upload-preview-self-heal-v1");
  assert.equal(UPLOAD_PREVIEW_SELF_HEAL.hard_refresh_required, false);
  assert.equal(UPLOAD_PREVIEW_SELF_HEAL.image_retry_max, 3);
  assert.ok(OBSERVABLE_UPLOAD_PREVIEW_STATES.includes("retrying"));
});

test("broken preview images retry a bounded number of times with cache busting", () => {
  const first = nextPreviewRetry({ attempt: 0 });
  assert.equal(first.retry, true);
  assert.equal(first.attempt, 1);
  assert.equal(first.hard_refresh_required, false);
  const last = nextPreviewRetry({ attempt: 3 });
  assert.equal(last.retry, false);
  assert.equal(last.hard_refresh_required, false);
  assert.equal(
    cacheBustedPreviewUrl("/api/media-assets/recABC/preview", 2),
    "/api/media-assets/recABC/preview?heal=2",
  );
});

test("status polling stays automatic and bounded without asking for refresh", () => {
  const observing = nextStatusPoll({ elapsed_ms: 1000, window_ms: 180000 });
  assert.equal(observing.continue, true);
  assert.equal(observing.mode, "observe");
  assert.equal(observing.hard_refresh_required, false);

  const firstExtra = nextStatusPoll({ elapsed_ms: 180000, extra_windows_used: 0 });
  assert.equal(firstExtra.mode, "revalidate");
  assert.equal(firstExtra.continue, true);
  assert.equal(firstExtra.hard_refresh_required, false);

  const done = nextStatusPoll({ elapsed_ms: 180000, extra_windows_used: 2 });
  assert.equal(done.continue, false);
  assert.equal(done.mode, "await-visibility");
  assert.equal(done.hard_refresh_required, false);
});

test("workspace state is observable from upload, preview, retry, and error", () => {
  assert.equal(observableUploadPreviewState({ assets_status: "Uploading" }), "uploading");
  assert.equal(observableUploadPreviewState({ assets_status: "Ready", preview_pending_count: 2 }), "preview_pending");
  assert.equal(observableUploadPreviewState({ assets_status: "Ready", variant_status: "Ready" }), "ready");
  assert.equal(observableUploadPreviewState({ assets_status: "Error" }), "error");
  assert.equal(observableUploadPreviewState({ image_retrying: true }), "retrying");
});
