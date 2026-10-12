import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPS_QUEUE_CONTENT_FIELDS,
  OPS_QUEUE_OUTPUT_FIELDS,
  OPS_QUEUE_REQUEST_FIELDS,
  applyProducePauseToJob,
  buildOpsE2eStages,
  emptyOpsQueueControls,
  isProducePaused,
  isRenderPaused,
  jobIsOpsPaused,
  normalizeOpsQueueControls,
  opsOutputSkipsRender,
  opsQueueItemTitle,
  partitionOpsQueues,
  queueLaneForStudioState,
  summarizeOpsQueueRows,
} from "./ops-queue.mjs";
import { sortRenderQueueCandidates, assignRenderQueuePositions } from "./render-queue.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "../studio-web/index.html"), "utf8");

function row(fields, id) {
  return { id, fields };
}
const field = (record, name) => record?.fields?.[name];

test("ops queue controls normalize pause + priority", () => {
  const controls = normalizeOpsQueueControls({
    produce_paused: { recProduce1234567: { reason: "stuck" } },
    render_paused: { bad: {}, recOutput12345678: { paused_by: "j@x.com" } },
    render_priority: ["recOutput12345678", "nope", "recOutput12345678"],
  });
  assert.equal(isProducePaused(controls, "recProduce1234567"), true);
  assert.equal(isRenderPaused(controls, "recOutput12345678"), true);
  assert.equal(isRenderPaused(controls, "bad"), false);
  assert.deepEqual(controls.render_priority, ["recOutput12345678"]);
  assert.equal(emptyOpsQueueControls().schema, "studio.ops-queue-controls.1");
});

test("render queue respects priority and omits paused", () => {
  const records = [
    row({ Output_ID: 10 }, "recAaaaaaaaaaaaa"),
    row({ Output_ID: 20 }, "recBbbbbbbbbbbbb"),
    row({ Output_ID: 30 }, "recCcccccccccccc"),
  ];
  const controls = normalizeOpsQueueControls({
    render_paused: { recBbbbbbbbbbbbb: { reason: "hold" } },
    render_priority: ["recCcccccccccccc"],
  });
  const ordered = sortRenderQueueCandidates(records, field, controls);
  assert.deepEqual(ordered.map((r) => r.id), ["recCcccccccccccc", "recAaaaaaaaaaaaa"]);
  const { byId, total } = assignRenderQueuePositions(records, field, { controls });
  assert.equal(total, 2);
  assert.equal(byId.get("recCcccccccccccc").position, 1);
  assert.equal(byId.has("recBbbbbbbbbbbbb"), false);
});

test("produce pause flag on job JSON", () => {
  const paused = applyProducePauseToJob({ step: "crops", job_id: "spj-1" }, {
    paused: true,
    pausedBy: "ops@test",
    reason: "stuck crop",
  });
  assert.equal(jobIsOpsPaused(paused), true);
  assert.equal(paused.paused_by, "ops@test");
  const resumed = applyProducePauseToJob(paused, { paused: false });
  assert.equal(jobIsOpsPaused(resumed), false);
});

test("ops queue item title prefers content/idea over content type", () => {
  assert.equal(opsQueueItemTitle({
    masterContentType: "Vertical Short Video",
    ideaTitle: "Brooklyn Bridge at dusk",
  }), "Brooklyn Bridge at dusk");
  assert.equal(opsQueueItemTitle({
    contentTitle: "Inside PAMM Design",
    outputTitle: "IG Reel",
    masterContentType: "Feed Post",
  }), "Inside PAMM Design");
  assert.equal(opsQueueItemTitle({
    masterContentType: "Vertical Short Video",
  }), "Vertical Short Video");
});

test("e2e trail marks render queue current and skips stills render", () => {
  const queued = buildOpsE2eStages({
    has_idea: true,
    request_status: "Promoted",
    variant_status: "Ready",
    plan_status: "Ready",
    platforms: ["Instagram"],
    kind: "output",
    output_id: 12,
    render_status: "Ready for Render",
    render_queue_position: 2,
    studio_output_type: "Vertical Short Video",
  });
  assert.equal(queued.current_id, "render_queue");
  assert.equal(queued.stages.find((stage) => stage.id === "render_queue")?.state, "current");
  assert.equal(queued.stages.find((stage) => stage.id === "media")?.state, "done");

  const stillInput = {
    has_idea: true,
    request_status: "Promoted",
    variant_status: "Ready",
    plan_status: "Ready",
    platforms: ["Instagram"],
    kind: "output",
    studio_output_type: "Single Image",
    output_status: "Ready for Review",
    studio_state: "Ready for Review",
    final_file_url: "https://example.com/photo.jpg",
  };
  assert.equal(opsOutputSkipsRender(stillInput), true);
  const still = buildOpsE2eStages(stillInput);
  assert.equal(still.stages.find((stage) => stage.id === "render_queue")?.state, "skipped");
  assert.equal(still.stages.find((stage) => stage.id === "rendering")?.state, "skipped");
  assert.equal(still.current_id, "review");
});

test("partition ops queues into render / publish / e2e", () => {
  const rows = [
    {
      kind: "output",
      id: "recRender00000001",
      title: "Bridge reel",
      content_item_id: "recContent0000001",
      content_id: 101,
      platform: "Instagram",
      studio_output_type: "Vertical Short Video",
      render_status: "Ready for Render",
      render_queue_position: 1,
      studio_state: "Waiting in render queue #1",
      request_status: "Promoted",
      variant_status: "Ready",
      plan_status: "Ready",
      idea_id: "recIdea0000000001",
      lane: "active",
    },
    {
      kind: "output",
      id: "recPublish0000001",
      title: "PAMM still",
      content_item_id: "recContent0000002",
      content_id: 102,
      platform: "Instagram",
      studio_output_type: "Single Image",
      output_status: "Ready for Review",
      studio_state: "Ready for Review",
      review_status: "Review Sent",
      final_file_url: "https://example.com/a.jpg",
      request_status: "Promoted",
      variant_status: "Ready",
      plan_status: "Ready",
      idea_id: "recIdea0000000002",
      lane: "review",
    },
  ];
  const queues = partitionOpsQueues(rows);
  assert.equal(queues.rendering.length, 1);
  assert.equal(queues.rendering[0].id, "recRender00000001");
  assert.equal(queues.publishing.length, 1);
  assert.equal(queues.publishing[0].id, "recPublish0000001");
  assert.ok(queues.end_to_end.length >= 2);
  assert.equal(queues.summary.rendering, 1);
  assert.equal(queues.summary.publishing, 1);
});

test("queue lanes + summary", () => {
  assert.equal(queueLaneForStudioState("Ready for Review"), "review");
  assert.equal(queueLaneForStudioState("Rendering", { stuck: { kind: "x" } }), "stuck");
  assert.equal(queueLaneForStudioState("Waiting", { renderPaused: true }), "paused");
  const summary = summarizeOpsQueueRows([
    { lane: "stuck" },
    { lane: "active", kind: "request", produce_step: "crops" },
    { lane: "review" },
    { lane: "active", kind: "output", render_queue_position: 2 },
  ]);
  assert.equal(summary.stuck, 1);
  assert.equal(summary.review, 1);
  assert.equal(summary.render_waiting, 1);
  assert.equal(summary.producing, 1);
});

test("ops queue Airtable field lists avoid unknown column names", () => {
  assert.equal(OPS_QUEUE_OUTPUT_FIELDS.includes("Last Modified"), false);
  assert.equal(OPS_QUEUE_REQUEST_FIELDS.includes("Idea_Title"), false);
  assert.equal(OPS_QUEUE_CONTENT_FIELDS.includes("Working_Title"), false);
  assert.ok(OPS_QUEUE_OUTPUT_FIELDS.includes("Studio_Preview_Updated_At"));
});

test("worker and UI wire Operations multi-queue + prepare-to-review", () => {
  assert.match(worker, /\/api\/operations\/queue/);
  assert.match(worker, /\/api\/operations\/queue\/pause/);
  assert.match(worker, /\/api\/operations\/queue\/reorder/);
  assert.match(worker, /prepare-to-review/);
  assert.match(worker, /async function getStudioOperationsQueue/);
  assert.match(worker, /partitionOpsQueues/);
  assert.match(worker, /async function prepareIdeaToReview/);
  assert.match(worker, /version: "0\.10\.555-ops-queue-fields"/);
  assert.match(worker, /origin=prepare-to-review/);
  assert.match(worker, /readOpsQueueControls/);
  assert.match(html, /data-ops-tab="queue"/);
  assert.match(html, /operationsQueuePanel/);
  assert.match(html, /opsRenderQueueLines/);
  assert.match(html, /opsPublishQueueLines/);
  assert.match(html, /opsE2eQueueLines/);
  assert.match(html, /opsE2eStageLabels/);
  assert.match(html, /ops-queue-cols-head/);
  assert.match(html, /prepareIdeaToReviewButton/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.639-ops-timeline-dots"/);
  assert.match(app, /loadOperationsQueue/);
  assert.match(app, /opsE2eTrailHtml/);
  assert.match(app, /ensureOpsE2eStageLabels/);
  assert.match(app, /ops-e2e-dot/);
  assert.match(app, /ops-e2e-track/);
  assert.match(app, /renderOpsRenderQueueDetail/);
  assert.match(app, /function applyOperationsNavVisibility/);
  assert.match(app, /function refreshOperationsNavFromSession/);
  assert.match(app, /prepareIdeaToReviewButton/);
  assert.match(app, /OPS_CONTROL_TABS = \[[^\]]*\"queue\"/);
  const newProfile = fs.readFileSync(path.join(here, "../studio-web/assets/new-profile-1009.js"), "utf8");
  assert.match(newProfile, /navOperations/);
  assert.match(newProfile, /ops\.hidden = false/);
});
