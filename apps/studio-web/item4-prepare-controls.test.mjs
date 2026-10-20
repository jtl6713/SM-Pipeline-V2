import assert from "node:assert/strict";
import test from "node:test";

import {
  item4BridgeIssuesAreDestinationLinks,
  item4IsRetryablePrepareFailure,
  item4PrepareButtonView,
  item4VariantCountLabel,
  item4VariantProgressCounts,
  item4PrepareHttpStatus,
  item4ProductionPillState,
} from "./item4-prepare-controls.mjs";

test("stuck 23/27 prepare stays clickable as Retry remaining", () => {
  const view = item4PrepareButtonView({
    planStatus: "Ready",
    variantStatus: "Preparing",
    readyCount: 23,
    targetCount: 27,
    inFlight: false,
  });
  assert.equal(view.disabled, false);
  assert.equal(view.retry, true);
  assert.equal(view.label, "Retry remaining (23/27)");
});


test("assets-ready request with a missing plan keeps Prepare clickable for auto-plan", () => {
  assert.deepEqual(item4PrepareButtonView({
    planStatus: "Needs Plan",
    variantStatus: "None",
    canAutoPlan: true,
  }), { disabled: false, label: "Prepare", retry: false });

  assert.deepEqual(item4PrepareButtonView({
    planStatus: "Needs Plan",
    variantStatus: "None",
    canAutoPlan: false,
  }), { disabled: true, label: "Prepare", retry: false });
});

test("in-flight POST still locks the button", () => {
  const view = item4PrepareButtonView({
    planStatus: "Ready",
    variantStatus: "Preparing",
    readyCount: 23,
    targetCount: 27,
    inFlight: true,
  });
  assert.equal(view.disabled, true);
  assert.equal(view.label, "Preparing… 23/27");
});

test("failed prepare is Retry, not a greyed-out Preparing label", () => {
  const view = item4PrepareButtonView({
    planStatus: "Ready",
    variantStatus: "Error",
    readyCount: 23,
    targetCount: 27,
  });
  assert.equal(view.disabled, false);
  assert.equal(view.retry, true);
  assert.equal(view.label, "Retry");
});

test("first prepare and rebuild stay the existing labels", () => {
  assert.deepEqual(item4PrepareButtonView({
    planStatus: "Ready",
    variantStatus: "None",
  }), { disabled: false, label: "Prepare", retry: false });
  assert.deepEqual(item4PrepareButtonView({
    planStatus: "Ready",
    variantStatus: "Ready",
    readyCount: 27,
    targetCount: 27,
  }), { disabled: false, label: "Rebuild", retry: false });
});

test("Frames pill treats Preparing 23/27 as busy, not ready", () => {
  assert.equal(item4ProductionPillState("Preparing… 23/27 ready"), "busy");
  assert.equal(item4ProductionPillState("Preparing… 23/27"), "busy");
  assert.equal(item4ProductionPillState("23 frames ready"), "ready");
  assert.equal(item4ProductionPillState("Needs attention"), "attention");
});

test("Error status is not treated as a retryable 500 hang", () => {
  assert.equal(item4IsRetryablePrepareFailure({
    message: "crop failed",
    bodyStatus: "Error",
  }, { variant_status: "Preparing" }), false);
  assert.equal(item4IsRetryablePrepareFailure({
    message: "Request failed (500)",
  }, { variant_status: "Preparing" }), true);
  assert.equal(item4IsRetryablePrepareFailure({
    message: "crop failed",
  }, { variant_status: "Error" }), false);
});

test("failed prepare answers 409 instead of 500", () => {
  assert.equal(item4PrepareHttpStatus("Error"), 409);
  assert.equal(item4PrepareHttpStatus("Ready"), 200);
  assert.equal(item4PrepareHttpStatus("Preparing"), 202);
});

test("destination-link issues are not mixed with crop-complete copy", () => {
  assert.equal(item4BridgeIssuesAreDestinationLinks([
    "Instagram / Reel is not fully linked from the 9:16 source variants to its Production Request Output.",
  ]), true);
  assert.equal(item4BridgeIssuesAreDestinationLinks([
    "Platform-ready variants must be Ready before source-to-production handoff.",
  ]), false);
});

test("unknown frame target never displays the misleading 0/?", () => {
  assert.equal(item4VariantCountLabel(0, 0), "0 ready");
  assert.equal(item4PrepareButtonView({
    planStatus: "Ready", variantStatus: "Preparing", readyCount: 0, targetCount: 0,
  }).label, "Retry remaining (0 ready)");
  assert.equal(item4PrepareButtonView({
    planStatus: "Ready", variantStatus: "Preparing", readyCount: 0, targetCount: 0, inFlight: true,
  }).label, "Preparing… 0 ready");
});

test("variant progress uses persisted counts, API progress, then exact plan totals", () => {
  assert.deepEqual(item4VariantProgressCounts({
    variants: { ready_count: 3, target_count: 9 },
  }), { readyCount: 3, targetCount: 9 });
  assert.deepEqual(item4VariantProgressCounts({
    variants: null, variant_progress: { ready: 4, target: 12 },
  }), { readyCount: 4, targetCount: 12 });
  assert.deepEqual(item4VariantProgressCounts({
    variants: { ready_count: 0, target_count: 0, plan_ready_count: 2, plan_target_count: 8 },
  }), { readyCount: 2, targetCount: 8 });
  assert.deepEqual(item4VariantProgressCounts({
    variants: null,
  }), { readyCount: 0, targetCount: 0 });
});

test("production runtime uses the same count fallback as the tested controls", async () => {
  const fs = await import("node:fs");
  const runtime = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  assert.match(runtime, /function item4VariantProgressCounts\(status\)/);
  assert.match(runtime, /const \{ readyCount, targetCount \} = item4VariantProgressCounts\(status\)/);
  assert.match(runtime, /variant_progress: \{ ready: progressReady, target: progressTarget \}/);
  assert.doesNotMatch(runtime, /targetCount \|\| "\?"/);
});
