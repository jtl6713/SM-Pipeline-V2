// Keep these helpers aligned with apps/studio-web/assets/app-item4-0621.js

export const PIPELINE_COLUMN_FILTER_KEYS = [
  "output",
  "platform",
  "type",
  "state",
  "render",
  "review",
  "publish",
  "progress",
  "creative",
];

export function blankPipelineColumnFilters() {
  return Object.fromEntries(PIPELINE_COLUMN_FILTER_KEYS.map((key) => [key, ""]));
}

export function pipelineColumnDisplayBucket(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

export function pipelineMixRerenderInProgress(record) {
  const review = String(record?.review_status || "").trim();
  const output = String(record?.output_status || "").trim();
  const render = String(record?.render_status || "").trim();
  const state = String(record?.studio_state || "").trim();
  if (state === "Rerendering") return true;
  if (/in production/i.test(output) && /^(Ready for Render|Rendering)$/i.test(render)) return true;
  if (review === "Changes Requested") {
    if (/in production/i.test(output)) return true;
    if (/^(Ready for Render|Rendering)$/i.test(render)) return true;
  }
  return false;
}

export function pipelineRenderLabel(record) {
  if (pipelineMixRerenderInProgress(record)) return "Rerendering";
  return String(record?.render_status || "").trim();
}

export function pipelineColumnFiltersActive(filters = {}) {
  return PIPELINE_COLUMN_FILTER_KEYS.some((key) => String(filters[key] || "").trim());
}

export function recordMatchesPipelineColumnFilters(displayByKey = {}, filters = {}) {
  for (const key of PIPELINE_COLUMN_FILTER_KEYS) {
    const selected = String(filters[key] || "").trim();
    if (!selected) continue;
    if (key === "output") {
      const hay = String(displayByKey.outputSearch || displayByKey.output || "").toLowerCase();
      if (!hay.includes(selected.toLowerCase())) return false;
      continue;
    }
    if (pipelineColumnDisplayBucket(displayByKey[key]) !== selected) return false;
  }
  return true;
}

export function uniqueSortedColumnValues(values) {
  const set = new Set((values || []).map(pipelineColumnDisplayBucket));
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function pipelineColumnFilterSummary(filters = {}, labels = {}) {
  return PIPELINE_COLUMN_FILTER_KEYS
    .filter((key) => String(filters[key] || "").trim())
    .map((key) => `${labels[key] || key} ${filters[key]}`);
}
