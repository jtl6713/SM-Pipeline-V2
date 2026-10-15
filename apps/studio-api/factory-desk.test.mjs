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
  factoryCardFromRow,
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

test("Content 617 review-ready output IDs remain in Needs Eyes", () => {
  const rows = [3202, 3203, 3204, 3205, 3206, 3207].map((id) => ({
    id: `recReview${id}`, kind: "output", output_id: id, content_id: 617,
    studio_state: "Ready for Review", output_status: "Ready for Review", review_status: "Review Sent",
  }));
  assert.deepEqual(partitionFactoryLanes(rows).lanes.needs_eyes.map((r) => r.output_id), [3202, 3203, 3204, 3205, 3206, 3207]);
});

test("Content 654 output 3431 stays In Flight while rendering despite Ready for Review", () => {
  const queueingStory = {
    id: "recfSBXLxPm0IMw54", kind: "output", output_id: 3431, content_id: 654,
    lane: "review", studio_state: "Ready for Review", output_status: "Ready for Review",
    render_status: "Waiting in Render Queue", final_file_url: "https://example.test/video.mp4",
  };
  assert.equal(classifyFactoryLane(queueingStory), "auto_high");
  const completed = { ...queueingStory, render_status: "Rendered" };
  assert.equal(classifyFactoryLane(completed), "needs_eyes");
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
    produce_step: "crops",
    studio_state: "Producing · crops",
    lane: "active",
  }), "auto_high");
  assert.equal(classifyFactoryLane({
    id: "rec4done",
    kind: "request",
    request_status: "Promoted",
    produce_step: "done",
    studio_state: "Promoted",
    lane: "active",
    title: "Crandon Sunrise Playbook",
  }), null);
  assert.equal(classifyFactoryLane({
    id: "rec4b",
    kind: "request",
    request_status: "Draft",
    production_notes: "origin=autonomous",
    studio_state: "Draft",
  }), "auto_high");
  assert.equal(classifyFactoryLane({
    id: "rec4c",
    kind: "request",
    request_status: "Draft",
    production_notes: "",
    studio_state: "Draft",
  }), "needs_assets");
  assert.equal(classifyFactoryLane({ id: "rec5", lane: "publish", studio_state: "Scheduled" }), null);
  assert.equal(classifyFactoryLane({
    id: "rec6",
    kind: "output",
    lane: "publish",
    studio_state: "Scheduled",
    output_status: "Scheduled",
    publish_status: "Scheduled",
    review_status: "Review Sent",
  }), null);
  // Transient produce_stale while waiting on serial Remotion stays In Flight.
  assert.equal(classifyFactoryLane({
    id: "recStaleProduce",
    kind: "request",
    lane: "stuck",
    stuck_kind: "produce_stale",
    stuck_class: "transient",
    request_status: "Promoted",
    produce_step: "render",
    studio_state: "produce_stale",
    title: "Brickell Golden Hour",
  }), "auto_high");
  assert.equal(classifyFactoryLane({
    id: "recRenderQueued",
    kind: "output",
    lane: "stuck",
    stuck_kind: "produce_stale",
    stuck_class: "transient",
    request_status: "Promoted",
    produce_step: "render",
    studio_state: "Ready for Render",
    render_status: "Ready for Render",
    output_status: "In Production",
    title: "High Line Fall Textures",
  }), "auto_high");
  assert.equal(classifyFactoryLane({
    id: "recRenderDoneParent",
    kind: "output",
    request_status: "Promoted",
    produce_step: "done",
    studio_state: "Waiting in Render Queue",
    render_status: "Waiting in Render Queue",
    output_status: "In Production",
    title: "Color Rush sibling",
  }), "auto_high");
  // Truly blocked / code_bug still lands in Repair.
  assert.equal(classifyFactoryLane({
    id: "recBlocked",
    kind: "request",
    stuck_kind: "produce_stale",
    stuck_class: "transient",
    produce_step: "blocked",
    studio_state: "Blocked",
    request_status: "Promoted",
  }), "manual");
  // Parent voiceover block must not hide Pipeline in-flight rows from Auto-high.
  // Proven: LA 650–654, job step blocked on ElevenLabs 401, Pipeline still says
  // Preparing Assets / Queued / Waiting in render queue.
  for (const studioState of ["Preparing Assets", "Queued", "Waiting in render queue"]) {
    assert.equal(classifyFactoryLane({
      id: `recInFlight${studioState}`,
      kind: "output",
      lane: "stuck",
      stuck_kind: "produce_stale",
      stuck_class: "transient",
      produce_step: "blocked",
      request_status: "Promoted",
      studio_state: studioState,
      render_status: studioState === "Waiting in render queue" ? "Waiting in Render Queue" : "",
      output_status: "In Production",
      title: "Corona Del Mar",
    }), "auto_high");
  }
  assert.equal(classifyFactoryLane({
    id: "recInFlightCodeBug",
    kind: "output",
    lane: "stuck",
    stuck_kind: "produce_clip_mismatch",
    stuck_class: "code_bug",
    produce_step: "blocked",
    studio_state: "Waiting in render queue",
    output_status: "In Production",
  }), "manual");
  assert.equal(classifyFactoryLane({
    id: "recInFlightFailed",
    kind: "output",
    produce_step: "blocked",
    studio_state: "Failed",
    output_status: "Failed",
  }), "manual");
  // Finished file painted Rerendering is a Worker heal, not Repair.
  assert.equal(classifyFactoryLane({
    id: "recPhantom",
    kind: "output",
    lane: "stuck",
    stuck_kind: "phantom_rerender",
    studio_state: "Rerendering",
    output_status: "In Production",
    review_status: "Changes Requested",
    render_status: "Native Photo Route",
    title: "Wheel Silhouette Shot",
  }), "auto_high");
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

test("factoryCardFromRow exposes authenticated preview path for Ready for Review outputs", () => {
  const card = factoryCardFromRow({
    id: "recEyesPreview0001",
    kind: "output",
    studio_state: "Ready for Review",
    final_file_url: "https://drive.google.com/file/d/abc/view",
    thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
    production_request_id: "recProductionRoundTrip1",
    content_item_id: "recContentRoundTrip0001",
    title: "Preview me",
  }, { lane: "needs_eyes" });
  assert.equal(card.preview_url, "/api/outputs/recEyesPreview0001/preview");
  assert.equal(card.can_preview, true);
  assert.equal(card.thumbnail_url, "https://media.chicagoshining.com/publish/cover.jpg");
  assert.equal(card.final_file_url, "https://drive.google.com/file/d/abc/view");
  assert.equal(card.production_request_id, "recProductionRoundTrip1");
  assert.equal(card.content_item_id, "recContentRoundTrip0001");

  const idea = factoryCardFromRow({
    id: "recIdeaNoPreview001",
    kind: "idea",
    studio_state: "Waiting for photos",
    title: "Stills",
  }, { lane: "needs_assets" });
  assert.equal(idea.preview_url, null);
  assert.equal(idea.can_preview, false);
});

test("Worker exposes factory desk routes and version flag", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /\/api\/factory\/desk/);
  assert.match(worker, /FACTORY_DESK_KEY/);
  assert.match(worker, /getFactoryDesk/);
  assert.match(worker, /mutateFactoryDesk/);
  assert.match(worker, /factoryApproveOutput/);
  assert.match(worker, /factorySendBackOutput/);
  const approveFn = worker.slice(
    worker.indexOf("async function approveOutputRecordForPublishing"),
    worker.indexOf("function mapApprovedOutputSummary"),
  );
  assert.match(approveFn, /studioSuggestedLocalDatetime\(MAE_PRIORITY_SCHEDULE_WINDOWS/);
  assert.match(approveFn, /No open morning, afternoon, or evening slot in the next 4 weeks/);
  assert.match(approveFn, /forceWrite: publishNowImmediate/);
  assert.match(worker, /async function studioHealApprovedMissingSchedule/);
  assert.match(worker, /await studioHealApprovedMissingSchedule\(env, \{ limit: 16 \}\)/);
  assert.match(worker, /async function studioHealPhantomRerender/);
  assert.match(worker, /await studioHealPhantomRerender\(env, \{ limit: 8 \}\)/);
  const phantomHeal = worker.slice(
    worker.indexOf("async function studioHealPhantomRerender"),
    worker.indexOf("async function studioHealFailedStatuses"),
  );
  assert.match(phantomHeal, /Output_Status: "Ready for Review"/);
  assert.match(phantomHeal, /Review_Status: "Review Sent"/);
  assert.match(phantomHeal, /Publish_Status: "Not Ready"/);
  assert.match(phantomHeal, /Render_Status = "Rendered"/);
  assert.match(phantomHeal, /Native Photo Route/);
  assert.doesNotMatch(phantomHeal, /Approved for Publishing/);
  assert.match(worker, /action === "approve"/);
  assert.match(worker, /action === "send_back"/);
  assert.match(worker, /action === "send_back_content"/);
  assert.match(worker, /factorySendBackContent/);
  assert.match(worker, /loadContentPlatformOutputs\(env, contentId\)/);
  assert.match(worker, /outputRowsForProductionRequest\(env, requestId, \{ includeInactive: true \}\)/);
  assert.match(worker, /Request_Status: "Draft"/);
  assert.match(worker, /Submitted_At: null/);
  assert.match(worker, /Studio_Production_Job_JSON: null/);
  assert.match(worker, /FACTORY_REVISION_NOTE_PREFIX/);
  assert.match(worker, /Production_Notes: withFactoryRevisionOpen/);
  assert.match(worker, /Output_Status: "Changes Requested"/);
  assert.match(worker, /Render_Status: "Needs Changes"/);
  assert.match(worker, /Do_Not_Publish: true/);
  assert.match(worker, /revision_approve/);
  assert.match(worker, /productionRequestRevisionOpen\(requestRecord\)/);
  assert.match(worker, /0.10.609-supabase-phase3-stable/);
  assert.match(worker, /studio_factory_inflight_blocked_parent_v1:\s*true/);
  assert.match(worker, /studio_factory_desk_v1:\s*true/);
  assert.match(worker, /studio_factory_desk_preview_v1:\s*true/);
});

test("Worker allows Factory Desk POST through Phase 2A gate", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /const isFactoryDeskWrite = isFactoryDeskRoute && request\.method === "POST"/);
  assert.match(worker, /isFactoryDeskWrite \|/);
  assert.match(worker, /version: "0.10.609-supabase-phase3-stable"/);
  assert.match(worker, /studio_factory_desk_write_v1: true/);
});

test("Worker allows Supabase sync POST through Phase 2A gate", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /const isOpsSupabaseSyncWrite = isOpsSupabaseSyncRoute && request\.method === "POST"/);
  assert.match(worker, /isOpsSupabaseSyncWrite \|/);
  assert.match(worker, /studio_supabase_sync_gate_v1: true/);
  assert.match(worker, /version: "0.10.609-supabase-phase3-stable"/);
});
