import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as fs from "node:fs";
import { vibeAutoReviewVerifiedSource } from "./vibe-auto-review.mjs";

const notes = `origin=ez-wizard; ez-input=vibe-cut; ez-caption=ai; ez-package=video
[vibe-cut] {"mode":"vibe_cut","style":"beat-cut","target_seconds":15}
ez-photo-wait=off`;
const video = {
  id: "saved-video", media_kind: "video", mime_type: "video/mp4",
  name: "video-1660_singular_display.mov",
  upload_status: "complete", compression_status: "ready",
  google_drive_file_id: "drive-saved-source", media_asset_record_id: "recSavedMediaSource",
};
const input = {
  notes, assets: [video], masterStatus: "Ready", masterCount: 1,
};

test("uploaded Vibe Cut is eligible for automatic handoff to human review", () => {
  assert.equal(vibeAutoReviewVerifiedSource(input), true);
});

test("never advance an incomplete, corrupt, or missing original video", () => {
  const variants = [
    { assets: [] }, { masterStatus: "Uploading" }, { masterStatus: "Error" },
    { masterCount: 0 }, { masterCount: 2 },
    { assets: [{ ...video, media_asset_record_id: null }] },
    { assets: [{ ...video, google_drive_file_id: null }] },
    { assets: [{ ...video, upload_status: "multipart_pending" }] },
    { assets: [{ ...video, upload_status: "uploading" }] },
    { assets: [{ ...video, upload_status: null }] },
    { assets: [{ ...video, compression_status: "compressing" }] },
    { assets: [{ ...video, compression_status: "failed" }] },
    { assets: [{ ...video, media_kind: "photo", mime_type: "image/jpeg", name: "photo.jpg" }] },
    { assets: [video, video] },
    { notes: "origin=ez-wizard; ez-input=finished-video" },
    { notes: "origin=ez-wizard; ez-input=vibe-cut" },
  ];
  for (const change of variants) {
    assert.equal(vibeAutoReviewVerifiedSource({ ...input, ...change }), false,
      `must block: ${JSON.stringify(change).slice(0,170)}`);
  }
});

test("automatic queue has exact Idea and request gates; never authorizes other Generated drafts", () => {
  const src = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const eligibility = src.slice(src.indexOf("function readyProductionExistingDraftEligible("),
    src.indexOf("function readyProductionIdeaEligible("));
  assert.match(eligibility, /linkedRecordIds\(f\(requestRecord, "Idea_Candidate"\)\)\.includes\(idea\.id\)/);
  assert.match(eligibility, /productionNotesRevisionOpen\(notes\)/);
  assert.match(eligibility, /readyProductionVerifiedVibeDraft\(requestRecord\)/);
  assert.match(eligibility, /Candidate_Status/);
  const helper = src.slice(src.indexOf("function readyProductionVerifiedVibeDraft("),
    src.indexOf("function readyProductionExistingDraftEligible("));
  assert.match(helper, /vibeAutoReviewVerifiedSource\(/);
  assert.match(helper, /item4AssetManifest\(requestRecord\)/);
});

test("queue discovers recently completed Vibes without changing old approved-draft scans", () => {
  const src = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const vibeQuery = src.slice(src.indexOf("async function discoverReadyVibeProductionDrafts("),
    src.indexOf("async function readyProductionRequestForIdea("));
  assert.match(vibeQuery, /FIND\('ez-input=vibe-cut'/);
  assert.match(vibeQuery, /sortField: "Updated_At"/);
  assert.match(vibeQuery, /sortDirection: "desc"/);
  assert.match(vibeQuery, /Studio_Master_Asset_Status\}='Ready'/);
  assert.match(vibeQuery, /Studio_Master_Asset_Count\}=1/);
  const cron = src.slice(src.indexOf("async function studioReadyProductionCronResume("),
    src.indexOf("export { studioReadyProductionCronResume };"));
  assert.match(cron, /discoverReadyVibeProductionDrafts\(env/);
  assert.match(cron, /discoverAssetReadyProductionDrafts\(env/);
  assert.match(cron, /scannedDrafts\.has\(draft\.id\)/);
  assert.match(cron, /readyProductionClaim\(env\.STUDIO_MEDIA/);
  assert.match(cron, /final_approval: "human_only"/);
  assert.doesNotMatch(cron, /approveOutputRecordForPublishing/);
});

test("Vibe source, notes and chosen outputs are preserved throughout automatic progression", () => {
  const src = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const claim = src.slice(src.indexOf("async function processReadyProductionClaim("),
    src.indexOf("async function studioReadyProductionCronResume("));
  assert.match(claim, /const verifiedVibeDraft = Boolean\(/);
  assert.match(claim, /manualAssetSelection = verifiedVibeDraft/);
  assert.match(claim, /if \(!manualAssetSelection\) \{/);
  assert.match(claim, /if \(!verifiedVibeDraft && !\/origin=/);
  assert.match(claim, /if \(!autonomousHasUsableItem4Plan\(requestRecord\)\)/);
  const finish = src.slice(src.indexOf("export async function finishAutonomousProductionRequest("),
    src.indexOf("/*__STUDIO_WORKER_END:finishAutonomousProductionRequest__*/"));
  assert.match(finish, /incoming\.length && !vibeAutoReviewVerifiedSource/);
  assert.match(finish, /prepareItem4Variants/);
  assert.match(finish, /promoteProductionRequestViaI3I4/);
  assert.match(finish, /enqueueStudioProductionJob/);
  assert.match(finish, /advanceStudioProductionOutputs/);
});

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const logic = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");

function part(begin, end) {
  const a = logic.indexOf(begin);
  const b = logic.indexOf(end, a + begin.length);
  assert.ok(a >= 0 && b > a, `Missing ${begin}/${end}`);
  return logic.slice(a, b);
}

test("Vibe auto-to-review is authenticated and explicit write-gated", () => {
  assert.match(worker, /isVibeCutToReviewRoute/);
  assert.match(worker, /isVibeCutToReviewWrite\s*\|\|/);
  assert.match(worker, /requirePermission\(authorization, "ideas_promote"\)/);
  assert.match(worker, /requirePermission\(authorization, "production_configure"\)/);
  assert.match(worker, /return advanceVibeCutToReview\(request, env, url, authorization, ctx\)/);
});

test("Vibe advancement requires verified original, Ready state and no open Factory revision", () => {
  const method = part("export async function advanceVibeCutToReview(", "/*__STUDIO_WORKER_END:advanceVibeCutToReview__*/");
  assert.match(method, /loadAuthorizedProductionRequest\(env, requestId, authorization\)/);
  assert.match(method, /isVibeCutNotes\(notes\)/);
  assert.match(method, /productionNotesRevisionOpen\(notes\)/);
  assert.match(method, /Studio_Master_Asset_Status/);
  assert.match(method, /validateVibeCutSourceAssets\(media\)/);
  assert.match(method, /Request_Status/);
  assert.match(method, /\["Draft", "Ready"\]/);
  assert.match(method, /origin=prepare-to-review/);
  assert.match(method, /stampPrepareToReviewNotes\(notes\)/);
  assert.match(method, /already_started: true/);
});

test("Vibe review continuation preserves original media and final human approval", () => {
  const method = part("export async function advanceVibeCutToReview(", "/*__STUDIO_WORKER_END:advanceVibeCutToReview__*/");
  assert.match(method, /media_asset_ids: \[\]/);
  assert.match(method, /finishAutonomousProductionRequest\(/);
  assert.match(method, /ctx\.waitUntil\(continueReview\(\)/);
  assert.match(method, /publishing: false/);
  assert.doesNotMatch(method, /publish-kick|publish-now|approve-all/);
  assert.match(logic, /readyProductionOutputsAwaitingFinalApproval/);
});
