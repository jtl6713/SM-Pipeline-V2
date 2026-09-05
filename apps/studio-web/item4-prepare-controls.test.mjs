import assert from "node:assert/strict";
import test from "node:test";

import {
  item4IsRetryablePrepareFailure,
  item4PrepareButtonView,
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
