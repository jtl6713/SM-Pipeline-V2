/** Paginate Pipeline /api/outputs by Content Item (package), not raw output rows. */

export const PIPELINE_CONTENT_PAGE_DEFAULT = 10;
export const PIPELINE_CONTENT_PAGE_MAX = 50;

export function parsePipelineContentPage(searchParams, {
  defaultLimit = PIPELINE_CONTENT_PAGE_DEFAULT,
  maxLimit = PIPELINE_CONTENT_PAGE_MAX,
} = {}) {
  const rawLimit = searchParams?.get?.("content_limit");
  const rawOffset = searchParams?.get?.("content_offset");
  const hasLimit = rawLimit != null && String(rawLimit).trim() !== "";
  const limit = hasLimit
    ? Math.max(1, Math.min(maxLimit, Math.trunc(Number(rawLimit) || defaultLimit)))
    : defaultLimit;
  const offset = Math.max(0, Math.trunc(Number(rawOffset) || 0));
  return { contentLimit: limit, contentOffset: offset, contentPaging: true };
}

/**
 * Content Item ids in newest-package order (first seen while walking
 * Output_ID desc already-sorted rows).
 */
export function orderedContentIdsFromOutputRecords(records, getContentId) {
  const ordered = [];
  const seen = new Set();
  for (const row of records || []) {
    const id = String(getContentId(row) || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

export function pageContentIds(orderedIds, offset = 0, limit = PIPELINE_CONTENT_PAGE_DEFAULT) {
  const start = Math.max(0, Math.trunc(Number(offset) || 0));
  const size = Math.max(1, Math.min(PIPELINE_CONTENT_PAGE_MAX, Math.trunc(Number(limit) || PIPELINE_CONTENT_PAGE_DEFAULT)));
  const ids = (orderedIds || []).slice(start, start + size);
  return {
    ids,
    offset: start,
    limit: size,
    returned: ids.length,
    has_more: start + ids.length < (orderedIds || []).length,
  };
}

/** Airtable scan size large enough to discover the requested content page. */
export function pipelineContentDiscoveryLimit(contentOffset, contentLimit, {
  perPackage = 10,
  min = 80,
  max = 250,
} = {}) {
  const need = (Math.max(0, contentOffset) + Math.max(1, contentLimit) + 2) * Math.max(4, perPackage);
  return Math.max(min, Math.min(max, need));
}
