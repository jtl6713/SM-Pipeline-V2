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

test("failed Prepare with no persisted job preserves original server error", () => {
  const noJob = { variant_status: "None" };
  assert.equal(item4IsRetryablePrepareFailure({ message: "Request failed (503)" }, noJob), false);
  assert.equal(item4IsRetryablePrepareFailure({ message: "Request timed out" }, noJob), false);
  assert.equal(item4IsRetryablePrepareFailure({ message: "Request failed (502)" }, {}), false);
  assert.equal(item4IsRetryablePrepareFailure({ message: "Request failed (503)" },
    { variant_status: "Preparing" }), true);
  assert.equal(item4IsRetryablePrepareFailure({ bodyStatus: "Error", message: "Crop error" },
    { variant_status: "Preparing" }), false);
});

test("runtime does not hide missing frame jobs behind a generic retry", async () => {
  const fs = await import("node:fs");
  const runtime = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  const start = runtime.indexOf("  function item4IsRetryablePrepareFailure(");
  const end = runtime.indexOf("  function item4TimelineAutoPrepareEligibleUi(", start);
  assert.ok(start >= 0 && end > start);
  const helper = runtime.slice(start, end);
  assert.match(helper, /return variantStatus === "Preparing"/);
  assert.doesNotMatch(helper, /request failed \\(5/);
  assert.match(runtime, /Frame preparation did not start on the server/);
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

test("Prepare reuses the exact persisted Ready plan without resetting selected outputs", async () => {
  const fs = await import("node:fs");
  const runtime = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  const start = runtime.indexOf("  function item4SavedPlanMatchesCurrentSelection(");
  const end = runtime.indexOf("  async function item4AdoptReadyPlanFromReadback(", start);
  assert.ok(start >= 0 && end > start, "saved-plan validation helper exists");
  const helper = new Function(runtime.slice(start, end) +
    "; return item4SavedPlanMatchesCurrentSelection;")();
  const six = ["Instagram::Reel", "Facebook::Reel", "TikTok::Video Draft",
    "YouTube::Short", "Instagram::Story", "Facebook::Story"];
  const plan = { items: six.map(key => {
    const [platform, output_type] = key.split("::");
    return { platform, output_type, aspect_ratio: "9:16" };
  }) };
  assert.equal(helper(plan, six), true, "persisted six-format plan is accepted");
  assert.equal(helper(plan, [...six, "TikTok::Multi-Photo"]), false, "not for different selections");
  assert.equal(helper({ items: plan.items.slice(0, 5) }, six), false, "partial plan is rejected");
  assert.equal(helper({ items: plan.items.map((i, n) =>
    n === 0 ? { ...i, aspect_ratio: "" } : i) }, six), false, "missing ratio is rejected");
  const prepare = runtime.slice(runtime.indexOf("  async function prepareItem4Variants("),
    runtime.indexOf("  function renderItem4Workspace(", runtime.indexOf("  async function prepareItem4Variants(")));
  assert.match(prepare, /const savedReady = await item4AdoptReadyPlanFromReadback\(requestId, requestedKeys\)/);
  assert.match(prepare, /if \(!savedReady\) \{/);
  assert.match(prepare, /await buildItem4Plan\(\{ throwOnError: true \}\)/);
  assert.match(prepare, /!item4SavedPlanMatchesCurrentSelection\(item4Workspace\?\.plan, requestedKeys\)/);
  assert.match(runtime, /if \(options\.throwOnError === true\) throw error;/);
});

test("saved master photos unlock a read-only Prepare check despite stale workspace statuses", async () => {
  const fs = await import("node:fs");
  const runtime = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  const first = runtime.indexOf("  function item4CanConfirmMediaForPrepare(");
  const second = runtime.indexOf("  async function item4ConfirmSavedWorkspaceForPrepare(", first);
  assert.ok(first >= 0 && second > first);
  const source = runtime.slice(first, second);
  const getCanConfirm = (uploading, pendingRemoves, reordering) =>
    new Function("item4Workspace", "item4Uploading", "item4PendingRemoves", "item4ReorderBusy",
      source + "; return item4CanConfirmMediaForPrepare;")(
      null, uploading, new Set(pendingRemoves), reordering);
  const persisted = { plan_status: "Needs Plan", assets_status: "Uploading",
    assets: [{ id: "d9af19ec3cdc49a4ab", name: "Getty Center 1" }] };
  assert.equal(getCanConfirm(false, [], false)(persisted), true);
  assert.equal(getCanConfirm(false, [], false)({ assets: [{ id: "local:1" }] }), false);
  assert.equal(getCanConfirm(false, [], false)({ assets: [{ id: "staged:1" }] }), false);
  assert.equal(getCanConfirm(true, [], false)(persisted), false);
  assert.equal(getCanConfirm(false, ["asset-to-remove"], false)(persisted), false);
  assert.equal(getCanConfirm(false, [], true)(persisted), false);
  assert.match(runtime, /canAutoPlan: item4CanConfirmMediaForPrepare\(status\)/);
  assert.match(runtime, /const canAutoPlan = item4CanConfirmMediaForPrepare\(status\)/);
  assert.match(runtime, /\?snapshot=1/);
  const start = runtime.indexOf("  async function prepareItem4Variants(");
  const end = runtime.indexOf("  function renderItem4Workspace(", start);
  const prepare = runtime.slice(start, end);
  assert.match(prepare, /await item4ConfirmSavedWorkspaceForPrepare\(requestId\)/);
  assert.match(prepare, /if \(item4MastersNeedSave\(item4Workspace \|\| \{\}\)\)/);
  assert.match(prepare, /String\(item4Workspace\?\.assets_status \|\| ""\) !== "Ready"/);
});

test("Recommend and Save output selections re-read saved status instead of leaving Not Started", async () => {
  const fs = await import("node:fs");
  const runtime = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  const start = runtime.indexOf("  async function saveItem4OutputSelection(");
  const end = runtime.indexOf("  function productionOutputSelectionKeys(", start);
  const save = runtime.slice(start, end);
  assert.match(save, /await item4ConfirmSavedWorkspaceForPrepare\(requestId\)/);
  const startBuild = runtime.indexOf("  async function buildItem4Plan(");
  const endBuild = runtime.indexOf("  function selectedRequestPlatforms(", startBuild);
  const build = runtime.slice(startBuild, endBuild);
  assert.match(build, /await item4ConfirmSavedWorkspaceForPrepare\(activeProductionRequest\.id\)/);
  assert.match(build, /Platform plan verified and saved/);
});
