import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPS_QUEUE_CONTENT_FIELDS,
  OPS_QUEUE_OUTPUT_FIELDS,
  OPS_QUEUE_RENDER_FORMULA,
  OPS_QUEUE_REQUEST_FORMULA,
  OPS_QUEUE_REQUEST_FIELDS,
  applyProducePauseToJob,
  buildOpsE2eGroup,
  buildOpsE2eStages,
  emptyOpsQueueControls,
  isProducePaused,
  isRenderPaused,
  jobIsOpsPaused,
  mergeOpsQueueOutputRecords,
  normalizeOpsQueueControls,
  opsE2eLifecyclePhase,
  opsOutputSkipsRender,
  opsQueueItemTitle,
  opsQueueContinuationCandidatePriority,
  partitionOpsQueues,
  queueLaneForStudioState,
  summarizeOpsQueueRows,
} from "./ops-queue.mjs";
import { sortRenderQueueCandidates, assignRenderQueuePositions } from "./render-queue.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "../studio-web/index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "../studio-web/assets/styles-phase7-0621.css"), "utf8");

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
  assert.equal(queued.phase, "production");
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
  assert.equal(still.phase, "publishing");
});

test("e2e lifecycle phase maps IDEA/MEDIA/PLAT/FRAME → Idea and Open targets", () => {
  const ideaPhase = buildOpsE2eStages({
    has_idea: true,
    request_status: "Draft",
    variant_status: "",
    plan_status: "",
    idea_id: "recIdeaPhase000001",
  });
  assert.equal(ideaPhase.phase, "idea");
  assert.ok(["media", "platforms", "frames", "idea"].includes(ideaPhase.current_id));

  const mediaCurrent = {
    stages: [
      { id: "idea", state: "done" },
      { id: "media", state: "current" },
      { id: "platforms", state: "todo" },
    ],
    current_id: "media",
  };
  assert.equal(opsE2eLifecyclePhase(mediaCurrent), "idea");
  assert.equal(opsE2eLifecyclePhase({ current_id: "prod_approved" }), "production");
  assert.equal(opsE2eLifecyclePhase({ current_id: "render_queue" }), "production");
  assert.equal(opsE2eLifecyclePhase({ current_id: "review" }), "publishing");

  const group = buildOpsE2eGroup([{
    kind: "request",
    id: "recPrPhase00000001",
    production_request_id: "recPrPhase00000001",
    idea_id: "recIdeaPhase000001",
    title: "Phase idea",
    request_status: "Draft",
    profile_id: "recProfile0000001",
    profile_name: "Chicago",
  }]);
  assert.equal(group.idea_id, "recIdeaPhase000001");
  assert.equal(group.phase, "idea");
  assert.equal(group.e2e.phase, "idea");
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

test("ops queue request formula excludes Cancelled and finished Promoted produce", () => {
  assert.match(OPS_QUEUE_REQUEST_FORMULA, /Request_Status\}!="Cancelled"/);
  assert.match(OPS_QUEUE_REQUEST_FORMULA, /Request_Status\}="Draft"/);
  assert.match(OPS_QUEUE_REQUEST_FORMULA, /Request_Status\}="Submitted"/);
  // Promoted alone must not keep finished packages (job step=done) in Factory In Flight.
  assert.doesNotMatch(OPS_QUEUE_REQUEST_FORMULA, /Request_Status\}="Promoted"/);
  assert.match(OPS_QUEUE_REQUEST_FORMULA, /step":"done"/);
});

test("ops queue merges dedicated Remotion-lane rows so publishing cannot crowd them out", () => {
  assert.match(OPS_QUEUE_RENDER_FORMULA, /Ready for Render/);
  assert.match(OPS_QUEUE_RENDER_FORMULA, /Waiting in Render Queue/);
  assert.match(OPS_QUEUE_RENDER_FORMULA, /Rendering/);
  const publishHeavy = Array.from({ length: 160 }, (_, i) => ({
    id: `recPublish${String(i).padStart(8, "0")}`,
    fields: { Output_ID: 9000 + i, Render_Status: "Rendered", Output_Status: "Ready for Review" },
  }));
  const renderLane = [
    { id: "recRenderReady0001", fields: { Output_ID: 12, Render_Status: "Ready for Render" } },
    { id: "recRenderLive00001", fields: { Output_ID: 13, Render_Status: "Rendering" } },
  ];
  const merged = mergeOpsQueueOutputRecords(publishHeavy, renderLane);
  assert.equal(merged.length, 162);
  assert.ok(merged.some((row) => row.id === "recRenderReady0001"));
  assert.ok(merged.some((row) => row.id === "recRenderLive00001"));
});

test("worker and UI wire Operations multi-queue + prepare-to-review", () => {
  assert.match(worker, /\/api\/operations\/queue/);
  assert.match(worker, /\/api\/operations\/queue\/pause/);
  assert.match(worker, /\/api\/operations\/queue\/reorder/);
  assert.match(worker, /prepare-to-review/);
  assert.match(worker, /async function getStudioOperationsQueue/);
  assert.match(worker, /async function getStudioOperationsProfiles/);
  assert.match(worker, /studioReadSimilarWatchlist/);
  assert.match(worker, /partitionOpsQueues/);
  assert.match(worker, /mergeOpsQueueOutputRecords/);
  assert.match(worker, /OPS_QUEUE_RENDER_FORMULA/);
  assert.match(worker, /async function prepareIdeaToReview/);
  assert.match(worker, /version: "0.10.605-keep-picking"/);
  assert.match(worker, /origin=prepare-to-review/);
  assert.match(worker, /readOpsQueueControls/);
  assert.match(html, /data-ops-tab="queue"/);
  assert.match(html, /operationsQueuePanel/);
  assert.match(html, /opsRenderQueueLines/);
  assert.match(html, /opsPublishQueueLines/);
  assert.match(html, /opsE2eQueueLines/);
  assert.match(html, /opsE2eStageLabels/);
  assert.match(html, /opsPublishStageLabels/);
  assert.match(html, /opsRenderStageLabels/);
  assert.match(html, /ops-queue-cols-head/);
  assert.match(html, /ops-queue-timeline-head/);
  assert.match(html, />Timeline</);
  assert.match(html, />Phase</);
  // Rendering: Type replaces the Status column that duplicated Queue wait text.
  assert.match(html, /ops-queue-cols-render[\s\S]*?>Type<\/div><div>Queue</);
  assert.match(html, /ops-queue-cols-publish[\s\S]*?>Type<\/div><div>Status</);
  assert.match(html, /ops-queue-cols-e2e[\s\S]*?>Platform<\/div><div>Type</);
  assert.match(html, /prepareIdeaToReviewButton/);
  assert.match(app, /BUILD_ID = "item4-0.6.687-platforms-frames-details"/);
  assert.match(app, /function opsQueueOutputTypeLabel/);
  assert.match(app, /studio_output_type \|\| row\?\.format/);
  assert.match(app, /platforms: "Plat"/);
  assert.match(app, /Media Added/);
  assert.match(app, /Waiting for Approval/);
  assert.match(app, /OPS_E2E_PHASE_BY_STAGE/);
  assert.match(app, /opsQueueOpenIdeaPhase/);
  assert.match(app, /opsQueueOpenProductionPhase/);
  assert.match(app, /opsQueueOpenRow/);
  assert.match(app, /ops-queue-phase-band/);
  assert.match(app, /data-ops-queue-phase=/);
  assert.match(app, /showStudioPage\("ideas"\)/);
  // Idea-phase Open must not use the old always-Pipeline binder.
  const openBinder = app.slice(app.indexOf("function bindOpsQueueLineActions"), app.indexOf("function bindOpsQueueLineActions") + 2200);
  assert.match(openBinder, /opsQueueOpenRow\(button\)/);
  assert.equal(openBinder.includes('studioOpenPipelineFilter("all"'), false);
  const ideaOpen = app.slice(app.indexOf("async function opsQueueOpenIdeaPhase"), app.indexOf("async function opsQueueOpenProductionPhase"));
  assert.match(ideaOpen, /showStudioPage\("ideas"\)/);
  assert.match(ideaOpen, /openIdeaDrawer/);
  const prodOpen = app.slice(app.indexOf("async function opsQueueOpenProductionPhase"), app.indexOf("async function opsQueueOpenRow"));
  assert.match(prodOpen, /showStudioPage\("content"\)/);
  const renderLines = app.slice(app.indexOf("function renderOpsRenderQueueLines"), app.indexOf("function renderOpsPublishQueueLines"));
  assert.match(renderLines, /opsQueueOutputTypeLabel\(row\)/);
  assert.match(renderLines, /escapeHtml\(queueLabel\)/);
  // Status cell removed; wait/position stays in Queue (title keeps studio_state for hover).
  assert.equal((renderLines.match(/opsQueueOutputTypeLabel\(row\)/g) || []).length >= 1, true);
  assert.match(app, /loadOperationsQueue/);
  assert.match(app, /loadOperationsProfilesPanel/);
  assert.match(app, /\/api\/operations\/profiles/);
  assert.match(app, /opsE2eTrailHtml/);
  assert.match(app, /ensureOpsE2eStageLabels/);
  assert.match(app, /ops-e2e-dot/);
  assert.match(app, /ops-e2e-track/);
  assert.match(app, /setProperty\("--ops-e2e-count"/);
  assert.match(css, /minmax\(0,2\.4fr\) 4\.5rem/);
  assert.match(css, /minmax\(10rem,\s*max-content\)/);
  assert.match(css, /3\.4rem minmax\(110px,1\.3fr\)/);
  assert.match(css, /minmax\(56px,\.55fr\) minmax\(90px,\.95fr\)/);
  assert.match(css, /\.ops-queue-phase-chip/);
  assert.match(css, /\.ops-queue-phase-band/);
  assert.match(css, /\.ops-queue-block\{[^}]*flex-shrink:0/);
  assert.match(css, /\.ops-queue-block\{[^}]*overflow:visible/);
  assert.match(css, /ops-queue-block:has\(#opsRenderQueueLines\) \.ops-queue-lines\{[^}]*overflow:visible/);
  assert.match(css, /ops-multi-queues\{[^}]*max-height/);
  assert.match(css, /\.ops-e2e-labels,\s*\.ops-e2e-track/);
  assert.match(css, /left:calc\(50% \/ var\(--ops-e2e-count\)\)/);
  assert.match(app, /data-filled=/);
  assert.match(app, /renderOpsRenderQueueDetail/);
  assert.match(app, /function applyOperationsNavVisibility/);
  assert.match(app, /function refreshOperationsNavFromSession/);
  assert.match(app, /prepareIdeaToReviewButton/);
  assert.match(app, /OPS_CONTROL_TABS = \[[^\]]*\"queue\"/);
  const newProfile = fs.readFileSync(path.join(here, "../studio-web/assets/new-profile-1009.js"), "utf8");
  assert.match(newProfile, /navOperations/);
  assert.match(newProfile, /ops\.hidden = false/);
});


test("continuation prioritizes waiting Story renders over review-ready siblings", () => {
  const waiting = row({ Output_Status: "In Production", Studio_Output_Type: "Story", Render_Status: "Waiting in Render Queue", Remotion_Job_ID: "" }, "recWaitingStory123");
  const reviewed = row({ Output_Status: "Ready for Review", Studio_Output_Type: "Story", Render_Status: "Rendered" }, "recRenderedStory12");
  assert.equal(opsQueueContinuationCandidatePriority(waiting, field), 0);
  assert.equal(opsQueueContinuationCandidatePriority(reviewed, field), 2);
  assert.ok(opsQueueContinuationCandidatePriority(waiting, field) < opsQueueContinuationCandidatePriority(reviewed, field));
  assert.match(worker, /const stalledStories = await listRecords/);
  assert.match(worker, /\.\.\.newest, \.\.\.stalledStories/);
  assert.match(worker, /result\.action !== "reviewable" && result\.action !== "stop"/);
});
