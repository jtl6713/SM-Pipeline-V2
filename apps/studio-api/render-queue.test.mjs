import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RENDER_STATUS_WAITING_QUEUE,
  assignRenderQueuePositions,
  formatRenderQueueLabel,
  isActiveRemotionHold,
  isRealRemotionRetryFailure,
  isRenderQueueCandidateStatus,
  remotionHealthLooksBusy,
  sortRenderQueueCandidates,
} from "./render-queue.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "../studio-web/index.html"), "utf8");
const r4 = fs.readFileSync(path.join(here, "../../services/pipeline-runner/r4/processor.py"), "utf8");
const remotion = fs.readFileSync(path.join(here, "../../services/pipeline-runner/render/remotion_client.py"), "utf8");
const steps = fs.readFileSync(path.join(here, "../../services/pipeline-runner/studio_produce/steps.py"), "utf8");
const config = fs.readFileSync(path.join(here, "../../services/pipeline-runner/config.py"), "utf8");

function row(fields, id = "rec1") {
  return { id, fields };
}

test("render queue labels and ordering", () => {
  assert.equal(formatRenderQueueLabel(4, 12), "Waiting in render queue (#4 of 12)");
  assert.equal(formatRenderQueueLabel(0, 12), "Waiting in render queue");
  const ordered = sortRenderQueueCandidates([
    row({ Output_ID: 20 }, "recB"),
    row({ Output_ID: 10 }, "recA"),
  ]);
  assert.deepEqual(ordered.map((r) => r.id), ["recA", "recB"]);
  const { byId, total } = assignRenderQueuePositions(ordered);
  assert.equal(total, 2);
  assert.equal(byId.get("recA").label, "Waiting in render queue (#1 of 2)");
  assert.equal(byId.get("recB").position, 2);
});

test("Trying Again only for real Remotion failures, never queue wait", () => {
  assert.equal(
    isRealRemotionRetryFailure(row({
      Render_Status: "Waiting in Render Queue",
      Remotion_Error_Message: "stale",
    })),
    false,
  );
  assert.equal(
    isRealRemotionRetryFailure(row({
      Render_Status: "Ready for Render",
      Final_File_Error_Message: "old",
    })),
    false,
  );
  assert.equal(
    isRealRemotionRetryFailure(row({
      Render_Status: "Failed",
      Remotion_Error_Message: "delayRender timed out",
    })),
    true,
  );
  assert.equal(
    isRealRemotionRetryFailure(row({
      Render_Status: "Failed",
      Remotion_Error_Message: "Command failed with exit code 1",
    })),
    true,
  );
  assert.equal(
    isActiveRemotionHold(row({
      Render_Status: "Rendering",
      Remotion_Job_ID: "job-1",
      Final_File_URL: "",
    })),
    true,
  );
  assert.equal(
    isActiveRemotionHold(row({
      Render_Status: "Waiting in Render Queue",
      Remotion_Job_ID: "",
    })),
    false,
  );
  assert.equal(isRenderQueueCandidateStatus(RENDER_STATUS_WAITING_QUEUE), true);
  assert.equal(remotionHealthLooksBusy({ remotionActiveRenders: 1, remotionMaxConcurrent: 1 }), true);
  assert.equal(remotionHealthLooksBusy({ remotionActiveRenders: 0, remotionMaxConcurrent: 1 }), false);
});

test("Worker admit + mapOutput expose queue meta and Remotion job id", () => {
  assert.match(worker, /version: "0\.10\.509-pr-superseded-cancel"/);
  assert.match(worker, /studio_render_queue_wait_v1: true/);
  assert.match(worker, /async function studioAdmitRenderQueue/);
  assert.match(worker, /STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA/);
  assert.match(worker, /STUDIO_RENDER_QUEUE_ACTIVE_FORMULA/);
  assert.match(worker, /Waiting in Render Queue/);
  assert.match(worker, /isRealRemotionRetryFailure/);
  assert.match(worker, /remotion_job_id: f\(record, "Remotion_Job_ID"\)/);
  assert.match(worker, /render_queue_label: queueMeta\?\.label/);
  assert.match(worker, /isRenderQueueCandidateStatus\(render\)\) return false/);
  assert.match(worker, /reason: "remotion_slot_busy"/);
});

test("UI shows Waiting in render queue and narrows Trying Again", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.568-pr-superseded-cancel"/);
  assert.match(html, /app-item4-1008\.js\?v=0\.6\.568-pr-superseded-cancel/);
  assert.match(html, /UI build 0\.6\.568/);
  assert.match(app, /function pipelineRenderQueueLabel/);
  assert.match(app, /Waiting in render queue \(#\$\{pos\} of \$\{total\}\)/);
  assert.match(app, /if \(\/waiting in render queue\/i\.test\(state\)/);
  assert.match(app, /Only real Remotion failures/);
});

test("R4 and studio-produce park on busy Remotion slot", () => {
  assert.match(config, /2026-10-10-render-queue-wait/);
  assert.match(remotion, /def slot_busy\(self\)/);
  assert.match(r4, /waiting_for_remotion_slot/);
  assert.match(r4, /Waiting in Render Queue/);
  assert.match(steps, /Waiting in Render Queue/);
  assert.match(steps, /waiting_for_remotion_slot/);
  assert.match(steps, /busy_rendering or started_r4/);
});
