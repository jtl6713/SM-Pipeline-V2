import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDeskMode,
  deskModeAllows,
  classifyProduceJob,
  errorClassFromText,
  classifyRenderRow,
  classifyCropRow,
  classifyAutonomousRequest,
  classifyHealthTarget,
  classifyIntakeResidue,
  classifyPromotedNotRfr,
  classifyAzNotAutoFinished,
  classifyAutonomousRfrGate,
  classifyPublishDispatch,
  classifyNativeCover,
  classifyTesterNightly,
  classifyTesterCatalogAssert,
  originFromNotes,
  CLASSIFIER_KINDS,
  fingerprint,
  pathIsAutoMergeAllowlisted,
  deskMayAutomerge,
  deskMayRestart,
  parseDeskCaps,
  summarizeIncidents,
  buildDeskInventoryPayload,
  DEFAULT_DESK_MODE,
} from "./desk-inventory.mjs";

test("desk mode ladder and kill switch", () => {
  assert.equal(parseDeskMode(""), DEFAULT_DESK_MODE);
  assert.equal(parseDeskMode("OFF"), "off");
  assert.equal(deskModeAllows("off", "ticket"), false);
  assert.equal(deskModeAllows("observe", "ticket"), true);
  assert.equal(deskModeAllows("observe", "restart"), false);
  assert.equal(deskModeAllows("infra", "deploy_local"), true);
  assert.equal(deskModeAllows("patch", "open_pr"), true);
  assert.equal(deskModeAllows("patch", "automerge"), false);
  assert.equal(deskModeAllows("automerge", "automerge"), true);
});

test("produce jobs escalate after heal budget then stay transient while retries remain", () => {
  const now = Date.parse("2026-09-07T04:00:00Z");
  assert.equal(classifyProduceJob({ step: "done" }, now), null);
  const blocked = classifyProduceJob({
    request_id: "recJob1",
    step: "blocked",
    job_id: "spj-1",
    updated_at: "2026-09-07T03:59:00Z",
    error: "timeout talking to render",
    heal: { resume_count: 2, max_resumes: 5 },
  }, now);
  assert.equal(blocked.kind, "produce_stale");
  assert.equal(blocked.class, "transient");
  assert.equal(blocked.actor, "worker_heal");
  const escalated = classifyProduceJob({
    request_id: "recJob1",
    step: "escalated",
    job_id: "spj-1",
    updated_at: "2026-09-07T03:00:00Z",
    error: "retries exhausted",
    heal: { resume_count: 5, max_resumes: 5 },
  }, now);
  assert.equal(escalated.kind, "produce_escalated");
  assert.equal(escalated.class, "code_bug");
  assert.equal(escalated.fingerprint, fingerprint("produce_escalated", "recJob1", "heal_exhausted"));
  const mismatch = classifyProduceJob({
    request_id: "reccEj6eVXPPKalJd",
    step: "blocked",
    job_id: "spj-1",
    updated_at: "2026-09-07T15:21:07Z",
    error: "Remotion /render failed (500): Render clip count mismatch before asset download: expected 20, received 28.",
    heal: {},
  }, now);
  assert.equal(mismatch.kind, "produce_clip_mismatch");
  assert.equal(mismatch.class, "code_bug");
  assert.equal(mismatch.actor, "desk_agent");
  assert.equal(mismatch.fingerprint, fingerprint("produce_clip_mismatch", "reccEj6eVXPPKalJd", "clip_count_mismatch"));
  assert.equal(errorClassFromText("clip count mismatch before asset download"), "clip_count_mismatch");
});

test("render, orphan, crop, autonomous, and health classifiers", () => {
  const now = Date.parse("2026-09-07T04:00:00Z");
  assert.equal(classifyRenderRow({
    id: "recR1",
    render_status: "Ready for Render",
    remotion_job_id: "",
  }, now).kind, "render_ready_no_job");
  assert.equal(classifyRenderRow({
    id: "recR2",
    render_status: "Rendering",
    remotion_job_id: "job-1",
    final_file_url: "",
    last_modified: "2026-09-07T03:40:00Z",
  }, now).class, "infra_down");
  assert.equal(classifyRenderRow({
    id: "recR3",
    output_status: "In Production",
    remotion_job_id: "",
  }, now).kind, "produce_orphan");
  assert.equal(classifyCropRow({
    id: "recC1",
    transfer_status: "Processing",
    attempt_count: 2,
    last_attempt_at: "2026-09-07T03:57:00Z",
  }, now).kind, "crop_stale");
  assert.equal(classifyCropRow({
    id: "recC2",
    transfer_status: "Error",
    attempt_count: 6,
  }, now).kind, "crop_parked");
  assert.equal(classifyAutonomousRequest({
    status: "Submitted",
    notes: "origin=autonomous cited_trend=Navy Pier",
    job: { request_id: "recA1" },
  }).kind, "autonomous_stalled");
  assert.equal(classifyAutonomousRequest({
    status: "Promoted",
    notes: "origin=autonomous",
    job: { request_id: "recA2" },
  }).kind, "autonomous_produce_gap");
  assert.equal(classifyHealthTarget(
    { id: "pipeline-runner", url: "https://pipeline.chicagoshining.com/health" },
    { ok: false, status: 502 },
  ).class, "infra_down");
  assert.equal(classifyHealthTarget({ id: "pipeline-runner" }, { ok: true }), null);
  assert.equal(classifyHealthTarget(
    { id: "timing-engine", public: false },
    { ok: false, status: 0, error: "Could not resolve host" },
  ), null);
  assert.equal(classifyIntakeResidue({
    id: "driveSmall",
    name: "Lincoln Park Zoo 20.MOV",
    size: 16148070,
  }).kind, "intake_parked");
  assert.equal(classifyIntakeResidue({
    id: "driveProcessed",
    name: "Lincoln Park Zoo 20.MOV",
    size: 16148070,
    existing_media_asset_id: "recMedia1",
    duplicate_reason: "drive_id",
    parents: ["ingestion", "photos"],
  }).kind, "intake_processed_residue");
  assert.equal(classifyIntakeResidue({
    id: "driveHuge",
    name: "Huge.MOV",
    size: 150000000,
  }).kind, "intake_oversize");
  assert.equal(classifyIntakeResidue({
    id: "driveHugeProcessed",
    name: "Huge.MOV",
    size: 150000000,
    existing_media_asset_id: "recOld",
  }).kind, "intake_processed_residue");
});

test("promoted advancement is origin-aware and does not treat Ready for Review as a finding", () => {
  const now = Date.parse("2026-09-07T04:00:00Z");
  assert.equal(originFromNotes("origin=autonomous cited_trend=Navy Pier"), "autonomous");
  assert.equal(classifyPromotedNotRfr({
    status: "Promoted",
    notes: "origin=autonomous",
    requestId: "recA3",
    outputs: [{ id: "out1", output_status: "Ready for Review" }],
    nowMs: now,
  }), null);
  assert.equal(classifyPromotedNotRfr({
    status: "Promoted",
    notes: "origin=autonomous",
    requestId: "recA4",
    outputs: [{
      id: "out2",
      output_status: "In Production",
      last_modified: "2026-09-07T03:00:00Z",
    }],
    nowMs: now,
  }).kind, "promoted_not_rfr");
  assert.equal(classifyPromotedNotRfr({
    status: "Promoted",
    notes: "origin=az-finished-video",
    requestId: "recAz1",
    outputs: [{ id: "out3", output_status: "In Production", last_modified: "2026-09-07T03:00:00Z" }],
    nowMs: now,
  }), null);
  assert.equal(classifyAzNotAutoFinished({
    status: "Promoted",
    notes: "origin=az-finished-video",
    requestId: "recAz2",
    outputs: [{
      id: "azOut",
      output_status: "Ready for Review",
      review_status: "",
      final_file_url: "https://media.example/final.mp4",
      thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
      output_caption: "Navy Pier at dusk",
      studio_output_type: "Reel",
    }],
  }).kind, "az_not_auto_finished");
  assert.equal(classifyAzNotAutoFinished({
    status: "Promoted",
    notes: "origin=az-finished-video",
    requestId: "recAz3",
    outputs: [{
      output_status: "Approved for Publishing",
      review_status: "Approved",
      final_file_url: "https://media.example/final.mp4",
      thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
      output_caption: "caption",
      studio_output_type: "Reel",
    }],
  }), null);
  assert.equal(classifyAutonomousRfrGate({
    notes: "origin=autonomous",
    requestId: "recA5",
    outputs: [{ id: "rfr1", output_status: "Ready for Review" }],
  }), null);
  assert.equal(classifyAutonomousRfrGate({
    notes: "origin=autonomous",
    requestId: "recA6",
    outputs: [{ id: "pub1", output_status: "Published", review_status: "", published_at: "2026-09-07T03:00:00Z" }],
  }).kind, "autonomous_rfr_gate");
  assert.equal(classifyPublishDispatch({
    id: "recP1",
    output_status: "Approved for Publishing",
    platform: "Instagram",
    last_modified: "2026-09-07T03:00:00Z",
  }, now).kind, "publish_never_dispatch");
  assert.equal(classifyPublishDispatch({
    id: "recP2",
    output_status: "Approved for Publishing",
    platform: "TikTok",
    last_modified: "2026-09-07T03:00:00Z",
  }, now), null);
  assert.equal(classifyNativeCover({
    id: "recCvr",
    output_status: "Published",
    platform: "Instagram",
    studio_output_type: "Reel",
    thumbnail_url: "https://drive.google.com/uc?id=abc",
  }).kind, "native_cover_missing");
  assert.equal(classifyNativeCover({
    id: "recCvrOk",
    output_status: "Published",
    platform: "Instagram",
    studio_output_type: "Reel",
    thumbnail_url: "https://media.chicagoshining.com/publish/cover.jpg",
  }), null);
  assert.equal(classifyTesterNightly([], now).kind, "tester_nightly");
  assert.equal(classifyTesterNightly([{
    type: "github_actions",
    created_at: "2026-09-07T03:30:00Z",
    payload: { suite: "Regression suite", conclusion: "success" },
  }], now), null);
  assert.equal(classifyTesterCatalogAssert(), null);
  assert.ok(CLASSIFIER_KINDS.includes("promoted_not_rfr"));
});

test("phase 4 automerge stays gated to allowlisted paths, caps, and mode", () => {
  assert.equal(pathIsAutoMergeAllowlisted("apps/studio-api/desk-inventory.mjs"), true);
  assert.equal(pathIsAutoMergeAllowlisted("apps/studio-web/index.html"), false);
  const caps = parseDeskCaps({ date: "2026-09-07", auto_merges: 0, auto_prs: 1 }, "2026-09-07");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-api/worker.js"],
    caps,
  }).ok, true);
  assert.equal(deskMayAutomerge({
    mode: "patch",
    paths: ["apps/studio-api/worker.js"],
    caps,
  }).reason, "mode_blocks_automerge");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-web/index.html"],
    caps,
  }).reason, "path_not_allowlisted");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-api/worker.js"],
    caps,
    recurring: true,
  }).reason, "recurring_fingerprint");
  const full = parseDeskCaps({ date: "2026-09-07", auto_merges: 1, max_auto_merges_per_day: 1 }, "2026-09-07");
  assert.equal(deskMayAutomerge({
    mode: "automerge",
    paths: ["apps/studio-api/worker.js"],
    caps: full,
  }).reason, "daily_merge_cap");
  assert.equal(deskMayRestart("pipeline-runner", { restarts: { "pipeline-runner": 2 }, max_restarts_per_service_per_day: 2 }).ok, false);
});

test("inventory payload summarizes escalate counts without inventing work", () => {
  const payload = buildDeskInventoryPayload({
    mode: "observe",
    chicagoDate: "2026-09-06",
    chicagoHour: 22,
    incidents: [
      { kind: "produce_escalated", class: "code_bug", fingerprint: "produce_escalated:rec1:heal_exhausted" },
      { kind: "produce_stale", class: "transient", fingerprint: "produce_stale:rec2:timeout" },
    ],
    health: [{ id: "pipeline-runner", ok: true }],
  });
  assert.equal(payload.schema, "studio.desk-inventory.1");
  assert.equal(payload.summary.total, 2);
  assert.equal(payload.summary.counts.produce_escalated, 1);
  assert.equal(payload.summary.needs_desk, true);
  assert.ok(Array.isArray(payload.checks));
  assert.equal(payload.checks.some((row) => row.kind === "produce_escalated" && row.status === "finding"), true);
  assert.equal(summarizeIncidents([]).total, 0);
});
