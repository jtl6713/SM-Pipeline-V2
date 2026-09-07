import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDeskMode,
  deskModeAllows,
  classifyProduceJob,
  classifyRenderRow,
  classifyCropRow,
  classifyAutonomousRequest,
  classifyHealthTarget,
  classifyIntakeResidue,
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
    id: "driveHuge",
    name: "Huge.MOV",
    size: 150000000,
  }), null);
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
  assert.equal(summarizeIncidents([]).total, 0);
});
