/**
 * Operations Queue — cross-profile work inventory + render/produce controls.
 * Controls live in R2 (studio/state/ops-queue-controls.json), not Airtable schema.
 */

export const OPS_QUEUE_CONTROLS_KEY = "studio/state/ops-queue-controls.json";
export const OPS_QUEUE_CONTROLS_SCHEMA = "studio.ops-queue-controls.1";

/** Open Platform Outputs worth showing on the Ops Queue (not terminal published/skipped). */
export const OPS_QUEUE_OUTPUT_FORMULA =
  'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),OR({Output_Status}="In Production",{Output_Status}="Ready for Render",{Output_Status}="Ready for Review",{Output_Status}="Approved for Publishing",{Output_Status}="Ready to Schedule",{Output_Status}="Ready to Publish",{Output_Status}="Scheduled",{Output_Status}="Failed",{Output_Status}="Blocked",{Review_Status}="Review Sent",{Render_Status}="Waiting in Render Queue",{Render_Status}="Ready for Render",{Render_Status}="Rendering",{Render_Status}="Failed",{Render_Status}="Blocked"))';

/** Production Requests still moving toward Ready for Review. */
export const OPS_QUEUE_REQUEST_FORMULA =
  'AND({Test_Run_ID}=BLANK(),OR({Request_Status}="Draft",{Request_Status}="Ready",{Request_Status}="Submitted",{Request_Status}="Promoted",AND({Studio_Production_Job_JSON}!="",FIND(\'"step":"done"\',{Studio_Production_Job_JSON}&\'\')=0)))';

export const OPS_QUEUE_OUTPUT_FIELDS = [
  "Output_ID",
  "Platform",
  "Format",
  "Studio_Output_Type",
  "Platform_Output_Type",
  "Aspect_Ratio",
  "Output_Status",
  "Publish_Status",
  "Review_Status",
  "Render_Status",
  "Remotion_Job_ID",
  "Final_File_URL",
  "Thumbnail_URL",
  "Output_Title",
  "Output_Caption",
  "Content_Item",
  "Content_Profile",
  "Composition_ID",
  "Scheduled_Post_Date",
  "Studio_Scheduled_At",
  "Publish_Error_Message",
  "Remotion_Error_Message",
  "Final_File_Error_Message",
  "Last Modified",
  "Test_Run_ID",
  "Do_Not_Publish",
];

export const OPS_QUEUE_REQUEST_FIELDS = [
  "Production_Request_ID",
  "Request_Status",
  "Production_Notes",
  "Studio_Production_Job_JSON",
  "Studio_Variant_Status",
  "Studio_Output_Plan_Status",
  "Master_Content_Type",
  "Target_Platforms",
  "Requested_Title",
  "Idea_Title",
  "Idea_Candidate",
  "Promoted_Content_Item",
  "Created_At",
  "Updated_At",
  "Test_Run_ID",
];

/** Prefer human titles over Master_Content_Type ("Vertical Short Video"). */
export function opsQueueItemTitle({
  contentWorkingTitle = "",
  contentTitle = "",
  ideaTitle = "",
  requestedTitle = "",
  requestIdeaTitle = "",
  outputTitle = "",
  masterContentType = "",
  outputId = "",
  fallback = "Untitled",
} = {}) {
  const genericTypes = new Set([
    "vertical short video",
    "feed post",
    "carousel",
    "photo set",
    "story",
    "longform video",
    "production request",
    "untitled",
    "untitled output",
  ]);
  const candidates = [
    contentWorkingTitle,
    contentTitle,
    ideaTitle,
    requestedTitle,
    requestIdeaTitle,
    outputTitle,
    masterContentType,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  for (const candidate of candidates) {
    if (!genericTypes.has(candidate.toLowerCase())) return candidate;
  }
  if (candidates.length) return candidates[0];
  if (outputId) return `Output ${outputId}`;
  return fallback;
}

export const OPS_QUEUE_CONTENT_FIELDS = [
  "Content_ID",
  "Content_Title",
  "Working_Title",
  "Content_Status",
  "Voiceover_Status",
  "Content_Profile",
];

export function emptyOpsQueueControls() {
  return {
    schema: OPS_QUEUE_CONTROLS_SCHEMA,
    updated_at: null,
    updated_by: null,
    produce_paused: {},
    render_paused: {},
    render_priority: [],
  };
}

export function normalizeOpsQueueControls(raw) {
  const base = emptyOpsQueueControls();
  if (!raw || typeof raw !== "object") return base;
  const producePaused = {};
  const renderPaused = {};
  const srcProduce = raw.produce_paused && typeof raw.produce_paused === "object" ? raw.produce_paused : {};
  const srcRender = raw.render_paused && typeof raw.render_paused === "object" ? raw.render_paused : {};
  for (const [id, meta] of Object.entries(srcProduce)) {
    if (!/^rec[A-Za-z0-9]+$/.test(id)) continue;
    producePaused[id] = {
      paused_at: String(meta?.paused_at || raw.updated_at || "").trim() || null,
      paused_by: String(meta?.paused_by || "").trim() || null,
      reason: String(meta?.reason || "").trim().slice(0, 240) || null,
    };
  }
  for (const [id, meta] of Object.entries(srcRender)) {
    if (!/^rec[A-Za-z0-9]+$/.test(id)) continue;
    renderPaused[id] = {
      paused_at: String(meta?.paused_at || raw.updated_at || "").trim() || null,
      paused_by: String(meta?.paused_by || "").trim() || null,
      reason: String(meta?.reason || "").trim().slice(0, 240) || null,
    };
  }
  const priority = [...new Set((Array.isArray(raw.render_priority) ? raw.render_priority : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  return {
    schema: OPS_QUEUE_CONTROLS_SCHEMA,
    updated_at: String(raw.updated_at || "").trim() || null,
    updated_by: String(raw.updated_by || "").trim() || null,
    produce_paused: producePaused,
    render_paused: renderPaused,
    render_priority: priority,
  };
}

export function isProducePaused(controls, requestId) {
  const id = String(requestId || "").trim();
  return Boolean(id && controls?.produce_paused?.[id]);
}

export function isRenderPaused(controls, outputId) {
  const id = String(outputId || "").trim();
  return Boolean(id && controls?.render_paused?.[id]);
}

/**
 * Sort Remotion candidates: explicit priority first (lower index = sooner),
 * then Output_ID ascending. Paused rows are excluded from admit order.
 */
export function sortRenderQueueCandidatesWithControls(records, field, controls = null) {
  const paused = new Set(Object.keys(controls?.render_paused || {}));
  const priority = Array.isArray(controls?.render_priority) ? controls.render_priority : [];
  const rank = new Map(priority.map((id, index) => [id, index]));
  return [...(records || [])]
    .filter((row) => !paused.has(String(row?.id || "")))
    .sort((a, b) => {
      const aRank = rank.has(a.id) ? rank.get(a.id) : Number.POSITIVE_INFINITY;
      const bRank = rank.has(b.id) ? rank.get(b.id) : Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      const aId = Number(field(a, "Output_ID") || 0);
      const bId = Number(field(b, "Output_ID") || 0);
      if (aId && bId && aId !== bId) return aId - bId;
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
}

export function applyProducePauseToJob(job, { paused, pausedBy = null, reason = null } = {}) {
  const next = job && typeof job === "object" ? { ...job } : {};
  if (paused) {
    next.paused = true;
    next.paused_at = new Date().toISOString();
    next.paused_by = pausedBy || null;
    next.paused_reason = reason || null;
    next.detail = next.detail || "Paused in Operations Queue";
    next.updated_at = new Date().toISOString();
  } else {
    delete next.paused;
    delete next.paused_at;
    delete next.paused_by;
    delete next.paused_reason;
    next.updated_at = new Date().toISOString();
  }
  return next;
}

export function jobIsOpsPaused(job) {
  return Boolean(job && typeof job === "object" && job.paused);
}

export function queueLaneForStudioState(studioState, { producePaused = false, renderPaused = false, stuck = null } = {}) {
  if (producePaused || renderPaused) return "paused";
  if (stuck) return "stuck";
  const state = String(studioState || "").trim().toLowerCase();
  if (!state) return "active";
  if (state.includes("failed") || state.includes("blocked") || state.includes("escalated") || state.includes("manual action")) {
    return "stuck";
  }
  if (state.includes("ready for review") || state.includes("awaiting approval")) return "review";
  if (state.includes("approved") || state.includes("ready to schedule") || state.includes("ready to publish") || state.includes("scheduled")) {
    return "publish";
  }
  if (state.includes("published") || state.includes("skipped")) return "done";
  return "active";
}

export function summarizeOpsQueueRows(rows) {
  const summary = {
    total: rows.length,
    active: 0,
    stuck: 0,
    paused: 0,
    review: 0,
    publish: 0,
    render_waiting: 0,
    producing: 0,
  };
  for (const row of rows) {
    const lane = String(row?.lane || "active");
    if (lane === "stuck") summary.stuck += 1;
    else if (lane === "paused") summary.paused += 1;
    else if (lane === "review") summary.review += 1;
    else if (lane === "publish") summary.publish += 1;
    else summary.active += 1;
    if (row?.kind === "output" && Number(row?.render_queue_position) > 0) summary.render_waiting += 1;
    if (row?.kind === "request" || row?.produce_step) summary.producing += 1;
  }
  return summary;
}

/** Stable fingerprint for UI grouping: content item or production request. */
export function opsQueueGroupKey(row) {
  return String(row?.content_item_id || row?.production_request_id || row?.id || "").trim();
}
