/** Remotion render-queue status helpers (Waiting vs active slot vs real retry). */

export const RENDER_STATUS_WAITING_QUEUE = "Waiting in Render Queue";
export const RENDER_STATUS_READY = "Ready for Render";
export const RENDER_STATUS_RENDERING = "Rendering";
export const RENDER_STATUS_FAILED = "Failed";

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

export function sortRenderQueueCandidates(records, field = (row, name) => row?.fields?.[name]) {
  return [...(records || [])].sort((a, b) => {
    const aId = Number(field(a, "Output_ID") || 0);
    const bId = Number(field(b, "Output_ID") || 0);
    if (aId && bId && aId !== bId) return aId - bId;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

export function assignRenderQueuePositions(records, field = (row, name) => row?.fields?.[name]) {
  const ordered = sortRenderQueueCandidates(records, field);
  const total = ordered.length;
  const byId = new Map();
  ordered.forEach((record, index) => {
    byId.set(record.id, {
      position: index + 1,
      total,
      label: formatRenderQueueLabel(index + 1, total),
    });
  });
  return { ordered, total, byId };
}

export function remotionHealthLooksBusy(health, maxConcurrent = 1) {
  if (!health || typeof health !== "object") return false;
  const active = Number(health.remotionActiveRenders || 0);
  const max = Math.max(1, Number(health.remotionMaxConcurrent || maxConcurrent) || 1);
  return Number.isFinite(active) && active >= max;
}
