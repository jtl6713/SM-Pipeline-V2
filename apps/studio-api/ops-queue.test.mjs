import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProducePauseToJob,
  emptyOpsQueueControls,
  isProducePaused,
  isRenderPaused,
  jobIsOpsPaused,
  normalizeOpsQueueControls,
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

test("worker and UI wire Operations Queue + prepare-to-review", () => {
  assert.match(worker, /\/api\/operations\/queue/);
  assert.match(worker, /\/api\/operations\/queue\/pause/);
  assert.match(worker, /\/api\/operations\/queue\/reorder/);
  assert.match(worker, /prepare-to-review/);
  assert.match(worker, /async function getStudioOperationsQueue/);
  assert.match(worker, /async function prepareIdeaToReview/);
  assert.match(worker, /version: "0\.10\.552-ops-queue"/);
  assert.match(worker, /origin=prepare-to-review/);
  assert.match(worker, /readOpsQueueControls/);
  assert.match(html, /data-ops-tab="queue"/);
  assert.match(html, /operationsQueuePanel/);
  assert.match(html, /prepareIdeaToReviewButton/);
  assert.match(app, /BUILD_ID = "item4-0\.6\.633-ops-page-nesting"/);
  assert.match(app, /loadOperationsQueue/);
  assert.match(app, /prepareIdeaToReviewButton/);
  assert.match(app, /OPS_CONTROL_TABS = \[[^\]]*\"queue\"/);
});
