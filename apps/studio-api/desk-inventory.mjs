/** Pure classifiers for the autonomous service-desk inventory. No Airtable I/O. */

export const DESK_SCHEMA = "studio.desk-inventory.1";
export const DESK_SETTING_NAME = "STUDIO_DESK_MODE";
export const DESK_CAPS_SETTING_NAME = "STUDIO_DESK_CAPS";
export const DESK_MODES = Object.freeze(["off", "observe", "infra", "patch", "automerge"]);
export const DEFAULT_DESK_MODE = "observe";
export const STALE_PRODUCE_MS = 180000;
export const STALE_RENDER_MINUTES = 15;
export const STALE_CROP_MS = 90000;
export const CROP_PARK_AFTER_ATTEMPTS = 6;

export const DEFAULT_DESK_CAPS = Object.freeze({
  max_auto_prs_per_day: 3,
  max_auto_merges_per_day: 1,
  max_restarts_per_service_per_day: 2,
});

export const AUTO_MERGE_ALLOWLIST = Object.freeze([
  /^apps\/studio-api\/(worker\.js|desk-inventory\.mjs)$/,
  /^apps\/studio-api\/desk-inventory\.test\.mjs$/,
  /^services\/pipeline-runner\/studio_produce\//,
  /^services\/pipeline-runner\/item4\//,
  /^services\/pipeline-runner\/tests\/test_produce_self_heal\.py$/,
]);

export const PUBLIC_HEALTH_TARGETS = Object.freeze([
  { id: "pipeline-runner", url: "https://pipeline.chicagoshining.com/health", local_port: 3350 },
  { id: "remotion-renderer", url: "https://render.chicagoshining.com/health", local_port: 3333 },
  { id: "frame-extractor", url: "https://frames.chicagoshining.com/health", local_port: 3334 },
  { id: "video-compressor", url: "https://compress.chicagoshining.com/health", local_port: 3335 },
  { id: "timing-engine", url: "https://timing.chicagoshining.com/health", local_port: 3336, public: false },
  { id: "watermark", url: "https://watermark.chicagoshining.com/health", local_port: 3011 },
  { id: "voiceover-normalizer", url: "https://voiceover.chicagoshining.com/health", local_port: 3012 },
  { id: "youtube-uploader", url: "https://youtube-upload.chicagoshining.com/health", local_port: 3340 },
]);

const MODE_RANK = Object.freeze({
  off: 0,
  observe: 1,
  infra: 2,
  patch: 3,
  automerge: 4,
});

const ACTION_MIN_MODE = Object.freeze({
  ticket: "observe",
  restart: "infra",
  deploy_local: "infra",
  open_pr: "patch",
  automerge: "automerge",
});

export function parseDeskMode(raw) {
  const mode = String(raw || "").trim().toLowerCase();
  if (!mode) return DEFAULT_DESK_MODE;
  return DESK_MODES.includes(mode) ? mode : DEFAULT_DESK_MODE;
}

export function deskModeAllows(mode, action) {
  const have = MODE_RANK[parseDeskMode(mode)] || 0;
  const need = MODE_RANK[ACTION_MIN_MODE[action]] || 99;
  return have >= need;
}

export function errorClassFromText(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (/(timed?\s*out|timeout|connectionpool|connection reset|502|503|504)/i.test(value)) return "transient_http";
  if (/no_eligible_p2_route/i.test(value)) return "no_eligible_p2_route";
  if (/heal budget|retries exhausted|escalated/i.test(value)) return "heal_exhausted";
  const compact = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return compact || "unknown";
}

export function fingerprint(kind, recordId, errorClass) {
  return [kind, recordId || "-", errorClass || "unknown"].join(":");
}

export function classifyProduceJob(job, nowMs = Date.now(), staleAfterMs = STALE_PRODUCE_MS) {
  if (!job || typeof job !== "object") return null;
  const step = String(job.step || "").trim();
  if (step === "done") return null;
  const recordId = String(job.request_id || job.record_id || "").trim();
  const heal = job.heal && typeof job.heal === "object" ? job.heal : {};
  const resumeCount = Math.max(0, Number(heal.resume_count) || 0);
  const maxResumes = Math.max(1, Number(heal.max_resumes) || 5);
  const error = String(job.error || heal.last_block_error || "");
  const errorClass = errorClassFromText(error || step);
  const updated = Date.parse(String(job.updated_at || ""));
  const stale = !Number.isFinite(updated) || (nowMs - updated) >= staleAfterMs;

  if (step === "escalated" || (step === "blocked" && resumeCount >= maxResumes)) {
    return {
      kind: "produce_escalated",
      class: "code_bug",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_escalated", recordId, errorClass),
      step,
      resume_count: resumeCount,
      error: error || null,
      actor: "desk_agent",
    };
  }
  if (step === "blocked" || stale || !job.job_id) {
    return {
      kind: "produce_stale",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_stale", recordId, errorClass || step || "stale"),
      step: step || "unknown",
      resume_count: resumeCount,
      error: error || null,
      actor: "worker_heal",
    };
  }
  return null;
}

export function classifyRenderRow(row, nowMs = Date.now()) {
  const recordId = String(row?.id || row?.record_id || "").trim();
  const renderStatus = String(row?.render_status || "").trim();
  const jobId = String(row?.remotion_job_id || "").trim();
  const finalUrl = String(row?.final_file_url || "").trim();
  const outputStatus = String(row?.output_status || "").trim();
  const modified = Date.parse(String(row?.last_modified || row?.updated_at || ""));
  const ageMs = Number.isFinite(modified) ? nowMs - modified : Infinity;

  if (renderStatus === "Ready for Render" && !jobId) {
    return {
      kind: "render_ready_no_job",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("render_ready_no_job", recordId, "no_job"),
      actor: "worker_heal",
    };
  }
  if (renderStatus === "Rendering" && jobId && !finalUrl && ageMs >= STALE_RENDER_MINUTES * 60 * 1000) {
    return {
      kind: "render_long",
      class: "infra_down",
      record_id: recordId || null,
      fingerprint: fingerprint("render_long", recordId, "still_rendering"),
      actor: "local_companion",
    };
  }
  if (outputStatus === "In Production" && !jobId && !row?.published_at) {
    return {
      kind: "produce_orphan",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_orphan", recordId, "in_production_no_job"),
      actor: "worker_heal",
    };
  }
  return null;
}

export function classifyCropRow(row, nowMs = Date.now()) {
  const recordId = String(row?.id || "").trim();
  const status = String(row?.transfer_status || "").trim();
  const attempts = Math.max(0, Number(row?.attempt_count) || 0);
  const modified = Date.parse(String(row?.last_attempt_at || row?.updated_at || row?.started_at || ""));
  const ageMs = Number.isFinite(modified) ? nowMs - modified : Infinity;
  if (status === "Error" || (status === "Processing" && attempts >= CROP_PARK_AFTER_ATTEMPTS && ageMs >= STALE_CROP_MS)) {
    return {
      kind: "crop_parked",
      class: "data_repair",
      record_id: recordId || null,
      fingerprint: fingerprint("crop_parked", recordId, "attempts_" + attempts),
      actor: "desk_agent",
    };
  }
  if (status === "Processing" && ageMs >= STALE_CROP_MS) {
    return {
      kind: "crop_stale",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("crop_stale", recordId, "processing"),
      actor: "worker_heal",
    };
  }
  return null;
}

function deskUrlIsPublicPublishCdn(url) {
  return /^https:\/\/media\.chicagoshining\.com\/(publish|studio\/previews)\//i.test(String(url || "").trim());
}

function deskUrlLooksLikeDrive(url) {
  return /drive\.google\.com|docs\.google\.com/i.test(String(url || ""));
}

export function classifyAutonomousTopicCollision(collision) {
  const place = String(collision?.place || "").trim();
  if (!place) return null;
  const extras = Array.isArray(collision?.extras) ? collision.extras.filter(Boolean) : [];
  if (!extras.length) return null;
  const keep = collision?.keep || null;
  const extraId = String(extras[0]?.id || "").trim();
  const slug = place.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "place";
  return {
    kind: "autonomous_topic_collision",
    class: "data_repair",
    record_id: extraId || null,
    fingerprint: fingerprint("autonomous_topic_collision", slug, "same_place"),
    actor: "desk_agent",
    place,
    keep_record_id: String(keep?.id || "").trim() || null,
    keep_title: String(keep?.title || "").trim() || null,
    extra_record_ids: extras.map((row) => String(row?.id || "").trim()).filter(Boolean),
    extra_titles: extras.map((row) => String(row?.title || "").trim()).filter(Boolean),
    diagnosis: `Same-place autonomous harvest leaked on "${place}". Keep ${keep?.title || "the non-autonomous or oldest package"}; do not enqueue or recreate extras. Unpublished origin=autonomous extras may be Cancelled. Do not delete library stills or published posts.`,
  };
}

export function classifyYoutubePrivateSourceFail(row) {
  if (!row || typeof row !== "object") return null;
  const platform = String(row.platform || "").trim();
  if (!/^youtube$/i.test(platform)) return null;
  if (String(row.youtube_video_id || "").trim()) return null;
  const outputStatus = String(row.output_status || "").trim();
  if (outputStatus && outputStatus !== "Approved for Publishing") return null;
  const stage = String(row.youtube_stage || "").trim();
  const publishStatus = String(row.publish_status || "").trim();
  const err = `${row.youtube_error || ""} ${row.publish_error || ""} ${row.publish_error_stage || ""} ${row.publish_asset_error || ""}`;
  const publicSrc = deskUrlIsPublicPublishCdn(row.publish_asset_url) || deskUrlIsPublicPublishCdn(row.studio_preview_url);
  const driveFinal = deskUrlLooksLikeDrive(row.final_file_url);
  const explicit401 = /source download failed 401/i.test(err) || /YTS1_UPLOAD/i.test(String(row.publish_error_stage || ""));
  const ap0Abort = /ap0 worker\/r2 upload failed|connection aborted|10053/i.test(err);
  const publishStuck = !publishStatus || /^(failed|ready to publish)$/i.test(publishStatus);
  const stuckYt1 = /^YT1$/i.test(stage) && driveFinal && !publicSrc && publishStuck;
  const terminal = /^terminal error$/i.test(stage) && (explicit401 || (driveFinal && !publicSrc));
  if (!explicit401 && !stuckYt1 && !terminal && !ap0Abort) return null;
  if (!stuckYt1 && !terminal && ap0Abort && !driveFinal) return null;
  const recordId = String(row.id || row.record_id || "").trim();
  return {
    kind: "youtube_private_source_fail",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("youtube_private_source_fail", recordId, stuckYt1 ? "yt1_drive" : (ap0Abort ? "ap0_abort" : "source_401")),
    actor: "worker_heal",
    diagnosis: "YouTube Approved for Publishing has no video id and no public MP4; Graph/YouTube cannot fetch Drive. Stream the Drive final to publish/ (not a one-shot Windows PUT), clear a stale YouTube_Upload_Job_ID, then pulse YTP1. Keep the native 3D cover; do not send thumb_offset.",
  };
}

export function classifyAutonomousRequest({ status, notes, job, nowMs = Date.now() } = {}) {
  const text = String(notes || "");
  const requestStatus = String(status || "").trim();
  const recordId = String(job?.request_id || "").trim();
  if (text.includes("origin=autonomous")) {
    if (["Draft", "Ready", "Submitted"].includes(requestStatus)) {
      return {
        kind: "autonomous_stalled",
        class: "code_bug",
        record_id: recordId || null,
        fingerprint: fingerprint("autonomous_stalled", recordId, requestStatus.toLowerCase()),
        actor: "desk_agent",
      };
    }
    const step = String(job?.step || "").trim();
    if (requestStatus === "Promoted" && (!job?.job_id || !step || step === "blocked" || step === "escalated")) {
      return {
        kind: "autonomous_produce_gap",
        class: step === "escalated" ? "code_bug" : "transient",
        record_id: recordId || null,
        fingerprint: fingerprint("autonomous_produce_gap", recordId, step || "no_job"),
        actor: step === "escalated" ? "desk_agent" : "worker_heal",
      };
    }
  }
  if (/origin=az-finished-video/i.test(text) && requestStatus && requestStatus !== "Cancelled") {
    const step = String(job?.step || "").trim();
    const updated = Date.parse(String(job?.updated_at || ""));
    const stale = !job || !Number.isFinite(updated) || (nowMs - updated) >= STALE_PRODUCE_MS;
    if (step === "escalated" || (stale && step !== "done")) {
      return {
        kind: "az_stalled",
        class: step === "escalated" ? "code_bug" : "transient",
        record_id: recordId || null,
        fingerprint: fingerprint("az_stalled", recordId, step || requestStatus.toLowerCase()),
        actor: step === "escalated" ? "desk_agent" : "worker_heal",
      };
    }
  }
  return null;
}

export const INTAKE_MAX_FILE_BYTES = 100000000;

export function classifyIntakeResidue(file) {
  const id = String(file?.id || "").trim();
  if (!id) return null;
  const size = Number(file?.size);
  if (Number.isFinite(size) && size > INTAKE_MAX_FILE_BYTES) return null;
  return {
    kind: "intake_parked",
    class: "transient",
    record_id: id,
    fingerprint: fingerprint("intake_parked", id, "ingestion_residue"),
    name: String(file?.name || "").trim() || null,
    actor: "worker_heal",
  };
}

export function classifyHealthTarget(target, probe) {
  if (target?.public === false || probe?.skipped) return null;
  const id = String(target?.id || "service").trim();
  if (probe?.ok) return null;
  const errorClass = errorClassFromText(probe?.error || probe?.status || "down");
  return {
    kind: "health_down",
    class: "infra_down",
    record_id: id,
    fingerprint: fingerprint("health_down", id, errorClass),
    url: target?.url || null,
    local_port: target?.local_port || null,
    error: probe?.error || `HTTP ${probe?.status || "down"}`,
    actor: "local_companion",
  };
}

export function classifyPreparingGap(row) {
  const recordId = String(row?.id || "").trim();
  const status = String(row?.studio_variant_status || "").trim();
  if (status !== "Preparing") return null;
  return {
    kind: "variant_preparing",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("variant_preparing", recordId, "preparing"),
    actor: "worker_heal",
  };
}

export function parseDeskCaps(raw, chicagoDate) {
  const date = String(chicagoDate || "").trim();
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  }
  const src = parsed && typeof parsed === "object" ? parsed : {};
  const sameDay = String(src.date || "") === date;
  return {
    date: date || src.date || "",
    auto_prs: sameDay ? Math.max(0, Number(src.auto_prs) || 0) : 0,
    auto_merges: sameDay ? Math.max(0, Number(src.auto_merges) || 0) : 0,
    restarts: sameDay && src.restarts && typeof src.restarts === "object" ? { ...src.restarts } : {},
    max_auto_prs_per_day: Math.max(0, Number(src.max_auto_prs_per_day) || DEFAULT_DESK_CAPS.max_auto_prs_per_day),
    max_auto_merges_per_day: Math.max(0, Number(src.max_auto_merges_per_day) || DEFAULT_DESK_CAPS.max_auto_merges_per_day),
    max_restarts_per_service_per_day: Math.max(0, Number(src.max_restarts_per_service_per_day) || DEFAULT_DESK_CAPS.max_restarts_per_service_per_day),
  };
}

export function pathIsAutoMergeAllowlisted(path) {
  const rel = String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return AUTO_MERGE_ALLOWLIST.some((rule) => rule.test(rel));
}

export function deskMayAutomerge({ mode, paths = [], caps, recurring = false } = {}) {
  if (recurring) return { ok: false, reason: "recurring_fingerprint" };
  if (!deskModeAllows(mode, "automerge")) return { ok: false, reason: "mode_blocks_automerge" };
  const files = (paths || []).map((p) => String(p || "").replace(/\\/g, "/")).filter(Boolean);
  if (!files.length) return { ok: false, reason: "no_paths" };
  if (files.some((p) => !pathIsAutoMergeAllowlisted(p))) return { ok: false, reason: "path_not_allowlisted" };
  if ((caps?.auto_merges || 0) >= (caps?.max_auto_merges_per_day || DEFAULT_DESK_CAPS.max_auto_merges_per_day)) {
    return { ok: false, reason: "daily_merge_cap" };
  }
  if ((caps?.auto_prs || 0) >= (caps?.max_auto_prs_per_day || DEFAULT_DESK_CAPS.max_auto_prs_per_day)) {
    return { ok: false, reason: "daily_pr_cap" };
  }
  return { ok: true, reason: null };
}

export function deskMayRestart(serviceId, caps) {
  const id = String(serviceId || "").trim();
  const used = Math.max(0, Number(caps?.restarts?.[id]) || 0);
  const max = caps?.max_restarts_per_service_per_day || DEFAULT_DESK_CAPS.max_restarts_per_service_per_day;
  if (used >= max) return { ok: false, reason: "daily_restart_cap" };
  return { ok: true, reason: null };
}

export function summarizeIncidents(incidents) {
  const rows = Array.isArray(incidents) ? incidents.filter(Boolean) : [];
  const counts = {};
  const byClass = {};
  let lastEscalate = null;
  for (const row of rows) {
    counts[row.kind] = (counts[row.kind] || 0) + 1;
    byClass[row.class] = (byClass[row.class] || 0) + 1;
    if (row.kind === "produce_escalated") lastEscalate = row;
  }
  return {
    schema: DESK_SCHEMA,
    total: rows.length,
    counts,
    by_class: byClass,
    last_escalate: lastEscalate,
    needs_desk: rows.some((row) => row.class === "code_bug" || row.class === "infra_down" || row.class === "data_repair"),
  };
}

export function buildDeskInventoryPayload({
  mode,
  chicagoDate,
  chicagoHour,
  incidents,
  health,
  caps,
  generatedAt,
} = {}) {
  const summary = summarizeIncidents(incidents);
  return {
    ok: true,
    schema: DESK_SCHEMA,
    desk_mode: parseDeskMode(mode),
    chicago_date: chicagoDate || null,
    chicago_hour: Number.isFinite(Number(chicagoHour)) ? Number(chicagoHour) : null,
    generated_at: generatedAt || new Date().toISOString(),
    caps: caps || parseDeskCaps({}, chicagoDate),
    summary,
    health: Array.isArray(health) ? health : [],
    incidents: Array.isArray(incidents) ? incidents.filter(Boolean) : [],
  };
}
