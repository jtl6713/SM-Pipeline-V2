/** Pure classifiers for the Quality Agent inventory. No Airtable I/O. */

import { attachQualityChecks, assertQualityCatalog, QUALITY_CHECKS } from "./quality-checks.mjs";
import { buildQualityRecap } from "./quality-recap.mjs";
import { youtubeLooksLikeQuotaOrWrapped403 } from "./youtube-manual-publish.mjs";

export const DESK_SCHEMA = "studio.desk-inventory.1";
export const DESK_SETTING_NAME = "STUDIO_DESK_MODE";
export const DESK_CAPS_SETTING_NAME = "STUDIO_DESK_CAPS";
export const DESK_MODES = Object.freeze(["off", "observe", "infra", "patch", "automerge"]);
export const DEFAULT_DESK_MODE = "observe";
export const STALE_PRODUCE_MS = 180000;
export const STALE_RENDER_MINUTES = 15;
export const STALE_FAILED_MS = 60 * 60 * 1000;
export const STALE_CROP_MS = 90000;
export const CROP_PARK_AFTER_ATTEMPTS = 6;

export const DEFAULT_DESK_CAPS = Object.freeze({
  max_auto_prs_per_day: 3,
  max_auto_merges_per_day: 1,
  max_restarts_per_service_per_day: 2,
});

export const AUTO_MERGE_ALLOWLIST = Object.freeze([
  /^apps\/studio-api\/(worker\.js|desk-inventory\.mjs|quality-checks\.mjs)$/,
  /^apps\/studio-api\/desk-inventory\.test\.mjs$/,
  /^apps\/studio-api\/quality-checks\.test\.mjs$/,
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
  if (/(in_progress|still being processed|still in progress)/i.test(value)) return "in_progress";
  if (/(timed?\s*out|timeout|connectionpool|connection reset|502|503|504)/i.test(value)) return "transient_http";
  if (/(^|[^0-9])401([^0-9]|$)|unauthorized/i.test(value) && !/permission denied/i.test(value)) {
    return "transient_http";
  }
  if (/exit code 1|delayrender|request closed/i.test(value)) return "render_crash";
  if (/clip count mismatch/i.test(value)) return "clip_count_mismatch";
  if (/no studio master photos to crop/i.test(value)) return "missing_masters";
  if (/no platform outputs found/i.test(value)) return "missing_outputs";
  if (/no_eligible_p2_route/i.test(value)) return "no_eligible_p2_route";
  if (/download failed\s+404\s+drive/i.test(value)) return "drive_music_404";
  if (/alt=media/i.test(value) && /404|not found/i.test(value) && /drive/i.test(value)) return "drive_music_404";
  if (/heal budget|retries exhausted|escalated/i.test(value)) return "heal_exhausted";
  const compact = value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return compact || "unknown";
}

export function deskTransientRenderError(text) {
  const value = String(text || "");
  if (/clip count mismatch/i.test(value)) return false;
  if (/missing composition|no clips|invalid props/i.test(value)) return false;
  if (!value.trim()) return true;
  const errorClass = errorClassFromText(value);
  return errorClass === "transient_http"
    || errorClass === "render_crash"
    || /exit code 1|delayrender|request closed|timed?\s*out|timeout|502|503|504|econnreset|connection reset/i.test(value);
}

export function deskTransientPublishError(text) {
  const value = String(text || "");
  if (!value.trim()) return false;
  if (/copyright|permission denied|invalid video|unsupported format|video too long|duplicate/i.test(value)) {
    return false;
  }
  const errorClass = errorClassFromText(value);
  return errorClass === "transient_http"
    || errorClass === "in_progress"
    || /in_progress|still being processed|still in progress|timed?\s*out|timeout|502|503|504|10053|connection aborted|econnreset|capacity|try again|2207082|media upload has failed|(^|[^0-9])401([^0-9]|$)|unauthorized/i.test(value);
}

export function deskPermanentFailedError(text) {
  return /copyright|permission denied|invalid video|unsupported format|video too long|duplicate/i.test(String(text || ""));
}

export function failedAgeMs(row, nowMs = Date.now()) {
  for (const stamp of [row?.last_publish_attempt_at, row?.last_modified, row?.updated_at]) {
    const parsed = Date.parse(String(stamp || ""));
    if (Number.isFinite(parsed)) return Math.max(0, nowMs - parsed);
  }
  return Infinity;
}

export function deskFailedNeedsHeal(row, nowMs = Date.now()) {
  const err = String(row?.publish_error || row?.render_error || row?.error || "");
  if (deskPermanentFailedError(err)) return false;
  if (isDriveMusic404Error(err)) return false;
  if (deskTransientPublishError(err) || deskTransientRenderError(err) || !err.trim()) return true;
  return failedAgeMs(row, nowMs) >= STALE_FAILED_MS;
}

export function fingerprint(kind, recordId, errorClass) {
  return [kind, recordId || "-", errorClass || "unknown"].join(":");
}

function deskIdentityValue(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && String(numeric) === text) return numeric;
  return text;
}

export function deskWorkIdentity(row = {}) {
  const source = row && typeof row === "object" ? row : {};
  const firstOutput = Array.isArray(source.outputs)
    ? source.outputs.find((item) => item && typeof item === "object")
    : null;
  const pick = firstOutput || source;
  const clean = (value) => {
    const text = String(value || "").trim();
    return text || null;
  };
  return {
    output_id: deskIdentityValue(pick.output_id ?? source.output_id),
    output_title: clean(pick.output_title || source.output_title),
    platform: clean(pick.platform || source.platform),
    platform_output_type: clean(
      pick.platform_output_type
      || pick.studio_output_type
      || source.platform_output_type
      || source.studio_output_type
    ),
    content_id: deskIdentityValue(pick.content_id ?? source.content_id),
    content_title: clean(pick.content_title || source.content_title),
    content_item_id: clean(pick.content_item_id || source.content_item_id),
    profile_name: clean(
      pick.profile_name
      || pick.content_profile_name
      || pick.content_profile
      || pick.profile
      || source.profile_name
      || source.content_profile_name
      || source.content_profile
      || source.profile
    ),
    scheduled_post_date: clean(pick.scheduled_post_date || source.scheduled_post_date),
    dispatch_note: clean(pick.dispatch_note || source.dispatch_note || source.studio_publish_dispatch_note),
    dispatch_count: deskIdentityValue(pick.dispatch_count ?? source.dispatch_count ?? source.studio_publish_dispatch_count),
  };
}

export function withDeskIdentity(incident, row) {
  if (!incident) return incident;
  const next = { ...incident };
  for (const [key, value] of Object.entries(deskWorkIdentity(row))) {
    if (value != null && value !== "") next[key] = value;
  }
  return next;
}

export function extractDriveMusic404FileId(text) {
  const value = String(text || "");
  if (!/404|not found/i.test(value)) return "";
  const remotion = value.match(/Download failed\s+404\s+Drive\s+([A-Za-z0-9_-]{10,})/i);
  if (remotion?.[1]) return remotion[1];
  const api = value.match(/\/drive\/v3\/files\/([A-Za-z0-9_-]{10,})/i);
  if (api?.[1]) return api[1];
  const queryId = value.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  if (queryId?.[1] && /drive\.google/i.test(value)) return queryId[1];
  return "";
}

export function isDriveMusic404Error(text) {
  const value = String(text || "");
  if (!/404|not found/i.test(value)) return false;
  if (/Download failed\s+404\s+Drive/i.test(value)) return true;
  if (/alt=media/i.test(value) && /drive\.google|googleapis\.com\/drive/i.test(value)) return true;
  if (/music/i.test(value) && /drive/i.test(value) && /not found|404/i.test(value)) return true;
  return Boolean(extractDriveMusic404FileId(value));
}

function driveMusic404Incident(recordId, error, row) {
  const fileId = extractDriveMusic404FileId(error) || "missing_file";
  return withDeskIdentity({
    kind: "drive_music_404",
    class: "data_repair",
    record_id: recordId || null,
    fingerprint: fingerprint("drive_music_404", recordId, fileId),
    actor: "desk_agent",
    error: error || null,
    diagnosis: "Library music Drive file is deleted (Remotion Download failed 404 Drive <id>, or T1 Drive alt=media 404). "
      + "Worker resume cannot restore the file. Find a live Assets/Music copy of the same track, retarget the Media Asset "
      + "Google Drive File ID + URL, Content Item Music File ID + Music URL, and sibling Platform Output Music_URLs, "
      + "reset produce heal resume_count, then resume studio-produce. Do not Approve publish. "
      + "Proven: Content 298 Huntington Beach / recrbAqjeyGcERgdf / 11XdsaVu9EB9p_H5y-Q1n1MEPa2ZMr11t → love_nwantiti.mp3 1hADVgqH1x5TyPUPea5jruEIVUe45__ew.",
  }, row);
}

export function deskRecoverableEscalatedError(text) {
  const value = String(text || "");
  if (/clip count mismatch/i.test(value)) return false;
  if (/missing composition|no clips|invalid props/i.test(value)) return false;
  if (isDriveMusic404Error(value)) return false;
  const errorClass = errorClassFromText(value);
  if (errorClass === "clip_count_mismatch") return false;
  return errorClass === "transient_http"
    || errorClass === "render_crash"
    || errorClass === "in_progress"
    || errorClass === "heal_exhausted"
    || errorClass === "missing_masters"
    || errorClass === "missing_outputs"
    || deskTransientRenderError(value)
    || deskTransientPublishError(value)
    || /retries exhausted|produce retries exhausted/i.test(value);
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

  // Deleted library music. Worker resume cannot restore Drive pixels.
  if (isDriveMusic404Error(error) && (step === "blocked" || step === "escalated" || stale)) {
    return driveMusic404Incident(recordId, error, job);
  }

  // Remotion expectedClipCount vs clips.length. Worker heal retries cannot fix this.
  if (errorClass === "clip_count_mismatch" && (step === "blocked" || step === "escalated")) {
    return withDeskIdentity({
      kind: "produce_clip_mismatch",
      class: "code_bug",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_clip_mismatch", recordId, errorClass),
      step,
      resume_count: resumeCount,
      error: error || null,
      actor: "desk_agent",
    }, job);
  }

  if (step === "escalated" || (step === "blocked" && resumeCount >= maxResumes)) {
    const recoverable = deskRecoverableEscalatedError(error || step);
    return withDeskIdentity({
      kind: "produce_escalated",
      class: recoverable ? "transient" : "code_bug",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_escalated", recordId, errorClass),
      step,
      resume_count: resumeCount,
      error: error || null,
      actor: recoverable ? "worker_heal" : "desk_agent",
      diagnosis: recoverable
        ? "Produce parked Escalated after the heal budget. Worker rematches missing masters when needed, resets resume_count, and resumes studio-produce."
        : "Produce escalated with a non-retryable payload error. Desk must fix the job before resume.",
    }, job);
  }
  if (step === "blocked" || stale || !job.job_id) {
    return withDeskIdentity({
      kind: "produce_stale",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_stale", recordId, errorClass || step || "stale"),
      step: step || "unknown",
      resume_count: resumeCount,
      error: error || null,
      actor: "worker_heal",
    }, job);
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
  const renderClipList = String(row?.render_clip_list_json || "");
  const remotionProps = String(row?.remotion_props_json || "");
  const renderErrorText = String(
    row?.render_error || row?.timing_error || row?.music_error || row?.error || ""
  );
  if (
    isDriveMusic404Error(renderErrorText)
    && ["Blocked", "Ready for Render", "Rendering", "Failed"].includes(renderStatus)
  ) {
    return driveMusic404Incident(recordId, renderErrorText, row);
  }
  // Output 2156: VO 35.76s vs render 35.70s (1071 frames). R4 parked Blocked;
  // Worker / R4 extend the last clip to ceil(VO×fps) and requeue.
  if (
    renderStatus === "Blocked"
    && /Spoken audio must never run past the video end/i.test(renderErrorText)
  ) {
    return withDeskIdentity({
      kind: "voiceover_exceeds_render",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("voiceover_exceeds_render", recordId, "spoken_past_end"),
      actor: "worker_heal",
      diagnosis: "Render_Status=Blocked because measured voiceover is longer than the stamped render duration "
        + "(often by a few frames after round(VO×fps)). Worker extends the last clip to ceil(VO×fps), "
        + "clears Remotion_Error_Message, sets Ready for Render, and pulses R4. Do not Approve.",
    }, row);
  }
  const privateDriveWatermark = /"watermarkUrl"\s*:\s*"https?:\/\/(?:drive|docs)\.google\.com/i.test(remotionProps)
    || /PRIVATE_DRIVE_WATERMARK/i.test(renderErrorText)
    || (/watermark/i.test(renderErrorText) && /drive\.google\.com|ERR_BLOCKED_BY_ORB|HTTP status code:\s*403/i.test(renderErrorText));
  if (
    privateDriveWatermark
    && ["Blocked", "Ready for Render", "Rendering", "Failed"].includes(renderStatus)
  ) {
    return withDeskIdentity({
      kind: "render_private_drive_watermark",
      class: "data_repair",
      record_id: recordId || null,
      fingerprint: fingerprint("render_private_drive_watermark", recordId, "drive_403_or_orb"),
      actor: "worker_heal",
      diagnosis: "Remotion received the ChicagoShining watermark as a private Google Drive URL. Chromium can return HTTP 403 / ERR_BLOCKED_BY_ORB. "
        + "Keep the output parked until the renderer advertises privateDriveImageLocalization + watermarkLocalization, then clear the stale render job and requeue R4. "
        + "The renderer must fetch the watermark through the authenticated Pipeline Runner and render from its local copy.",
    }, row);
  }
  if (
    renderClipList.includes("/api/media-assets/")
    && ["Ready for Render", "Rendering", "Failed"].includes(renderStatus)
  ) {
    return withDeskIdentity({
      kind: "render_unfetchable_source",
      class: "data_repair",
      record_id: recordId || null,
      fingerprint: fingerprint("render_unfetchable_source", recordId, "studio_relative_media_url"),
      actor: "worker_heal",
      diagnosis: "Render_Clip_List_JSON contains a Studio-only /api/media-assets/.../stream URL. "
        + "The remote Remotion renderer cannot fetch that path. Resolve the linked Media Asset to its Google Drive URL, "
        + "persist the repaired manifest, clear the stale Remotion job, and pulse R4.",
    }, row);
  }

  if (renderStatus === "Failed") {
    const err = String(row?.render_error || row?.error || "");
    const heal = deskFailedNeedsHeal({ render_error: err, last_modified: row?.last_modified, updated_at: row?.updated_at }, nowMs);
    const errorClass = heal && failedAgeMs(row, nowMs) >= STALE_FAILED_MS && !deskTransientRenderError(err) && err.trim()
      ? "stale_failed"
      : errorClassFromText(err || "render_failed");
    return withDeskIdentity({
      kind: "render_failed",
      class: heal ? "transient" : "code_bug",
      record_id: recordId || null,
      fingerprint: fingerprint("render_failed", recordId, errorClass),
      actor: heal ? "worker_heal" : "desk_agent",
      diagnosis: heal
        ? "Render_Status=Failed (transient crash, or Failed for more than an hour). Worker requeues Ready for Render and pulses R4."
        : "Render_Status=Failed with a non-retryable error. Desk must fix the payload before requeue.",
    }, row);
  }
  if (renderStatus === "Ready to Render" && !jobId) {
    // Orphan choice next to "Ready for Render". R4/T1 formulas never match it.
    return withDeskIdentity({
      kind: "render_ready_status_typo",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("render_ready_status_typo", recordId, "ready_to_render"),
      actor: "worker_heal",
      diagnosis: "Render_Status is the orphan choice \"Ready to Render\" (slideshow wording) instead of \"Ready for Render\". "
        + "R4/T1 selectors never match, so Remotion never starts. Worker rewrites Ready for Render then pulses R4.",
    }, row);
  }
  if (renderStatus === "Ready for Render" && !jobId && row?.voiceover_required && !String(row?.voiceover_url || "").trim()) {
    // R4 returns waiting_for_voiceover on every pulse; re-pulsing R4 cannot heal it.
    // Worker copies the parent voiceover down or re-arms the P2 selector and resumes produce at audio.
    return withDeskIdentity({
      kind: "render_ready_waiting_voiceover",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("render_ready_waiting_voiceover", recordId, "no_voiceover_url"),
      actor: "worker_heal",
      diagnosis: "Ready for Render with no Remotion job; output wants narration but Voiceover_URL is blank. "
        + "Check parent Content_Status (P2 needs \"Ready for Voiceover\"; \"Thumbnail Ready\" switches P2 off) and Voiceover_Status.",
    }, row);
  }
  if (renderStatus === "Ready for Render" && !jobId) {
    return withDeskIdentity({
      kind: "render_ready_no_job",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("render_ready_no_job", recordId, "no_job"),
      actor: "worker_heal",
    }, row);
  }
  // Output 1807 YouTube Short / Content 374: Final_File_URL present, siblings
  // already Rendered, but this row stayed Render_Status=Rendering /
  // Output_Status=In Production with Review_Status=Review Sent. UI Approve (1)
  // lights from Review Sent + file; Worker approve rejects In Production/Rendering.
  if (
    renderStatus === "Rendering"
    && finalUrl
    && !row?.published_at
    && (outputStatus === "In Production" || outputStatus === "Rendering"
      || String(row?.review_status || "").trim() === "Review Sent")
  ) {
    return withDeskIdentity({
      kind: "render_stale_rendering",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("render_stale_rendering", recordId, "final_file_present"),
      actor: "worker_heal",
      diagnosis: "Render_Status=Rendering with Final_File_URL already set (often Remotion_Job_ID blank). "
        + "Worker promotes Render_Status=Rendered and Output_Status=Ready for Review. Do not Approve until Ready for Review. "
        + "Proven: Output 1807 / Content 374 South Beach Getting Around / rec0mwr0QiudNSQrn.",
    }, row);
  }
  if (renderStatus === "Rendering" && jobId && !finalUrl && ageMs >= STALE_RENDER_MINUTES * 60 * 1000) {
    return withDeskIdentity({
      kind: "render_long",
      class: "infra_down",
      record_id: recordId || null,
      fingerprint: fingerprint("render_long", recordId, "still_rendering"),
      actor: "local_companion",
    }, row);
  }
  if (outputStatus === "In Production" && !jobId && !row?.published_at && !finalUrl) {
    return withDeskIdentity({
      kind: "produce_orphan",
      class: "transient",
      record_id: recordId || null,
      fingerprint: fingerprint("produce_orphan", recordId, "in_production_no_job"),
      actor: "worker_heal",
    }, row);
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

export function classifyYoutubeCoverQuota(row) {
  if (String(row?.platform || "").trim() !== "YouTube") return null;
  if (row?.published_at || /published/i.test(String(row?.publish_status || "")) || /published/i.test(String(row?.output_status || ""))) {
    return null;
  }
  const videoId = String(row?.youtube_video_id || "").trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const stage = String(row?.publish_error_stage || "").trim();
  if (!youtubeLooksLikeQuotaOrWrapped403({
    Platform: "YouTube",
    Publish_Error_Stage: stage,
    Publish_Error_Message: row?.publish_error,
    YouTube_Error_Message: row?.youtube_error,
  })) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  return withDeskIdentity({
    kind: "youtube_cover_quota",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("youtube_cover_quota", recordId, "quota"),
    actor: "worker_heal",
    youtube_video_id: videoId,
    diagnosis: "YouTube Short already uploaded (video id present). YTS2 hit daily quota on poll or thumbnails.set. Studio paints Manual Action Required, but the operator has nothing to do. Do not re-upload. Worker parks until Pacific midnight, then pulses YTS2 only. Proven: Output 1001 / CI 227 / recbvjtX95IioyxOi / EwRNnNZO0Xc. Same class: Output 994 / JL2sm6Zy1YY.",
  }, row);
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
  return withDeskIdentity({
    kind: "youtube_private_source_fail",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("youtube_private_source_fail", recordId, stuckYt1 ? "yt1_drive" : (ap0Abort ? "ap0_abort" : "source_401")),
    actor: "worker_heal",
    diagnosis: "YouTube Approved for Publishing has no video id and no public MP4; Graph/YouTube cannot fetch Drive. Stream the Drive final to publish/ (not a one-shot Windows PUT), clear a stale YouTube_Upload_Job_ID, then pulse YTP1. Keep the native 3D cover; do not send thumb_offset.",
  }, row);
}

export function classifyAutonomousRequest({ status, notes, job, nowMs = Date.now() } = {}) {
  const text = String(notes || "");
  const requestStatus = String(status || "").trim();
  const recordId = String(job?.request_id || "").trim();
  if (text.includes("origin=autonomous")) {
    if (["Draft", "Ready", "Submitted"].includes(requestStatus)) {
      return withDeskIdentity({
        kind: "autonomous_stalled",
        class: "code_bug",
        record_id: recordId || null,
        fingerprint: fingerprint("autonomous_stalled", recordId, requestStatus.toLowerCase()),
        actor: "desk_agent",
      }, job);
    }
    const step = String(job?.step || "").trim();
    if (requestStatus === "Promoted" && (!job?.job_id || !step || step === "blocked" || step === "escalated")) {
      const recoverable = step !== "escalated" || deskRecoverableEscalatedError(job?.error || step);
      return withDeskIdentity({
        kind: "autonomous_produce_gap",
        class: recoverable ? "transient" : "code_bug",
        record_id: recordId || null,
        fingerprint: fingerprint("autonomous_produce_gap", recordId, step || "no_job"),
        actor: recoverable ? "worker_heal" : "desk_agent",
      }, job);
    }
  }
  if (/origin=az-finished-video/i.test(text) && requestStatus && requestStatus !== "Cancelled") {
    const step = String(job?.step || "").trim();
    const updated = Date.parse(String(job?.updated_at || ""));
    const stale = !job || !Number.isFinite(updated) || (nowMs - updated) >= STALE_PRODUCE_MS;
    if (step === "escalated" || (stale && step !== "done")) {
      const recoverable = step !== "escalated" || deskRecoverableEscalatedError(job?.error || step);
      return withDeskIdentity({
        kind: "az_stalled",
        class: recoverable ? "transient" : "code_bug",
        record_id: recordId || null,
        fingerprint: fingerprint("az_stalled", recordId, step || requestStatus.toLowerCase()),
        actor: recoverable ? "worker_heal" : "desk_agent",
      }, job);
    }
  }
  return null;
}

export const INTAKE_MAX_FILE_BYTES = 100000000;
export const TESTER_NIGHTLY_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export function originFromNotes(notes) {
  const text = String(notes || "");
  if (/origin=az-finished-video/i.test(text)) return "az-finished-video";
  if (text.includes("origin=autonomous")) return "autonomous";
  return "other";
}

function outputAgeMs(row, nowMs) {
  const modified = Date.parse(String(row?.last_modified || row?.updated_at || ""));
  return Number.isFinite(modified) ? nowMs - modified : Infinity;
}

function isStoryOutput(row) {
  return /story/i.test(String(row?.output_type || row?.studio_output_type || row?.platform_output_type || ""));
}

function outputPastReview(row) {
  const status = String(row?.output_status || "").trim();
  const review = String(row?.review_status || "").trim();
  const publish = String(row?.publish_status || "").trim();
  if (review === "Approved" || status === "Approved for Publishing") return true;
  if (["Published", "Publishing", "Scheduled"].includes(status) || ["Published", "Publishing", "Scheduled"].includes(publish)) return true;
  return Boolean(row?.published_at);
}

export function classifyIntakeResidue(file) {
  const id = String(file?.id || "").trim();
  if (!id) return null;
  const size = Number(file?.size);
  const oversized = Number.isFinite(size) && size > INTAKE_MAX_FILE_BYTES;
  const existingId = String(file?.existing_media_asset_id || "").trim();
  const reason = String(file?.duplicate_reason || "").trim();
  if (existingId) {
    return {
      kind: "intake_processed_residue",
      class: "transient",
      record_id: id,
      fingerprint: fingerprint("intake_processed_residue", id, reason || "already_processed"),
      name: String(file?.name || "").trim() || null,
      existing_media_asset_id: existingId,
      duplicate_reason: reason || null,
      parents: Array.isArray(file?.parents) ? file.parents : [],
      actor: "worker_heal",
    };
  }
  if (oversized) {
    return {
      kind: "intake_oversize",
      class: "transient",
      record_id: id,
      fingerprint: fingerprint("intake_oversize", id, "waiting_compress"),
      name: String(file?.name || "").trim() || null,
      actor: "worker_heal",
    };
  }
  return {
    kind: "intake_parked",
    class: "transient",
    record_id: id,
    fingerprint: fingerprint("intake_parked", id, "ingestion_residue"),
    name: String(file?.name || "").trim() || null,
    actor: "worker_heal",
  };
}

export function classifyPromotedNotRfr({ status, notes, outputs = [], requestId, nowMs = Date.now() } = {}) {
  if (String(status || "").trim() !== "Promoted") return null;
  const origin = originFromNotes(notes);
  if (origin === "az-finished-video") return null;
  const rows = Array.isArray(outputs) ? outputs : [];
  const stuck = rows.filter((row) => {
    const outputStatus = String(row?.output_status || "").trim();
    if (outputStatus === "Ready for Review" || outputPastReview(row)) return false;
    if (outputStatus === "In Production") return outputAgeMs(row, nowMs) >= STALE_RENDER_MINUTES * 60 * 1000;
    const missingDeliverable = !String(row?.final_file_url || "").trim() && !String(row?.thumbnail_url || "").trim();
    return missingDeliverable && outputAgeMs(row, nowMs) >= STALE_RENDER_MINUTES * 60 * 1000;
  });
  if (!stuck.length) return null;
  const recordId = String(requestId || stuck[0]?.request_id || stuck[0]?.id || "").trim();
  return withDeskIdentity({
    kind: "promoted_not_rfr",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("promoted_not_rfr", recordId, origin || "in_production"),
    origin,
    actor: "worker_heal",
  }, stuck[0]);
}

export function classifyAzNotAutoFinished({ status, notes, outputs = [], requestId } = {}) {
  if (originFromNotes(notes) !== "az-finished-video") return null;
  if (String(status || "").trim() !== "Promoted") return null;
  const rows = Array.isArray(outputs) ? outputs : [];
  const mains = rows.filter((row) => !isStoryOutput(row));
  const ready = (mains.length ? mains : rows).filter((row) => {
    const finalUrl = String(row?.final_file_url || "").trim();
    const caption = String(row?.output_caption || "").trim();
    const thumb = String(row?.thumbnail_url || "").trim();
    return Boolean(finalUrl && caption && (isStoryOutput(row) || thumb));
  });
  if (!ready.length) return null;
  if (ready.every(outputPastReview)) return null;
  const recordId = String(requestId || "").trim();
  return withDeskIdentity({
    kind: "az_not_auto_finished",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("az_not_auto_finished", recordId, "ready_not_queued"),
    actor: "worker_heal",
  }, ready[0]);
}

export function classifyAutonomousRfrGate({ notes, outputs = [], requestId } = {}) {
  if (originFromNotes(notes) !== "autonomous") return null;
  const leaked = (Array.isArray(outputs) ? outputs : []).filter((row) => {
    const status = String(row?.output_status || "").trim();
    const publish = String(row?.publish_status || "").trim();
    const review = String(row?.review_status || "").trim();
    if (status === "Ready for Review") return false;
    const published = status === "Published" || ["Published", "Publishing"].includes(publish) || Boolean(row?.published_at);
    if (published && review !== "Approved") return true;
    if (status === "Approved for Publishing" && review !== "Approved") return true;
    return false;
  });
  if (!leaked.length) return null;
  const recordId = String(requestId || leaked[0]?.id || "").trim();
  return withDeskIdentity({
    kind: "autonomous_rfr_gate",
    class: "code_bug",
    record_id: recordId || null,
    fingerprint: fingerprint("autonomous_rfr_gate", recordId, "auto_published"),
    actor: "desk_agent",
  }, leaked[0]);
}

export function isTikTokAuthSignatureFailure(row) {
  const platform = String(row?.platform || "").trim();
  if (platform !== "TikTok") return false;
  const draft = String(row?.tiktok_draft_status || "").trim();
  const error = String(row?.publish_error || "").trim();
  if (draft === "Manual Fallback") {
    return /(^|[^0-9])401([^0-9]|$)|unauthorized|authentication failure/i.test(error) || !error;
  }
  return /(^|[^0-9])401([^0-9]|$)|unauthorized|authentication failure/i.test(error)
    && /TTD1|tiktok.*(draft|init)|photo draft|video draft/i.test(`${error} ${row?.publish_error_stage || ""}`);
}

export function classifyTikTokAuthSignature(row) {
  if (row?.published_at) return null;
  if (!isTikTokAuthSignatureFailure(row)) return null;
  const publish = String(row?.publish_status || "").trim();
  const outputStatus = String(row?.output_status || "").trim();
  const draft = String(row?.tiktok_draft_status || "").trim();
  const failed = publish === "Failed" || outputStatus === "Failed" || draft === "Manual Fallback";
  if (!failed) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  return withDeskIdentity({
    kind: "tiktok_auth_signature",
    class: "code_bug",
    record_id: recordId || null,
    fingerprint: fingerprint("tiktok_auth_signature", recordId, "pipeline_secret"),
    actor: "desk_agent",
    diagnosis: "TikTok auth Worker rejected X-Pipeline-Secret (HTTP 401 / Manual Fallback). Worker cron must not unbounded-retry. Quality Agent checks the city auth Worker for PIPELINE_SECRET_SHA256 fingerprint alignment (LA/NYC/Miami), ensures LA_TIKTOK_PIPELINE_SECRET (or city secret) matches the established pipeline secret, deploys the auth Worker if needed, then rearms TikTok_Draft_Status=Ready for Delivery once and republishes. Proven: Output 908 Miami Vizcaya; Outputs 889/937/963 LA Beverly Hills / Venice / Muscle Beach.",
  }, row);
}

export function isIgCarouselTooManyChildren(row) {
  const platform = String(row?.platform || "").trim();
  if (platform !== "Instagram") return false;
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""}`;
  if (!/carousel/i.test(type)) return false;
  if (row?.published_at || String(row?.ig_carousel_status || "").trim() === "Published") return false;
  const err = `${row?.ig_carousel_error || row?.publish_error || ""}`;
  const stage = `${row?.ig_carousel_error_stage || row?.publish_error_stage || ""}`;
  const count = Number(row?.ig_carousel_child_count || row?.image_count || 0) || 0;
  if (/too little or too many attachments/i.test(err)) return true;
  if (count > 10 && /AP3C/i.test(stage)) return true;
  if (count > 10 && String(row?.ig_carousel_status || "").trim() === "Children Ready") return true;
  return false;
}

export function classifyIgCarouselTooManyChildren(row) {
  if (row?.published_at) return null;
  if (!isIgCarouselTooManyChildren(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const count = Number(row?.ig_carousel_child_count || row?.image_count || 0) || "unknown";
  return withDeskIdentity({
    kind: "ig_carousel_too_many_children",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("ig_carousel_too_many_children", recordId, String(count)),
    actor: "worker_heal",
    diagnosis: "Instagram Graph carousel parent (AP3C) rejected the package: (#100) too little or too many attachments. Graph allows 2–10 children; this output has more than 10 FINISHED children (cover may be slide 1). Facebook planning already clamps Image_Count to 10; IG carousel stamp/AP3C must clamp too. Worker heal stamps IG_Carousel_Child_Count=Image_Count=10, clears the AP3C error, and re-pulses AP3C; AP3C keeps cover/order-1 and the next 9 child container IDs. Proven: Output 1235 / Millennium Park Fewer Crowds / recVphOmGqaxIYHSD (12 children).",
  }, row);
}


export function isIgCarouselChildVerificationRace(row) {
  const platform = String(row?.platform || "").trim();
  if (platform !== "Instagram") return false;
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""}`;
  if (!/carousel/i.test(type)) return false;
  if (row?.published_at || String(row?.ig_carousel_status || "").trim() === "Published") return false;
  const err = String(row?.ig_carousel_error || row?.publish_error || "");
  const stage = String(row?.ig_carousel_error_stage || row?.publish_error_stage || "");
  return /AP1C child-ID verification mismatch\.\s*Created\/retained:\s*\d+;\s*expected:\s*\d+/i.test(err)
    && /AP1C/i.test(stage || "AP1C");
}

export function classifyIgCarouselChildVerificationRace(row) {
  if (!isIgCarouselChildVerificationRace(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const err = String(row?.ig_carousel_error || row?.publish_error || "");
  const match = err.match(/Created\/retained:\s*(\d+);\s*expected:\s*(\d+)/i);
  const created = match ? Number(match[1]) : null;
  const expected = match ? Number(match[2]) : null;
  return withDeskIdentity({
    kind: "ig_carousel_child_verification_race",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("ig_carousel_child_verification_race", recordId, `${created ?? "x"}_of_${expected ?? "x"}`),
    actor: "worker_heal",
    diagnosis: "AP1C created Instagram child containers, then its immediate Airtable verification read saw fewer child IDs than expected. Verify the first expected (max 10) linked carousel slides. If all required IG_Child_Container_ID values exist, preserve them, clear the stale AP1C error/locks, set IG_Carousel_Status=Children Processing, mark AP1C complete, and pulse AP2C. Only rerun AP1C once when a required child ID is genuinely missing. Proven: NYC Output 1298 / Rainy Day Museum Mile (9 observed immediately, all 10 IDs present moments later).",
    observed_child_count: created,
    expected_child_count: expected,
  }, row);
}


export function isIgCarouselChildPollFailure(row) {
  const platform = String(row?.platform || "").trim();
  if (platform !== "Instagram") return false;
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""}`;
  if (!/carousel/i.test(type)) return false;
  if (row?.published_at || String(row?.ig_carousel_status || "").trim() === "Published") return false;
  const err = String(row?.ig_carousel_error || row?.publish_error || "");
  return /AP2C verified terminal child failure or poll timeout|AP2C verified child-count mismatch/i.test(err);
}

export function classifyIgCarouselChildPollFailure(row) {
  if (!isIgCarouselChildPollFailure(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const err = String(row?.ig_carousel_error || row?.publish_error || "");
  const counts = err.match(/Finished:\s*(\d+);\s*terminal:\s*(\d+);\s*max attempts:\s*(\d+)/i);
  return withDeskIdentity({
    kind: "ig_carousel_child_poll_failure",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("ig_carousel_child_poll_failure", recordId, counts ? `${counts[1]}_finished_${counts[2]}_terminal` : "child_count_mismatch"),
    actor: "worker_heal",
    diagnosis: "AP2C reported a terminal child or timeout. Inspect only the first expected Instagram children in Current Order and ignore deleted/overflow slides. If every required child ID exists and none is terminal, clear the stale AP2C error, keep Children Processing, and pulse AP2C. If a required child is genuinely ERROR/EXPIRED or missing, return the parent to Assets Ready and rerun AP1C once. Timeout is based on unfinished required children only; FINISHED siblings must not exhaust the poll budget. Proven: NYC Output 1298 / Rainy Day Museum Mile.",
    finished_child_count: counts ? Number(counts[1]) : null,
    terminal_child_count: counts ? Number(counts[2]) : null,
    max_attempts: counts ? Number(counts[3]) : null,
  }, row);
}


export function isIgCarouselRateLimited(row) {
  const platform = String(row?.platform || "").trim();
  if (platform !== "Instagram") return false;
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""}`;
  if (!/carousel/i.test(type)) return false;
  if (row?.published_at || String(row?.ig_carousel_status || "").trim() === "Published") return false;
  const err = String(row?.ig_carousel_error || row?.publish_error || "");
  return /user is performing too many actions|rate limit|request limit/i.test(err);
}

export function classifyIgCarouselRateLimited(row) {
  if (!isIgCarouselRateLimited(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  return withDeskIdentity({
    kind: "ig_carousel_rate_limited",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("ig_carousel_rate_limited", recordId, "meta_actions"),
    actor: "worker_heal",
    diagnosis: "Meta throttled AP1C child creation. Do not recreate healthy child containers. Preserve every required child ID that is not ERROR/EXPIRED, back off at least 30 minutes, then create only missing/terminal children. AP1C must honor IG_Carousel_Next_Retry_At before trying again. Proven: NYC Output 1298 / Rainy Day Museum Mile.",
  }, row);
}

export function classifyPublishFailed(row, nowMs = Date.now()) {
  if (row?.published_at) return null;
  if (classifyTikTokAuthSignature(row)) return null;
  if (classifyIgCarouselTooManyChildren(row)) return null;
  if (classifyIgCarouselChildVerificationRace(row)) return null;
  if (classifyIgCarouselChildPollFailure(row)) return null;
  if (classifyIgCarouselRateLimited(row)) return null;
  const outputStatus = String(row?.output_status || "").trim();
  const publish = String(row?.publish_status || "").trim();
  if (outputStatus && !["Approved for Publishing", "Failed"].includes(outputStatus)) return null;
  const error = String(row?.publish_error || "").trim();
  const failed = publish === "Failed" || outputStatus === "Failed";
  const retryableReady = publish === "Ready to Publish" && (Boolean(row?.publish_retry_eligible) || Boolean(error));
  if (!failed && !retryableReady) return null;
  if (!error && !failed) return null;
  const heal = deskFailedNeedsHeal({
    publish_error: error,
    last_publish_attempt_at: row?.last_publish_attempt_at,
    last_modified: row?.last_modified,
    updated_at: row?.updated_at,
  }, nowMs) || (failed && !error);
  const recordId = String(row?.id || row?.record_id || "").trim();
  const stale = failedAgeMs(row, nowMs) >= STALE_FAILED_MS;
  const errorClass = heal && stale && error && !deskTransientPublishError(error)
    ? "stale_failed"
    : errorClassFromText(error || "publish_failed");
  return withDeskIdentity({
    kind: "publish_failed_transient",
    class: heal ? "transient" : "code_bug",
    record_id: recordId || null,
    fingerprint: fingerprint("publish_failed_transient", recordId, errorClass),
    actor: heal ? "worker_heal" : "desk_agent",
    diagnosis: heal
      ? "Publish is Failed (retryable error such as Instagram IN_PROGRESS / HTTP 401 on Graph, or Failed for more than an hour). Worker requeues Ready to Publish and pulses the publisher. TikTok auth-worker 401 / Manual Fallback is classified separately as tiktok_auth_signature. Do not Approve again."
      : "Publish Failed with a non-retryable platform error. Desk must fix the asset or Graph settings before retry.",
  }, row);
}

export const PUBLISH_DISPATCH_GRACE_MS = 120000;
export const PUBLISH_DISPATCH_KICK_CAP = 3;

export function deskPublishIsDue(row, nowMs = Date.now(), graceMs = PUBLISH_DISPATCH_GRACE_MS) {
  const raw = String(row?.scheduled_post_date || "").trim();
  if (!raw) return true;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return true;
  return ms <= nowMs + graceMs;
}

export function deskPublishDispatchBlocker(row, nowMs = Date.now()) {
  const publish = String(row?.publish_status || "").trim();
  const error = String(row?.publish_error || "").trim();
  const note = String(row?.dispatch_note || row?.studio_publish_dispatch_note || "").trim();
  const text = `${publish} ${error} ${note}`;
  const count = Math.max(0, Number(row?.dispatch_count || row?.studio_publish_dispatch_count) || 0);
  if (/manual publish required/i.test(publish) || /quota exhausted/i.test(text)) return "youtube_quota";
  if (/thumbnail/i.test(error) && /youtube/i.test(String(row?.platform || ""))) return "youtube_thumbnail";
  if (!deskPublishIsDue(row, nowMs)) return "scheduled_hold";
  if (row?.auto_publish_enabled === false) return "auto_publish_off";
  if (/skipped:\s*(no-dispatch|missing-|no-final|no-webhook|missing-cdn|missing-public)/i.test(note)) {
    return "missing_asset";
  }
  if (count >= PUBLISH_DISPATCH_KICK_CAP) return "dispatch_exhausted";
  if (/skipped:/i.test(note) && !/skipped:\s*scheduled-hold|held until/i.test(note)) return "dispatch_skipped";
  return "never_attempted";
}

function publishDispatchDiagnosis(blocker, row) {
  const note = String(row?.dispatch_note || row?.studio_publish_dispatch_note || row?.publish_error || "").trim();
  if (blocker === "youtube_quota") {
    return "YouTube API quota exhausted (Manual Publish Required). Do not kick. Worker retries after Pacific midnight.";
  }
  if (blocker === "youtube_thumbnail") {
    return "YouTube video send already started; the cover attach failed. Do not re-dispatch the video. Retry thumbnails.set only.";
  }
  if (blocker === "missing_asset") {
    return `Publisher skipped because the platform cannot fetch the file. Last note: ${note || "missing public asset"}. Stage a public copy; do not pulse again.`;
  }
  if (blocker === "dispatch_exhausted") {
    return `Due Approved for Publishing was kicked ${Number(row?.dispatch_count || row?.studio_publish_dispatch_count) || "several"} times and still did not send. Last note: ${note || "none"}. Stop pulsing; fix the skip reason.`;
  }
  if (blocker === "dispatch_skipped") {
    return `Publisher skipped the due send. Last note: ${note || "skipped"}. Stop pulsing until that skip is fixed.`;
  }
  return "Due Approved for Publishing with no successful dispatch receipt. Queue one send; if it returns skip/fail, diagnose that note instead of kicking again.";
}

export function classifyPublishDispatch(row, nowMs = Date.now()) {
  if (classifyPublishFailed(row, nowMs)) return null;
  if (classifyIgCarouselTooManyChildren(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const outputStatus = String(row?.output_status || "").trim();
  const platform = String(row?.platform || "").trim();
  if (outputStatus !== "Approved for Publishing") return null;
  if (row?.published_at || ["Published", "Publishing"].includes(String(row?.publish_status || "").trim())) return null;
  if (platform === "TikTok") return null;
  const blocker = deskPublishDispatchBlocker(row, nowMs);
  if (blocker === "scheduled_hold" || blocker === "auto_publish_off") return null;
  if (blocker === "never_attempted" && outputAgeMs(row, nowMs) < STALE_RENDER_MINUTES * 60 * 1000) return null;
  const needsDesk = blocker === "dispatch_exhausted" || blocker === "missing_asset" || blocker === "dispatch_skipped";
  return withDeskIdentity({
    kind: "publish_never_dispatch",
    class: needsDesk ? "code_bug" : "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("publish_never_dispatch", recordId, blocker),
    actor: needsDesk ? "desk_agent" : "worker_heal",
    blocker,
    scheduled_post_date: row?.scheduled_post_date || null,
    dispatch_count: Number(row?.dispatch_count || row?.studio_publish_dispatch_count) || 0,
    dispatch_note: String(row?.dispatch_note || row?.studio_publish_dispatch_note || "").trim() || null,
    diagnosis: publishDispatchDiagnosis(blocker, row),
  }, row);
}

export function deskDesignedCoverUrl(url) {
  const href = String(url || "").trim();
  if (!href) return "";
  if (/ITEM4-VARIANT-fill-crop/i.test(href)) return "";
  if (/drive\.google\.com|\/uc\?id=|googleusercontent\.com/i.test(href)) return "";
  if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(href)) return "";
  if (/\/studio\/previews\/clip-posters\//i.test(href)) return "";
  if (!/^https:\/\/media\.chicagoshining\.com\/(publish|studio\/previews)\//i.test(href)) return "";
  return href;
}

export function deskNeedsGridCover(row) {
  const platform = String(row?.platform || "").trim();
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""} ${row?.output_type || ""}`.trim();
  if (/story/i.test(type)) return false;
  if (platform === "Instagram" && /single image|instagram feed post/i.test(type) && !/carousel|reel/i.test(type)) return false;
  if (platform === "Facebook" && /single image|facebook post/i.test(type) && !/reel|multi-image|photo set/i.test(type)) return false;
  return true;
}

export function deskReviewBlocker(row) {
  const native = /native photo route/i.test(String(row?.render_status || ""));
  if (native && Boolean(row?.needs_lettering)) return "lettering";
  const hasFile = Boolean(String(row?.final_file_url || "").trim() || String(row?.studio_preview_url || "").trim());
  if (!native && !hasFile) return "final_file";
  if (deskNeedsGridCover(row) && !deskDesignedCoverUrl(row?.thumbnail_url)) return "cover";
  return null;
}

export function classifyRfrLockedMissingDeliverable(row, nowMs = Date.now(), extras = {}) {
  if (String(row?.test_run_id || "").trim()) return null;
  if (outputPastReview(row)) return null;
  const outputStatus = String(row?.output_status || "").trim();
  const renderStatus = String(row?.render_status || "").trim();
  const reviewStatus = String(row?.review_status || "").trim();
  const labelsReady = /ready for review/i.test(outputStatus)
    || /review sent/i.test(reviewStatus)
    || /^rendered$/i.test(renderStatus)
    || /native photo route/i.test(renderStatus);
  if (!labelsReady) return null;
  const blocker = deskReviewBlocker(row);
  if (!blocker) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const outputId = String(row?.output_id || recordId || "").trim();
  const stale = outputAgeMs(row, nowMs) >= STALE_RENDER_MINUTES * 60 * 1000;
  const storyOpen = Boolean(extras?.story_open_review);
  const group = extras?.group_progress ? ` Group progress ${extras.group_progress}.` : "";
  const sibling = storyOpen
    ? " Sibling Stories already Open review while cover-required destinations stay Preparing Assets."
    : "";
  return withDeskIdentity({
    kind: "rfr_locked_missing_deliverable",
    class: stale ? "code_bug" : "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("rfr_locked_missing_deliverable", outputId, blocker),
    actor: stale ? "desk_agent" : "worker_heal",
    blocker,
    diagnosis: `Labels say ${outputStatus || renderStatus || reviewStatus} but Open review is locked (${blocker}). Ignore the Ready for Review badge; trust creative_available.${sibling}${group} Worker must stage a public 3D still to media.chicagoshining.com/publish or studio/previews, stamp cover-required siblings, and stamp a blank Output_Caption from the Content Item. Do not Approve. Do not send thumb_offset.`,
  }, row);
}

export function classifyNativePhotoReviewStrand(row, siblings = []) {
  if (String(row?.test_run_id || "").trim()) return null;
  if (String(row?.output_status || "").trim() !== "Ready for Review") return null;
  if (!/native photo route/i.test(String(row?.render_status || ""))) return null;
  if (!String(row?.scheduled_post_date || "").trim()) return null;
  if (deskReviewBlocker(row)) return null;
  const peerApproved = (Array.isArray(siblings) ? siblings : []).some((sibling) => {
    if (!sibling || sibling.id === row.id) return false;
    const status = String(sibling.output_status || "").trim();
    return status === "Approved for Publishing"
      || status === "Published"
      || Boolean(sibling.published_at);
  });
  if (!peerApproved) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const outputId = String(row?.output_id || recordId || "").trim();
  return withDeskIdentity({
    kind: "native_photo_review_strand",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("native_photo_review_strand", outputId, "scheduled_peer_approved"),
    actor: "worker_heal",
    blocker: "scheduled_peer_approved",
    diagnosis: "Native-photo output is complete and scheduled, but remained Ready for Review after a sibling for the same Content Item advanced to Approved for Publishing/Published. Run the full approve path (Review_Status, Auto_Publish_Enabled, Publish_Status, native slides/handoff); do not only flip Output_Status.",
  }, row);
}

export function isNativePhotoApproveIncomplete(row) {
  if (String(row?.test_run_id || "").trim()) return false;
  if (String(row?.output_status || "").trim() !== "Approved for Publishing") return false;
  if (row?.published_at || String(row?.publish_status || "").trim() === "Published") return false;
  if (!/native photo route/i.test(String(row?.render_status || ""))) return false;
  if (Boolean(row?.do_not_publish)) return false;
  const review = String(row?.review_status || "").trim();
  const publish = String(row?.publish_status || "").trim();
  const publishArmed = ["Ready to Schedule", "Ready to Publish", "Publishing"].includes(publish);
  const reviewOk = review === "Approved";
  // Strand heal used to PATCH Output_Status only, leaving Review/Publish/Auto_Publish blank
  // (Output 1245 Getty Center IG Carousel / reccuk3Nj4jOQX5c1).
  if (!reviewOk || !publishArmed) return true;
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""}`;
  if (/carousel|multi-image|photo set|multi-photo/i.test(type)) {
    const slides = Number(row?.carousel_slide_count || 0) || 0;
    const igStatus = String(row?.ig_carousel_status || "").trim();
    const fbStatus = String(row?.fb_publish_status || "").trim();
    const ttStatus = String(row?.tiktok_draft_status || "").trim();
    if (/instagram/i.test(String(row?.platform || "")) && (!slides || !igStatus)) return true;
    if (/facebook/i.test(String(row?.platform || "")) && (!slides || !fbStatus)) return true;
    if (/tiktok/i.test(String(row?.platform || "")) && (!slides || !ttStatus)) return true;
  }
  return false;
}

export function classifyNativePhotoApproveIncomplete(row) {
  if (!isNativePhotoApproveIncomplete(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const outputId = String(row?.output_id || recordId || "").trim();
  return withDeskIdentity({
    kind: "native_photo_approve_incomplete",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("native_photo_approve_incomplete", recordId || outputId, "unarmed"),
    actor: "worker_heal",
    diagnosis: "Native-photo output shows Approved for Publishing but publish was never armed (missing Review_Status=Approved and/or Publish_Status Ready to Schedule/Publish, and often zero Carousel Slides / blank IG_Carousel_Status). Cause: studioHealNativePhotoReviewStrands only flipped Output_Status. Complete approve via approveOutputRecordForPublishing / slide handoff. Proven: Output 1245 / Getty Center Sunset Poll / reccuk3Nj4jOQX5c1.",
  }, row);
}

/** Output_Status stuck Ready for Review after Approve (phantom All-Profiles Awaiting Approval). */
export function isAwaitingApprovalStaleRfr(row) {
  if (String(row?.test_run_id || "").trim()) return false;
  if (Boolean(row?.do_not_publish)) return false;
  if (row?.published_at || String(row?.publish_status || "").trim() === "Published") return false;
  if (String(row?.output_status || "").trim() !== "Ready for Review") return false;
  const review = String(row?.review_status || "").trim();
  const publish = String(row?.publish_status || "").trim();
  // Approved + publish armed means Approve already ran; Output_Status never advanced.
  if (review !== "Approved") return false;
  return ["Ready to Schedule", "Ready to Publish", "Scheduled", "Publishing"].includes(publish);
}

export function classifyAwaitingApprovalStaleRfr(row) {
  if (!isAwaitingApprovalStaleRfr(row)) return null;
  const recordId = String(row?.id || row?.record_id || "").trim();
  const outputId = String(row?.output_id || recordId || "").trim();
  return withDeskIdentity({
    kind: "awaiting_approval_stale_rfr",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("awaiting_approval_stale_rfr", recordId || outputId, "approved_publish_armed"),
    actor: "worker_heal",
    diagnosis: "Output_Status is still Ready for Review after Approve (Review_Status=Approved and Publish_Status Ready to Schedule/Publish/Scheduled). All-Profiles Awaiting Approval counted the stale Output_Status while Pipeline Awaiting Approval correctly showed empty. Repair: set Output_Status=Approved for Publishing (do not re-Approve). Overview metrics must use studio_state Ready for Review, not raw Output_Status. Proven: Miami Outputs 2154/2155 (Inside PAMM Design, CI 434) and 1841 (Brickell or Coconut Grove?, CI 380).",
  }, row);
}

export function classifyNativeCover(row) {
  const recordId = String(row?.id || row?.record_id || "").trim();
  const outputStatus = String(row?.output_status || "").trim();
  const publish = String(row?.publish_status || "").trim();
  const published = outputStatus === "Published" || publish === "Published" || Boolean(row?.published_at);
  if (!published) return null;
  const platform = String(row?.platform || "").trim();
  if (platform === "TikTok") return null;
  const type = `${row?.studio_output_type || ""} ${row?.platform_output_type || ""} ${row?.output_type || ""}`;
  if (!/reel|short/i.test(type) || /story|carousel|single image|multi-image|multi-photo/i.test(type)) return null;
  const thumb = String(row?.thumbnail_url || "").trim();
  const publicCover = Boolean(thumb)
    && !/drive\.google\.com|\/uc\?id=|googleusercontent\.com/i.test(thumb)
    && !/ITEM4-VARIANT-fill-crop/i.test(thumb);
  if (platform === "Facebook") {
    if (row?.cover_attached) return null;
    return withDeskIdentity({
      kind: "native_cover_missing",
      class: "code_bug",
      record_id: recordId || null,
      fingerprint: fingerprint("native_cover_missing", recordId, publicCover ? "cover_not_attached" : "missing_public_cover"),
      actor: "desk_agent",
    }, row);
  }
  if (publicCover) return null;
  return withDeskIdentity({
    kind: "native_cover_missing",
    class: "code_bug",
    record_id: recordId || null,
    fingerprint: fingerprint("native_cover_missing", recordId, "missing_public_cover"),
    actor: "desk_agent",
  }, row);
}

export function classifyTesterNightly(events, nowMs = Date.now(), maxAgeMs = TESTER_NIGHTLY_MAX_AGE_MS) {
  const rows = Array.isArray(events) ? events : [];
  const nightly = rows.find((row) => {
    const body = row?.payload && typeof row.payload === "object" ? row.payload : row || {};
    const label = `${body.suite || ""} ${body.workflow || ""} ${row?.type || ""}`;
    return /regression suite/i.test(label);
  });
  if (!nightly) {
    return {
      kind: "tester_nightly",
      class: "infra_down",
      record_id: "nightly",
      fingerprint: fingerprint("tester_nightly", "nightly", "missing"),
      actor: "regression",
    };
  }
  const body = nightly.payload && typeof nightly.payload === "object" ? nightly.payload : {};
  const conclusion = String(body.conclusion || nightly.conclusion || "").toLowerCase();
  const created = Date.parse(String(nightly.created_at || body.at || ""));
  if (conclusion === "failure" || conclusion === "failed" || conclusion === "cancelled") {
    return {
      kind: "tester_nightly",
      class: "code_bug",
      record_id: "nightly",
      fingerprint: fingerprint("tester_nightly", "nightly", "failed"),
      actor: "regression",
    };
  }
  if (!Number.isFinite(created) || (nowMs - created) >= maxAgeMs) {
    return {
      kind: "tester_nightly",
      class: "infra_down",
      record_id: "nightly",
      fingerprint: fingerprint("tester_nightly", "nightly", "stale"),
      actor: "regression",
    };
  }
  return null;
}

export function classifyTesterCatalogAssert() {
  try {
    assertQualityCatalog(QUALITY_CHECKS);
    return null;
  } catch (error) {
    return {
      kind: "tester_catalog_assert",
      class: "code_bug",
      record_id: "catalog",
      fingerprint: fingerprint("tester_catalog_assert", "catalog", "invalid"),
      error: error instanceof Error ? error.message : String(error),
      actor: "regression",
    };
  }
}

export const CLASSIFIER_KINDS = Object.freeze([
  "produce_clip_mismatch",
  "drive_music_404",
  "produce_escalated",
  "produce_stale",
  "render_ready_no_job",
  "render_ready_waiting_voiceover",
  "render_ready_status_typo",
  "render_long",
  "produce_orphan",
  "crop_parked",
  "crop_stale",
  "autonomous_stalled",
  "autonomous_produce_gap",
  "az_stalled",
  "intake_processed_residue",
  "intake_parked",
  "intake_oversize",
  "promoted_not_rfr",
  "az_not_auto_finished",
  "autonomous_rfr_gate",
  "publish_never_dispatch",
  "publish_failed_transient",
  "tiktok_auth_signature",
  "ig_carousel_too_many_children",
  "ig_carousel_child_verification_race",
  "ig_carousel_child_poll_failure",
  "ig_carousel_rate_limited",
  "render_failed",
  "render_stale_rendering",
  "render_unfetchable_source",
  "render_private_drive_watermark",
  "voiceover_exceeds_render",
  "native_cover_missing",
  "native_photo_review_strand",
  "native_photo_approve_incomplete",
  "awaiting_approval_stale_rfr",
  "rfr_locked_missing_deliverable",
  "health_down",
  "variant_preparing",
  "tester_nightly",
  "tester_catalog_assert",
  "autonomous_topic_collision",
  "youtube_private_source_fail",
  "youtube_cover_quota",
]);

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
  // Preparing = in-flight crops; Error = parked leftovers that used to need a
  // manual "Retry remaining" click. Both are Worker/Quality Agent heal work.
  if (status !== "Preparing" && status !== "Error") return null;
  return withDeskIdentity({
    kind: "variant_preparing",
    class: "transient",
    record_id: recordId || null,
    fingerprint: fingerprint("variant_preparing", recordId, status === "Error" ? "error" : "preparing"),
    actor: "worker_heal",
  }, row);
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
  scannedKinds,
  activityEvents,
} = {}) {
  const generated = generatedAt || new Date().toISOString();
  const rows = Array.isArray(incidents) ? incidents.filter(Boolean) : [];
  const summary = summarizeIncidents(rows);
  return {
    ok: true,
    schema: DESK_SCHEMA,
    desk_mode: parseDeskMode(mode),
    chicago_date: chicagoDate || null,
    chicago_hour: Number.isFinite(Number(chicagoHour)) ? Number(chicagoHour) : null,
    generated_at: generated,
    caps: caps || parseDeskCaps({}, chicagoDate),
    summary,
    health: Array.isArray(health) ? health : [],
    incidents: rows,
    checks: attachQualityChecks(rows, { generatedAt: generated, scannedKinds }),
    recap: buildQualityRecap({ incidents: rows, events: activityEvents, generatedAt: generated }),
  };
}
