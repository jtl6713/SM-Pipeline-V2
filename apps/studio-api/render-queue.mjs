/** Remotion render-queue status helpers (Waiting vs active slot vs real retry). */

export const RENDER_STATUS_WAITING_QUEUE = "Waiting in Render Queue";
export const RENDER_STATUS_READY = "Ready for Render";
export const RENDER_STATUS_RENDERING = "Rendering";
export const RENDER_STATUS_FAILED = "Failed";

/** Matches studio_produce.shared_render.SHARED_RENDER_OUTPUT_TYPES / CANONICAL_PLATFORM_ORDER. */
export const SHARED_RENDER_OUTPUT_TYPES = new Set(["Reel", "Short", "Video Draft"]);
export const CANONICAL_PLATFORM_ORDER = ["Instagram", "Facebook", "YouTube", "TikTok"];
export const SHARED_RENDER_WAITING_LABEL = "Waiting for shared render";

export function isRenderQueueWaitingStatus(status) {
  return String(status || "").trim() === RENDER_STATUS_WAITING_QUEUE;
}

export function isRenderQueueReadyStatus(status) {
  const value = String(status || "").trim();
  return value === RENDER_STATUS_READY || value === "Ready to Render";
}

export function isRenderQueueCandidateStatus(status) {
  return isRenderQueueWaitingStatus(status) || isRenderQueueReadyStatus(status);
}

export function isActiveRemotionHold(record, field = (row, name) => row?.fields?.[name]) {
  const status = String(field(record, "Render_Status") || "").trim();
  const jobId = String(field(record, "Remotion_Job_ID") || "").trim();
  const finalUrl = String(field(record, "Final_File_URL") || "").trim();
  return status === RENDER_STATUS_RENDERING && Boolean(jobId) && !finalUrl;
}

export function isRealRemotionRetryFailure(record, field = (row, name) => row?.fields?.[name]) {
  const render = String(field(record, "Render_Status") || "").trim().toLowerCase();
  const remotionError = String(field(record, "Remotion_Error_Message") || "").trim();
  const finalError = String(field(record, "Final_File_Error_Message") || "").trim();
  const hay = `${remotionError}\n${finalError}`;
  if (!(render === "failed" || render === "error" || remotionError || /failed|error/i.test(render))) {
    return false;
  }
  // Normal queue wait / ready package is never "Trying Again".
  if (render.includes("ready for render") || render.includes("waiting in render queue")) {
    return false;
  }
  return /delayrender|delay render|exit code|request closed|timed out|timeout|chrome|target closed|navigation failed|net::|econnreset|socket hang up|oom|out of memory/i.test(hay)
    || Boolean(remotionError)
    || render === "failed"
    || render === "error";
}

export function formatRenderQueueLabel(position, total) {
  const pos = Number(position);
  const tot = Number(total);
  if (Number.isFinite(pos) && pos > 0 && Number.isFinite(tot) && tot > 0) {
    return `Waiting in render queue (#${Math.trunc(pos)} of ${Math.trunc(tot)})`;
  }
  return "Waiting in render queue";
}

function firstLinkedId(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") return String(first.id || "").trim();
    return String(first || "").trim();
  }
  return String(value || "").trim();
}

function studioOutputType(record, field) {
  return String(field(record, "Studio_Output_Type") || field(record, "Output_Type") || "").trim();
}

function aspectIsNineSixteen(record, field) {
  const ratio = String(field(record, "Aspect_Ratio") || "").trim().replace(/x/gi, ":");
  return ratio === "9:16";
}

export function isSharedRenderEligible(record, field = (row, name) => row?.fields?.[name]) {
  const outputType = studioOutputType(record, field);
  if (!SHARED_RENDER_OUTPUT_TYPES.has(outputType)) return false;
  if (/^story$/i.test(outputType) || /^story$/i.test(String(field(record, "Format") || ""))) {
    return false;
  }
  if (!aspectIsNineSixteen(record, field)) return false;
  if (String(field(record, "Render_Status") || "").trim() === "Native Photo Route") return false;
  return true;
}

export function sharedRenderGroupKey(record, field = (row, name) => row?.fields?.[name]) {
  if (!isSharedRenderEligible(record, field)) return null;
  const contentId = firstLinkedId(field(record, "Content_Item"));
  const composition = String(field(record, "Composition_ID") || "").trim();
  if (!contentId || !composition) return null;
  return `${contentId}|${composition}|9:16`;
}

function platformRank(platform) {
  const index = CANONICAL_PLATFORM_ORDER.indexOf(String(platform || "").trim());
  return index >= 0 ? index : CANONICAL_PLATFORM_ORDER.length;
}

export function pickSharedRenderCanonical(records, field = (row, name) => row?.fields?.[name]) {
  const rows = [...(records || [])];
  if (!rows.length) return null;
  rows.sort((a, b) => {
    const rankDelta = platformRank(field(a, "Platform")) - platformRank(field(b, "Platform"));
    if (rankDelta) return rankDelta;
    const aId = Number(field(a, "Output_ID") || 0);
    const bId = Number(field(b, "Output_ID") || 0);
    if (aId && bId && aId !== bId) return aId - bId;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  return rows[0];
}

/**
 * One Remotion slot per shared 9:16 short group (IG Reel canonical + FB/YT/TT siblings).
 * Stories / solos stay independent. Siblings waiting on the canonical get a
 * non-numbered "Waiting for shared render" label and are never admitted to R4.
 */
export function collapseSharedRenderQueueCandidates(
  records,
  field = (row, name) => row?.fields?.[name],
  { activeHolds = [], controls = null } = {},
) {
  const ordered = sortRenderQueueCandidates(records, field, controls);
  const busyKeys = new Set();
  for (const hold of activeHolds || []) {
    const key = sharedRenderGroupKey(hold, field);
    if (key) busyKeys.add(key);
  }

  const groups = new Map();
  const solos = [];
  for (const row of ordered) {
    const key = sharedRenderGroupKey(row, field);
    if (!key) {
      solos.push(row);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const admitCandidates = [];
  const siblingIds = new Set();
  const siblingMeta = new Map();

  for (const [key, group] of groups.entries()) {
    const canonical = pickSharedRenderCanonical(group, field);
    for (const row of group) {
      if (row.id === canonical.id) continue;
      siblingIds.add(row.id);
      siblingMeta.set(row.id, {
        position: null,
        total: null,
        label: SHARED_RENDER_WAITING_LABEL,
        shared_canonical_id: canonical.id,
        shared_group_key: key,
      });
    }
    // Canonical already holds Remotion (or a sibling does) — do not admit another.
    if (busyKeys.has(key)) continue;
    admitCandidates.push(canonical);
  }

  admitCandidates.push(...solos);
  const sortedAdmit = sortRenderQueueCandidates(admitCandidates, field, controls);
  return { admitCandidates: sortedAdmit, siblingIds, siblingMeta };
}

/**
 * Default order is Output_ID asc. When `controls` is provided:
 * - `render_paused` ids are omitted from admit order
 * - `render_priority` ids (array order) come before everyone else
 */
export function sortRenderQueueCandidates(records, field = (row, name) => row?.fields?.[name], controls = null) {
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

export function assignRenderQueuePositions(
  records,
  field = (row, name) => row?.fields?.[name],
  options = {},
) {
  const { admitCandidates, siblingMeta } = collapseSharedRenderQueueCandidates(records, field, options);
  const total = admitCandidates.length;
  const byId = new Map();
  for (const [id, meta] of siblingMeta.entries()) {
    byId.set(id, meta);
  }
  admitCandidates.forEach((record, index) => {
    byId.set(record.id, {
      position: index + 1,
      total,
      label: formatRenderQueueLabel(index + 1, total),
      shared_canonical_id: record.id,
    });
  });
  return { ordered: admitCandidates, total, byId, admitCandidates, siblingMeta };
}

export function remotionHealthLooksBusy(health, maxConcurrent = 1) {
  if (!health || typeof health !== "object") return false;
  const max = Math.max(1, Number(health.remotionMaxConcurrent || maxConcurrent) || 1);
  const inFlight = Number(health.remotionInFlightJobs);
  if (Number.isFinite(inFlight)) {
    return inFlight >= max;
  }
  const active = Number(health.remotionActiveRenders || 0);
  return Number.isFinite(active) && active >= max;
}
