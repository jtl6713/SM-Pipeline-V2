export function promotedContentOwner(currentRequestId, value) {
  const current = String(currentRequestId || "").trim();
  const rows = Array.isArray(value) ? value : (value ? [value] : []);
  const owner = rows
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") return String(item.id || item.record_id || "").trim();
      return "";
    })
    .find((id) => /^rec[A-Za-z0-9]+$/.test(id));
  return owner && owner !== current ? owner : null;
}

/** Non-terminal Production Request statuses that still compete for the same Idea. */
export const ACTIVE_PRODUCTION_REQUEST_STATUSES = Object.freeze([
  "Draft",
  "Ready",
  "Submitted",
  "Promoted",
]);

/**
 * Pick the Production Request that should own an Idea when duplicates exist.
 * Prefers Promoted, then Submitted, then Ready, then the oldest Draft.
 */
export function preferAuthoritativeProductionRequest(rows = []) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: String(row?.id || "").trim(),
      status: String(row?.status || row?.Request_Status || "").trim(),
      createdAt: Date.parse(row?.createdAt || row?.Created_At || "") || 0,
    }))
    .filter((row) => row.id && ACTIVE_PRODUCTION_REQUEST_STATUSES.includes(row.status));
  if (!list.length) return null;
  const rank = { Promoted: 0, Submitted: 1, Ready: 2, Draft: 3 };
  list.sort((a, b) => {
    const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return a.createdAt - b.createdAt;
  });
  return list[0];
}

/** Sibling Draft/Ready/Submitted rows that should be cancelled once one PR owns the Idea. */
export function siblingProductionRequestsToCancel(currentRequestId, rows = []) {
  const current = String(currentRequestId || "").trim();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: String(row?.id || "").trim(),
      status: String(row?.status || row?.Request_Status || "").trim(),
    }))
    .filter((row) =>
      row.id
      && row.id !== current
      && ["Draft", "Ready", "Submitted"].includes(row.status)
    )
    .map((row) => row.id);
}
