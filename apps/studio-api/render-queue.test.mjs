import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RENDER_STATUS_WAITING_QUEUE,
  SHARED_RENDER_WAITING_LABEL,
  assignRenderQueuePositions,
  collapseSharedRenderQueueCandidates,
  formatRenderQueueLabel,
  isActiveRemotionHold,
  isRenderQueueWaitingStampEligible,
  completedRenderRecoveryFields,
  isRealRemotionRetryFailure,
  isRenderQueueCandidateStatus,
  remotionHealthLooksBusy,
  sharedRenderGroupKey,
  sortRenderQueueCandidates,
} from "./render-queue.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "../studio-web/index.html"), "utf8");
const r4 = fs.readFileSync(path.join(here, "../../services/pipeline-runner/r4/processor.py"), "utf8");
const remotion = fs.readFileSync(path.join(here, "../../services/pipeline-runner/render/remotion_client.py"), "utf8");
const steps = fs.readFileSync(path.join(here, "../../services/pipeline-runner/studio_produce/steps.py"), "utf8");
const config = fs.readFileSync(path.join(here, "../../services/pipeline-runner/config.py"), "utf8");
const sharedRender = fs.readFileSync(
  path.join(here, "../../services/pipeline-runner/studio_produce/shared_render.py"),
  "utf8",
);

function row(fields, id = "rec1") {
  return { id, fields };
}

test("Stories stay independent Remotion queue jobs, not shared-render siblings", () => {
  const common = { Content_Item: ["recContent"], Aspect_Ratio: "9:16", Composition_ID: "ChicagoShiningPhotoSequence" };
  const inputs = [
    row({ ...common, Output_ID: 100, Platform: "Instagram", Studio_Output_Type: "Reel", Format: "Vertical Short Video" }, "recMain"),
    row({ ...common, Output_ID: 101, Platform: "Instagram", Studio_Output_Type: "Story", Format: "Story" }, "recIgStory"),
    row({ ...common, Output_ID: 102, Platform: "Facebook", Studio_Output_Type: "Story", Format: "Story" }, "recFbStory"),
  ];
  const queue = assignRenderQueuePositions(inputs);
  assert.equal(queue.total, 3);
  assert.deepEqual(queue.admitCandidates.map(x => x.id), ["recMain", "recIgStory", "recFbStory"]);
  assert.equal(queue.siblingMeta.size, 0);
});

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

test("shared 9:16 shorts collapse to one Remotion queue slot", () => {
  const content = ["recContent1"];
  const composition = "ChicagoShiningPhotoSequence";
  const pack = [
    row({
      Output_ID: 2485,
      Platform: "Instagram",
      Studio_Output_Type: "Reel",
      Aspect_Ratio: "9:16",
      Composition_ID: composition,
      Content_Item: content,
      Render_Status: "Waiting in Render Queue",
    }, "recIg"),
    row({
      Output_ID: 2487,
      Platform: "Facebook",
      Studio_Output_Type: "Reel",
      Aspect_Ratio: "9:16",
      Composition_ID: composition,
      Content_Item: content,
      Render_Status: "Waiting in Render Queue",
    }, "recFb"),
    row({
      Output_ID: 2489,
      Platform: "TikTok",
      Studio_Output_Type: "Video Draft",
      Aspect_Ratio: "9:16",
      Composition_ID: composition,
      Content_Item: content,
      Render_Status: "Waiting in Render Queue",
    }, "recTt"),
    row({
      Output_ID: 2490,
      Platform: "YouTube",
      Studio_Output_Type: "Short",
      Aspect_Ratio: "9:16",
      Composition_ID: composition,
      Content_Item: content,
      Render_Status: "Waiting in Render Queue",
    }, "recYt"),
  ];
  assert.equal(sharedRenderGroupKey(pack[0]), "recContent1|ChicagoShiningPhotoSequence|9:16");
  const { admitCandidates, siblingMeta, byId, total } = assignRenderQueuePositions(pack);
  assert.equal(total, 1);
  assert.equal(admitCandidates.length, 1);
  assert.equal(admitCandidates[0].id, "recIg");
  assert.equal(byId.get("recIg").label, "Waiting in render queue (#1 of 1)");
  assert.equal(siblingMeta.size, 3);
  assert.equal(byId.get("recFb").label, SHARED_RENDER_WAITING_LABEL);
  assert.equal(byId.get("recTt").position, null);
  assert.equal(byId.get("recYt").label, SHARED_RENDER_WAITING_LABEL);

  const held = collapseSharedRenderQueueCandidates(pack, undefined, {
    activeHolds: [
      row({
        Output_ID: 2485,
        Platform: "Instagram",
        Studio_Output_Type: "Reel",
        Aspect_Ratio: "9:16",
        Composition_ID: composition,
        Content_Item: content,
        Render_Status: "Rendering",
        Remotion_Job_ID: "job-1",
      }, "recIg"),
    ],
  });
  assert.equal(held.admitCandidates.length, 0);
  assert.equal(held.siblingIds.size, 3);
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
  assert.equal(
    remotionHealthLooksBusy({ remotionActiveRenders: 1, remotionInFlightJobs: 0, remotionMaxConcurrent: 1 }),
    false,
  );
});

test("Worker admit + mapOutput expose queue meta and Remotion job id", () => {
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);
  assert.match(worker, /studio_shared_render_queue_v1: true/);
  assert.match(worker, /studio_render_queue_wait_v1: true/);
  assert.match(worker, /async function studioAdmitRenderQueue/);
  assert.match(worker, /STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA/);
  assert.match(worker, /STUDIO_RENDER_QUEUE_ACTIVE_FORMULA/);
  assert.match(worker, /Waiting in Render Queue/);
  assert.match(worker, /isRealRemotionRetryFailure/);
  assert.match(worker, /remotion_job_id: f\(record, "Remotion_Job_ID"\)/);
  assert.match(worker, /render_queue_label: queueMeta\?\.label/);
  // #1812: stranded In Production rows without a Remotion job / final file are
  // requeued; skip active Rendering and Native Photo Route, and only consider
  // blank/ready/waiting render statuses via isRenderQueueCandidateStatus.
  assert.match(worker, /render === "Native Photo Route" \|\| render === "Rendering"\) return false/);
  assert.match(worker, /\(!render \|\| isRenderQueueCandidateStatus\(render\)\)/);
  assert.match(worker, /reason: "remotion_slot_busy"/);
  assert.match(worker, /shared_siblings_waiting/);
  assert.match(worker, /assignRenderQueuePositions\(candidates, f, \{\s*activeHolds/);
});

test("UI shows Waiting in render queue and shared-render sibling wait", () => {
  assert.match(app, /BUILD_ID = "item4-0[.]6[.][0-9]+[-a-zA-Z0-9.]*"/);
  assert.match(html, /app-item4-1008\.js\?v=0[.]6[.][0-9]+[-a-zA-Z0-9.]*/);
  assert.match(html, /UI build 0[.]6[.][0-9]+/);
  assert.match(app, /function pipelineRenderQueueLabel/);
  assert.match(app, /Waiting in render queue \(#\$\{pos\} of \$\{total\}\)/);
  assert.match(app, /Waiting for shared render/);
  assert.match(app, /if \(\/waiting in render queue\/i\.test\(state\)/);
  assert.match(app, /Only real Remotion failures/);
});

test("R4 and studio-produce park on busy Remotion slot", () => {
  const renderServer = fs.readFileSync(
    path.join(here, "../../services/remotion-renderer/render-server.js"),
    "utf8",
  );
  assert.match(renderServer, /function reconcileRemotionSlots/);
  assert.match(renderServer, /function countSlotHoldingRemotionJobs|holdsRemotionSlot|remotionInFlightJobs/);
  assert.match(renderServer, /remotionInFlightJobs/);
  assert.match(sharedRender, /SHARED_RENDER_OUTPUT_TYPES/);
  assert.match(sharedRender, /def pick_canonical/);
  assert.match(config, /PIPELINE_RUNNER_CODE_VERSION|SERVICE_VERSION/);
  assert.match(remotion, /def slot_busy\(self\)/);
  assert.match(r4, /waiting_for_remotion_slot/);
  assert.match(r4, /Waiting in Render Queue/);
  assert.match(steps, /Waiting in Render Queue/);
  assert.match(steps, /waiting_for_remotion_slot/);
  assert.match(steps, /busy_rendering or started_r4/);
});

test("P0 #1542: stale R4 snapshot cannot demote completed Story media to Waiting", () => {
  const ready = { Render_Status: "Ready for Render", Output_Status: "In Production" };
  assert.equal(isRenderQueueWaitingStampEligible(row(ready)), true);
  for (const finished of [
    { ...ready, Render_Status: "Rendered" },
    { ...ready, Remotion_Job_ID: "job-existing" },
    { ...ready, Final_File_URL: "https://drive.google.com/file/d/final/view" },
    { ...ready, Output_Status: "Ready for Review" },
    { ...ready, Output_Status: "Approved for Publishing" },
    { ...ready, Test_Run_ID: "synthetic" },
  ]) {
    assert.equal(isRenderQueueWaitingStampEligible(row(finished)), false);
  }
  assert.equal(isRenderQueueWaitingStampEligible(row({ ...ready, Render_Status: "Waiting in Render Queue" })), false);
});

test("P0 #1542: completed Story status regression recovers existing job/file but never an ambiguous render", () => {
  const saved = {
    Render_Status: "Ready for Render", Output_Status: "In Production",
    Remotion_Job_ID: "job-20261103170604-dbad63c1",
    Final_File_URL: "https://drive.google.com/file/d/finished/view",
    Final_File_Storage_Status: "Uploaded",
  };
  const promoted = completedRenderRecoveryFields(row(saved));
  assert.deepEqual(promoted, {
    Render_Status: "Rendered",
    Output_Status: "Ready for Review",
    Remotion_Error_Message: "",
    Final_File_Error_Message: "",
  });
  assert.ok(!("Remotion_Job_ID" in promoted) && !("Final_File_URL" in promoted));
  assert.ok(!("Review_Status" in promoted) && !("Publish_Status" in promoted));
  for (const render of ["Rendering", "Waiting in Render Queue", "Ready to Render"]) {
    assert.deepEqual(completedRenderRecoveryFields(row({ ...saved, Render_Status: render })), promoted);
  }
  for (const invalid of [
    { ...saved, Remotion_Job_ID: "" },
    { ...saved, Final_File_URL: "" },
    { ...saved, Final_File_Storage_Status: "Uploading" },
    { ...saved, Final_File_Storage_Status: "Failed" },
    { ...saved, Output_Status: "Approved for Publishing" },
    { ...saved, Output_Status: "Published" },
    { ...saved, Review_Status: "Approved" },
    { ...saved, Review_Status: "Changes Requested" },
    { ...saved, Published_At: "2026-11-03T17:00:00Z" },
    { ...saved, Do_Not_Publish: true },
    { ...saved, Test_Run_ID: "QA-only" },
  ]) {
    assert.equal(completedRenderRecoveryFields(row(invalid)), null);
  }
});
