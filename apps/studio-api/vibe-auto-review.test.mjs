import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { vibeAutoReviewDecision } from "./vibe-auto-review.mjs";

const notes = "origin=ez-wizard; ez-input=vibe-cut; ez-package=video";
const asset = { id: "studio-video-1", media_kind: "video", name: "video.mov",
  upload_status: "complete", compression_status: "ready",
  google_drive_file_id: "drive-1", media_asset_record_id: "recABCDE123456789" };
const base = { notes, requestStatus: "Draft", masterStatus: "Ready", planStatus: "Ready", assets: [asset] };
const decide = (changes = {}) => vibeAutoReviewDecision({ ...base, ...changes });

test("vibe dispatch promotes only verified server-side video and never a partial upload", () => {
  assert.equal(decide().step, "promote");
  for (const upload_status of ["multipart_pending", "uploading", "failed"]) {
    assert.equal(decide({ assets: [{ ...asset, upload_status }] }).step, "wait");
  }
  for (const compression_status of ["queued", "compressing", "failed"]) {
    assert.equal(decide({ assets: [{ ...asset, compression_status }] }).step, "wait");
  }
  assert.equal(decide({ assets: [asset, asset] }).step, "wait");
  assert.equal(decide({ assets: [{ ...asset, media_kind: "photo", name: "photo.jpg" }] }).step, "wait");
  assert.equal(decide({ masterStatus: "Processing" }).step, "wait");
  assert.equal(decide({ assets: [{ ...asset, google_drive_file_id: "" }] }).step, "wait");
  assert.equal(decide({ assets: [{ ...asset, media_asset_record_id: "" }] }).step, "wait");
});

test("vibe dispatch plans the expected outputs, preserving horizontal destinations", () => {
  const normal = decide({ planStatus: "None" });
  assert.equal(normal.step, "plan");
  assert.deepEqual(normal.defaults.platforms, ["Instagram", "Facebook", "TikTok", "YouTube"]);
  assert.deepEqual(normal.defaults.extras, ["Instagram::Story", "Facebook::Story"]);
  const horizontal = decide({ planStatus: "None", notes: notes + "; source-aspect=horizontal" });
  assert.equal(horizontal.step, "plan");
  assert.deepEqual(horizontal.defaults.platforms, ["YouTube"]);
  assert.deepEqual(horizontal.defaults.extras, ["YouTube::Short"]);
});

test("vibe dispatch never auto-publishes, supersedes an operator, or touches non-Vibe", () => {
  assert.equal(decide({ requestStatus: "Submitted" }).step, "finalize");
  assert.equal(decide({ requestStatus: "Promoted" }).step, "complete");
  assert.equal(decide({ requestStatus: "Cancelled" }).step, "skip");
  assert.equal(decide({ notes: "origin=az-finished-video; ez-input=finished-video" }).step, "skip");
  assert.equal(decide({ notes: "origin=autonomous; ez-input=vibe-cut" }).step, "skip");
  assert.equal(decide({ revisionOpen: true }).step, "skip");
  assert.equal(decide({ disabled: true }).step, "skip");
});

test("worker cron wiring stays one-job bounded and never invokes automatic review/publish", () => {
  const js = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  assert.match(js, /resumeVibeCutsTowardApproval\(env, ctx\)/);
  assert.match(worker, /export async function resumeVibeCutsTowardApproval/);
  const start = worker.indexOf("export async function advanceVibeCutTowardApproval(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:resumeVibeCutsTowardApproval__*/", start);
  assert.ok(start > 0 && end > start);
  const route = worker.slice(start, end);
  assert.match(route, /vibeAutoReviewDecision/);
  assert.match(route, /promoteProductionRequestViaI3I4/);
  assert.match(route, /continueParkedProductionAfterPromote/);
  assert.doesNotMatch(route, /azAutoApproveIfReady|approveOutputRecordForPublishing|publishOutput|scheduleStudioPublishOutput/);
  assert.match(worker.slice(worker.indexOf("export async function resumeVibeCutsTowardApproval("), end), /rows\.slice\(0, 1\)/);
});
