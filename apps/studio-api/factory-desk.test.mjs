import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  FACTORY_DESK_KEY,
  FACTORY_DESK_SCHEMA,
  FACTORY_NEEDS_ASSETS_MAX,
  classifyFactoryLane,
  emptyFactoryDeskControls,
  normalizeFactoryDeskControls,
  partitionFactoryLanes,
  pinFactoryNeedsAssets,
  unpinFactoryNeedsAssets,
} from "./factory-desk.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("factory desk controls normalize and cap needs-assets at 3", () => {
  assert.equal(emptyFactoryDeskControls().schema, FACTORY_DESK_SCHEMA);
  assert.equal(FACTORY_NEEDS_ASSETS_MAX, 3);
  assert.equal(FACTORY_DESK_KEY, "studio/state/factory-desk.json");

  const normalized = normalizeFactoryDeskControls({
    needs_assets: [
      { id: "recAAAAAAAAAAAA1", kind: "idea", title: "One" },
      { id: "recAAAAAAAAAAAA1", kind: "idea", title: "Dup" },
      { id: "recAAAAAAAAAAAA2", kind: "request", title: "Two" },
      { id: "recAAAAAAAAAAAA3", kind: "request", title: "Three" },
      { id: "recAAAAAAAAAAAA4", kind: "request", title: "Four" },
      { id: "bad", kind: "request", title: "Skip" },
    ],
  });
  assert.equal(normalized.needs_assets.length, 3);
  assert.deepEqual(
    normalized.needs_assets.map((row) => row.id),
    ["recAAAAAAAAAAAA1", "recAAAAAAAAAAAA2", "recAAAAAAAAAAAA3"],
  );
});

test("pinFactoryNeedsAssets enforces max 3 and unpin removes", () => {
  let controls = emptyFactoryDeskControls();
  for (const id of ["recAAAAAAAAAAAA1", "recAAAAAAAAAAAA2", "recAAAAAAAAAAAA3"]) {
    const result = pinFactoryNeedsAssets(controls, { id, kind: "idea", title: id }, { actor: "ops@test" });
    assert.equal(result.ok, true);
    controls = result.controls;
  }
  const full = pinFactoryNeedsAssets(controls, { id: "recAAAAAAAAAAAA4", kind: "idea", title: "Four" });
  assert.equal(full.ok, false);
  assert.equal(full.error, "needs_assets_full");
  assert.equal(full.controls.needs_assets.length, 3);

  const removed = unpinFactoryNeedsAssets(controls, "recAAAAAAAAAAAA2");
  assert.equal(removed.controls.needs_assets.length, 2);
  const again = pinFactoryNeedsAssets(removed.controls, { id: "recAAAAAAAAAAAA4", kind: "idea", title: "Four" });
  assert.equal(again.ok, true);
  assert.equal(again.controls.needs_assets.length, 3);
});

test("classifyFactoryLane priority: manual > needs_eyes > needs_assets > auto_high", () => {
  assert.equal(classifyFactoryLane({ id: "rec1", lane: "stuck", stuck_kind: "produce_clip_mismatch" }), "manual");
  assert.equal(classifyFactoryLane({ id: "rec2", studio_state: "Ready for Review", lane: "review" }), "needs_eyes");
  assert.equal(classifyFactoryLane({
    id: "rec3",
    kind: "idea",
    photo_wait_status: "Waiting",
    studio_state: "Waiting for photos",
  }), "needs_assets");
  assert.equal(classifyFactoryLane({
    id: "rec4",
    kind: "request",
    request_status: "Promoted",
    studio_state: "Producing · crops",
    lane: "active",
  }), "auto_high");
  assert.equal(classifyFactoryLane({ id: "rec5", lane: "publish", studio_state: "Scheduled" }), null);
});

test("partitionFactoryLanes puts pile in needs_assets and leaves candidates aside", () => {
  const rows = [
    { id: "recManual1", kind: "output", lane: "stuck", stuck_kind: "x", title: "Stuck", studio_state: "Blocked" },
    { id: "recEyes1", kind: "output", lane: "review", studio_state: "Ready for Review", title: "Review me" },
    { id: "recAuto1", kind: "request", lane: "active", request_status: "Promoted", studio_state: "Producing · audio", title: "Auto" },
    { id: "recAsset1", kind: "idea", photo_wait_status: "Waiting", studio_state: "Waiting", title: "Need stills" },
    { id: "recAsset2", kind: "idea", photo_wait_status: "Waiting", studio_state: "Waiting", title: "Also need" },
  ];
  const controls = normalizeFactoryDeskControls({
    needs_assets: [{ id: "recAsset1", kind: "idea", title: "Need stills" }],
  });
  const part = partitionFactoryLanes(rows, controls);
  assert.equal(part.summary.manual, 1);
  assert.equal(part.summary.needs_eyes, 1);
  assert.equal(part.summary.auto_high, 1);
  assert.equal(part.summary.needs_assets_pile, 1);
  assert.equal(part.summary.needs_assets_candidates, 1);
  assert.equal(part.lanes.needs_assets[0].id, "recAsset1");
  assert.equal(part.lanes.needs_assets[0].in_needs_assets_pile, true);
  assert.equal(part.needs_assets_candidates[0].id, "recAsset2");
});

test("Worker exposes factory desk routes and version flag", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /\/api\/factory\/desk/);
  assert.match(worker, /FACTORY_DESK_KEY/);
  assert.match(worker, /getFactoryDesk/);
  assert.match(worker, /mutateFactoryDesk/);
  assert.match(worker, /factoryApproveOutput/);
  assert.match(worker, /factorySendBackOutput/);
  assert.match(worker, /action === "approve"/);
  assert.match(worker, /action === "send_back"/);
  assert.match(worker, /0\.10\.563-factory-actions/);
  assert.match(worker, /studio_factory_desk_v1:\s*true/);
});
