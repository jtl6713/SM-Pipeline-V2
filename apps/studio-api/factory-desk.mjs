/**
 * Factory Desk — parallel four-lane work surface beside Operations.
 * Needs-assets working pile lives in R2 (studio/state/factory-desk.json), not Airtable.
 */

export const FACTORY_DESK_KEY = "studio/state/factory-desk.json";
export const FACTORY_DESK_SCHEMA = "studio.factory-desk.1";
export const FACTORY_NEEDS_ASSETS_MAX = 3;

export const FACTORY_LANES = ["auto_high", "needs_eyes", "needs_assets", "manual"];

export function emptyFactoryDeskControls() {
  return {
    schema: FACTORY_DESK_SCHEMA,
    updated_at: null,
    updated_by: null,
    needs_assets: [],
  };
}

function normalizeNeedsAssetEntry(raw) {
  const id = String(raw?.id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(id)) return null;
  const kind = String(raw?.kind || "request").trim().toLowerCase();
  if (!["request", "output", "idea"].includes(kind)) return null;
  return {
    id,
    kind,
    title: String(raw?.title || "").trim().slice(0, 200) || null,
    profile_name: String(raw?.profile_name || "").trim().slice(0, 120) || null,
    studio_state: String(raw?.studio_state || "").trim().slice(0, 120) || null,
    pinned_at: String(raw?.pinned_at || "").trim() || null,
    pinned_by: String(raw?.pinned_by || "").trim() || null,
    note: String(raw?.note || "").trim().slice(0, 240) || null,
  };
}

export function normalizeFactoryDeskControls(raw) {
  const base = emptyFactoryDeskControls();
  if (!raw || typeof raw !== "object") return base;
  const seen = new Set();
  const needsAssets = [];
  for (const entry of Array.isArray(raw.needs_assets) ? raw.needs_assets : []) {
    const next = normalizeNeedsAssetEntry(entry);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    needsAssets.push(next);
    if (needsAssets.length >= FACTORY_NEEDS_ASSETS_MAX) break;
  }
  return {
    schema: FACTORY_DESK_SCHEMA,
    updated_at: String(raw.updated_at || "").trim() || null,
    updated_by: String(raw.updated_by || "").trim() || null,
    needs_assets: needsAssets,
  };
}

export function pinFactoryNeedsAssets(controls, item, { actor = null, max = FACTORY_NEEDS_ASSETS_MAX } = {}) {
  const current = normalizeFactoryDeskControls(controls);
  const entry = normalizeNeedsAssetEntry({
    ...item,
    pinned_at: new Date().toISOString(),
    pinned_by: actor || null,
  });
  if (!entry) {
    return { ok: false, error: "invalid_item", controls: current };
  }
  if (current.needs_assets.some((row) => row.id === entry.id)) {
    return { ok: true, already: true, controls: current };
  }
  if (current.needs_assets.length >= max) {
    return {
      ok: false,
      error: "needs_assets_full",
      message: `Needs-assets pile is full (max ${max}). Remove one before adding.`,
      controls: current,
    };
  }
  return {
    ok: true,
    controls: {
      ...current,
      needs_assets: [...current.needs_assets, entry],
    },
  };
}

export function unpinFactoryNeedsAssets(controls, id) {
  const current = normalizeFactoryDeskControls(controls);
  const target = String(id || "").trim();
  return {
    ok: true,
    controls: {
      ...current,
      needs_assets: current.needs_assets.filter((row) => row.id !== target),
    },
  };
}

function textIncludes(value, needle) {
  return String(value || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function isAutonomousOrigin(row) {
  const notes = String(row?.production_notes || row?.notes || row?.origin || "").toLowerCase();
  if (notes.includes("origin=autonomous") || notes.includes("origin=az-finished-video")) return true;
  if (row?.origin === "autonomous" || row?.autonomous === true) return true;
  return false;
}

function isReadyForReview(row) {
  const state = String(row?.studio_state || "").trim().toLowerCase();
  const output = String(row?.output_status || "").trim().toLowerCase();
  const review = String(row?.review_status || "").trim().toLowerCase();
  if (row?.lane === "review") return true;
  if (state === "ready for review") return true;
  if (output === "ready for review") return true;
  if (review === "review sent" || review === "ready for review") return true;
  return false;
}

function isManualLane(row) {
  if (row?.lane === "stuck") return true;
  if (row?.stuck_kind) return true;
  const state = String(row?.studio_state || "").toLowerCase();
  if (state.includes("blocked") || state.includes("failed") || state.includes("escalat")) return true;
  const status = String(row?.output_status || row?.request_status || "").toLowerCase();
  if (status === "blocked" || status === "failed") return true;
  const step = String(row?.produce_step || "").toLowerCase();
  if (step === "blocked" || step === "escalated") return true;
  return false;
}

function isNeedsAssetsCandidate(row) {
  if (row?.kind === "idea" && textIncludes(row?.photo_wait_status || row?.studio_state, "waiting")) return true;
  if (textIncludes(row?.asset_match_status, "needs assets") || textIncludes(row?.asset_match_status, "partial match")) {
    return true;
  }
  if (textIncludes(row?.studio_state, "assets needed") || textIncludes(row?.studio_state, "photo wait")) return true;
  if (row?.kind === "request") {
    const status = String(row?.request_status || "").toLowerCase();
    if ((status === "draft" || status === "ready") && !row?.produce_step) return true;
  }
  return false;
}

function isAutoHigh(row) {
  if (isManualLane(row) || isReadyForReview(row) || isNeedsAssetsCandidate(row)) return false;
  if (row?.lane === "publish" || row?.lane === "done") return false;
  const state = String(row?.studio_state || "").toLowerCase();
  const active = state.includes("producing")
    || state.includes("rendering")
    || state.includes("in production")
    || row?.lane === "active"
    || String(row?.request_status || "").toLowerCase() === "promoted";
  if (!active) return false;
  // Prefer autonomous; still show busy non-stuck work so the lane is useful on day one.
  return true;
}

/**
 * Classify a queue/idea row into one Factory lane (or null to omit).
 * Priority: manual → needs_eyes → needs_assets → auto_high.
 */
export function classifyFactoryLane(row) {
  if (!row?.id) return null;
  if (isManualLane(row)) return "manual";
  if (isReadyForReview(row)) return "needs_eyes";
  if (isNeedsAssetsCandidate(row)) return "needs_assets";
  if (isAutoHigh(row)) return "auto_high";
  return null;
}

export function factoryCardFromRow(row, { lane = null, inPile = false } = {}) {
  return {
    id: row.id,
    kind: row.kind || "request",
    lane: lane || classifyFactoryLane(row),
    title: row.title || "Untitled",
    profile_name: row.profile_name || "",
    profile_id: row.profile_id || null,
    studio_state: row.studio_state || "",
    platform: row.platform || null,
    studio_output_type: row.studio_output_type || row.format || null,
    content_id: row.content_id || null,
    output_id: row.output_id || null,
    production_request_number: row.production_request_number || null,
    idea_id: row.idea_id || null,
    stuck_kind: row.stuck_kind || null,
    produce_error: row.produce_error || null,
    autonomous: isAutonomousOrigin(row),
    in_needs_assets_pile: Boolean(inPile),
    updated_at: row.updated_at || null,
  };
}

/**
 * Partition ops-queue rows (+ optional idea candidates) into Factory lanes.
 * Needs-assets lane shows the R2 pile (max 3) plus unclassified candidates for pin.
 */
export function partitionFactoryLanes(rows, controls = null, { ideaCandidates = [] } = {}) {
  const desk = normalizeFactoryDeskControls(controls);
  const pileIds = new Set(desk.needs_assets.map((row) => row.id));
  const byId = new Map();
  for (const row of [...(rows || []), ...(ideaCandidates || [])]) {
    if (row?.id) byId.set(row.id, row);
  }

  const lanes = {
    auto_high: [],
    needs_eyes: [],
    needs_assets: [],
    manual: [],
  };
  const claimed = new Set();

  for (const pinned of desk.needs_assets) {
    const source = byId.get(pinned.id) || pinned;
    const card = factoryCardFromRow({
      ...source,
      kind: source.kind || pinned.kind,
      title: source.title || pinned.title,
      profile_name: source.profile_name || pinned.profile_name,
      studio_state: source.studio_state || pinned.studio_state || "Needs assets",
    }, { lane: "needs_assets", inPile: true });
    card.pinned_at = pinned.pinned_at;
    card.pinned_by = pinned.pinned_by;
    card.note = pinned.note;
    lanes.needs_assets.push(card);
    claimed.add(pinned.id);
  }

  for (const row of byId.values()) {
    if (claimed.has(row.id)) continue;
    const lane = classifyFactoryLane(row);
    if (!lane) continue;
    if (lane === "needs_assets") {
      // Candidates only — pile slots are the working set (max 3).
      continue;
    }
    lanes[lane].push(factoryCardFromRow(row, { lane, inPile: false }));
    claimed.add(row.id);
  }

  const needsAssetsCandidates = [];
  for (const row of byId.values()) {
    if (pileIds.has(row.id)) continue;
    if (classifyFactoryLane(row) !== "needs_assets") continue;
    needsAssetsCandidates.push(factoryCardFromRow(row, { lane: "needs_assets", inPile: false }));
  }

  const summary = {
    auto_high: lanes.auto_high.length,
    needs_eyes: lanes.needs_eyes.length,
    needs_assets_pile: lanes.needs_assets.length,
    needs_assets_max: FACTORY_NEEDS_ASSETS_MAX,
    needs_assets_candidates: needsAssetsCandidates.length,
    manual: lanes.manual.length,
  };

  return {
    lanes,
    needs_assets_candidates: needsAssetsCandidates,
    summary,
    controls: desk,
  };
}
