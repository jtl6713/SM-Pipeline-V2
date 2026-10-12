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

/** Idea → publish breadcrumb for the End to End queue. */
export const OPS_E2E_STAGE_DEFS = [
  { id: "idea", label: "Idea" },
  { id: "media", label: "Media Added" },
  { id: "platforms", label: "Platform Suggested" },
  { id: "frames", label: "Frames Prepared" },
  { id: "prod_approved", label: "Approved" },
  { id: "render_queue", label: "Rendering Queue" },
  { id: "rendering", label: "Rendering" },
  { id: "review", label: "Waiting for Approval" },
  { id: "pub_approved", label: "Approved" },
  { id: "published", label: "Published" },
];

function normStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusReady(value) {
  const text = normStatus(value);
  return text === "ready" || text === "complete" || text === "done" || text === "prepared";
}

/** True when Remotion is not part of this output's path (stills, skipped render, etc.). */
export function opsOutputSkipsRender(row = {}) {
  const render = normStatus(row.render_status);
  const type = normStatus(row.studio_output_type || row.format);
  const state = normStatus(row.studio_state);
  const outputStatus = normStatus(row.output_status);
  if (/skip|not required|n\/a|not needed|not applicable/.test(render)) return true;
  if (row.remotion_job_id || Number(row.render_queue_position) > 0) return false;
  if (/ready for render|waiting in render|rendering/.test(render)) return false;
  if (/waiting in render|rendering \d/.test(state)) return false;
  const stillLike = /single image|carousel|photo|feed post|story|image/.test(type);
  const pastProduce = /ready for review|approved|ready to schedule|ready to publish|scheduled|published|uploading|platform processing|draft delivered/.test(
    `${state} ${outputStatus} ${normStatus(row.review_status)} ${normStatus(row.publish_status)}`,
  );
  if (stillLike && (row.final_file_url || pastProduce) && !/vertical short|reel|tiktok|youtube short|longform/.test(type)) {
    return true;
  }
  if (row.final_file_url && !render && pastProduce && !/vertical short|reel|short video|longform/.test(type)) {
    return true;
  }
  return false;
}

function isPublishedLike(row = {}) {
  const blob = `${normStatus(row.studio_state)} ${normStatus(row.output_status)} ${normStatus(row.publish_status)}`;
  return /\bpublished\b|draft delivered/.test(blob);
}

function isPublishApprovedLike(row = {}) {
  if (isPublishedLike(row)) return true;
  if (isReviewWaitingLike(row)) return false;
  const blob = `${normStatus(row.studio_state)} ${normStatus(row.output_status)} ${normStatus(row.publish_status)}`;
  if (/approved for publishing|ready to schedule|ready to publish|scheduled|uploading|platform processing/.test(blob)) {
    return true;
  }
  return /^approved$/.test(normStatus(row.studio_state)) || /^approved$/.test(normStatus(row.review_status));
}

function isReviewWaitingLike(row = {}) {
  const blob = `${normStatus(row.studio_state)} ${normStatus(row.output_status)} ${normStatus(row.review_status)}`;
  return /ready for review|review sent|awaiting approval/.test(blob);
}

function isRenderingLike(row = {}) {
  const blob = `${normStatus(row.render_status)} ${normStatus(row.studio_state)}`;
  return /\brendering\b/.test(blob) && !/ready for render|waiting in render/.test(blob);
}

function isRenderQueuedLike(row = {}) {
  if (Number(row.render_queue_position) > 0) return true;
  const blob = `${normStatus(row.render_status)} ${normStatus(row.studio_state)}`;
  return /ready for render|waiting in render/.test(blob);
}

function isRenderDoneLike(row = {}) {
  if (opsOutputSkipsRender(row)) return true;
  const render = normStatus(row.render_status);
  if (/rendered|complete|done/.test(render)) return true;
  if (row.final_file_url && !isRenderQueuedLike(row) && !isRenderingLike(row)) {
    return isReviewWaitingLike(row) || isPublishApprovedLike(row) || isPublishedLike(row);
  }
  return false;
}

/**
 * Build a left=done / current / right=todo breadcrumb.
 * stage.state: done | current | todo | skipped
 */
export function buildOpsE2eStages(input = {}) {
  const hasIdea = Boolean(input.has_idea || input.idea_id);
  const requestStatus = normStatus(input.request_status);
  const variantStatus = normStatus(input.variant_status);
  const planStatus = normStatus(input.plan_status);
  const produceStep = normStatus(input.produce_step);
  const platforms = Array.isArray(input.platforms) ? input.platforms : [];
  const hasOutputs = Boolean(input.has_outputs || input.kind === "output" || input.output_id);
  const skipsRender = input.skips_render != null ? Boolean(input.skips_render) : opsOutputSkipsRender(input);
  const promoted = /promoted/.test(requestStatus) || Boolean(produceStep && produceStep !== "done") || hasOutputs;
  const mediaDone = statusReady(variantStatus)
    || /media|crops|audio|thumb|render|stamp|done/.test(produceStep)
    || Boolean(input.content_item_id)
    || /ready|submitted|promoted/.test(requestStatus);
  const platformsDone = statusReady(planStatus) || platforms.length > 0 || hasOutputs;
  const framesDone = statusReady(variantStatus)
    || /crops|audio|thumb|render|stamp|done/.test(produceStep)
    || (skipsRender && promoted);
  const prodApproved = promoted || produceStep === "done";
  const renderDone = isRenderDoneLike(input) || skipsRender;
  const waitingReview = isReviewWaitingLike(input);
  const publishApproved = isPublishApprovedLike(input);
  const published = isPublishedLike(input);
  const activelyRendering = isRenderingLike(input);
  const inRenderQueue = isRenderQueuedLike(input);

  const skipped = {
    idea: !hasIdea && (Boolean(input.production_request_id) || hasOutputs),
    media: false,
    platforms: false,
    frames: skipsRender && !statusReady(variantStatus) && prodApproved,
    prod_approved: false,
    render_queue: skipsRender,
    rendering: skipsRender,
    review: false,
    pub_approved: false,
    published: false,
  };

  const completion = {
    idea: hasIdea || skipped.idea || Boolean(input.production_request_id) || Boolean(input.request_status),
    media: mediaDone,
    platforms: platformsDone,
    frames: framesDone || skipped.frames,
    prod_approved: prodApproved,
    // Sitting in Remotion / review / publish-approved is current for that step, not done.
    render_queue: skipped.render_queue || renderDone || activelyRendering,
    rendering: renderDone,
    review: publishApproved || published,
    pub_approved: published,
    published,
  };

  let currentId = null;
  for (const def of OPS_E2E_STAGE_DEFS) {
    if (skipped[def.id]) continue;
    if (!completion[def.id]) {
      currentId = def.id;
      break;
    }
  }
  if (published) currentId = null;
  else if (publishApproved) currentId = "pub_approved";
  else if (waitingReview) currentId = "review";
  else if (activelyRendering && !renderDone && !skipped.rendering) currentId = "rendering";
  else if (inRenderQueue && !activelyRendering && !renderDone && !skipped.render_queue) currentId = "render_queue";

  const stages = OPS_E2E_STAGE_DEFS.map((def) => {
    if (skipped[def.id]) return { ...def, state: "skipped" };
    if (def.id === currentId) return { ...def, state: "current" };
    if (completion[def.id]) return { ...def, state: "done" };
    return { ...def, state: "todo" };
  });

  return {
    stages,
    current_id: currentId,
    skips_render: skipsRender,
  };
}

function mergeE2eStageStates(states) {
  // Group progress: a stage is done only if every member is done/skipped;
  // skipped if every member skipped; current if any current and none blocking earlier.
  if (!states.length) return "todo";
  if (states.every((state) => state === "skipped")) return "skipped";
  if (states.every((state) => state === "done" || state === "skipped")) return "done";
  if (states.some((state) => state === "current")) return "current";
  if (states.some((state) => state === "todo" || state === "current")) return "todo";
  return "todo";
}

export function buildOpsE2eGroup(rows = []) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return null;
  const primary = list.find((row) => row.kind === "request") || list[0];
  const outputs = list.filter((row) => row.kind === "output");
  const sample = outputs[0] || primary;
  const trails = (outputs.length ? outputs : [primary]).map((row) => buildOpsE2eStages({
    ...row,
    has_idea: Boolean(row.idea_id || primary.idea_id),
    idea_id: row.idea_id || primary.idea_id,
    request_status: row.request_status || primary.request_status,
    variant_status: row.variant_status || primary.variant_status,
    plan_status: row.plan_status || primary.plan_status,
    produce_step: row.produce_step || primary.produce_step,
    platforms: row.platforms || primary.platforms,
    production_request_id: row.production_request_id || primary.production_request_id,
    content_item_id: row.content_item_id || primary.content_item_id,
    has_outputs: outputs.length > 0,
  }));
  const stages = OPS_E2E_STAGE_DEFS.map((def, index) => {
    const state = mergeE2eStageStates(trails.map((trail) => trail.stages[index]?.state || "todo"));
    return { ...def, state };
  });
  let currentId = stages.find((stage) => stage.state === "current")?.id || null;
  if (!currentId) currentId = stages.find((stage) => stage.state === "todo")?.id || null;
  const platforms = [...new Set(outputs.map((row) => row.platform).filter(Boolean))];
  return {
    kind: "e2e",
    id: opsQueueGroupKey(primary),
    group_key: opsQueueGroupKey(primary),
    title: primary.title || sample.title || "Untitled",
    content_id: primary.content_id || sample.content_id || null,
    content_item_id: primary.content_item_id || sample.content_item_id || null,
    production_request_id: primary.production_request_id || sample.production_request_id || null,
    production_request_number: primary.production_request_number || null,
    profile_id: primary.profile_id || sample.profile_id || null,
    profile_name: primary.profile_name || sample.profile_name || null,
    platforms,
    output_count: outputs.length,
    stuck_kind: list.find((row) => row.stuck_kind)?.stuck_kind || null,
    produce_error: list.find((row) => row.produce_error)?.produce_error || null,
    e2e: { stages, current_id: currentId, skips_render: trails.some((trail) => trail.skips_render) },
    updated_at: list.map((row) => row.updated_at).filter(Boolean).sort().at(-1) || null,
  };
}

export function isOpsRenderingQueueRow(row = {}) {
  if (row.kind !== "output") return false;
  if (row.render_paused) return true;
  if (Number(row.render_queue_position) > 0) return true;
  if (opsOutputSkipsRender(row)) return false;
  const blob = `${normStatus(row.render_status)} ${normStatus(row.studio_state)}`;
  return /ready for render|waiting in render|\brendering\b/.test(blob);
}

export function isOpsPublishingQueueRow(row = {}) {
  if (row.kind !== "output") return false;
  if (isOpsRenderingQueueRow(row) && !isReviewWaitingLike(row) && !isPublishApprovedLike(row) && !isPublishedLike(row)) {
    return false;
  }
  const blob = `${normStatus(row.studio_state)} ${normStatus(row.output_status)} ${normStatus(row.review_status)} ${normStatus(row.publish_status)}`;
  return /ready for review|review sent|awaiting approval|approved for publishing|ready to schedule|ready to publish|scheduled|uploading|platform processing|manual action/.test(blob)
    || row.lane === "review"
    || row.lane === "publish";
}

export function partitionOpsQueues(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const rendering = list
    .filter((row) => isOpsRenderingQueueRow(row))
    .map((row) => ({
      ...row,
      e2e: buildOpsE2eStages(row),
    }))
    .sort((a, b) => {
      const aPos = Number(a.render_queue_position) || Number.POSITIVE_INFINITY;
      const bPos = Number(b.render_queue_position) || Number.POSITIVE_INFINITY;
      if (aPos !== bPos) return aPos - bPos;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
  const publishing = list
    .filter((row) => isOpsPublishingQueueRow(row))
    .map((row) => ({
      ...row,
      e2e: buildOpsE2eStages(row),
    }))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  const groups = new Map();
  for (const row of list) {
    const key = opsQueueGroupKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const endToEnd = [...groups.values()]
    .map((group) => buildOpsE2eGroup(group))
    .filter(Boolean)
    .filter((row) => {
      const stages = row.e2e?.stages || [];
      return stages.some((stage) => stage.state === "current" || stage.state === "todo");
    })
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  return {
    rendering,
    publishing,
    end_to_end: endToEnd,
    summary: {
      ...summarizeOpsQueueRows(list),
      rendering: rendering.length,
      publishing: publishing.length,
      end_to_end: endToEnd.length,
    },
  };
}
