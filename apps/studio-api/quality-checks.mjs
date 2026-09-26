/** Maintained Quality Agent check catalog. Human titles plus machine fields. */

export const QUALITY_AGENT_NAME = "Quality Agent";
export const QUALITY_CHECK_SCHEMA = "studio.quality-checks.1";

export const QUALITY_LANES = Object.freeze(["service", "tester", "both"]);
export const QUALITY_ACTORS = Object.freeze(["worker_heal", "desk_agent", "local_companion", "regression"]);
export const QUALITY_HEALS = Object.freeze([
  "drain_intake",
  "remove_ingestion_parent",
  "resume_produce",
  "requeue_failed",
  "ticket_only",
  "none",
]);

export const ORIGIN_TERMINALS = Object.freeze({
  autonomous: "Ready for Review",
  "az-finished-video": "Approved for Publishing / scheduled",
  other: "Ready for Review",
});

const ADVANCEMENT_TERMINALS = Object.freeze({
  autonomous: ORIGIN_TERMINALS.autonomous,
  "az-finished-video": ORIGIN_TERMINALS["az-finished-video"],
  other: ORIGIN_TERMINALS.other,
});

function check(row) {
  return Object.freeze({
    terminal_by_origin: null,
    ...row,
  });
}

/** Precise operator sentences. `kind` matches a classifier or tester assertion. */
export const QUALITY_CHECKS = Object.freeze([
  check({
    id: "intake_processed_residue",
    title: "Check for orphaned ingestion content that has already been fully processed",
    lane: "service",
    kind: "intake_processed_residue",
    actor: "worker_heal",
    heal: "remove_ingestion_parent",
  }),
  check({
    id: "intake_parked",
    title: "Check for eligible unprocessed files still sitting in the ingestion folder",
    lane: "service",
    kind: "intake_parked",
    actor: "worker_heal",
    heal: "drain_intake",
  }),
  check({
    id: "intake_oversize",
    title: "Check for oversized ingestion videos waiting on compress (A1S/A1P)",
    lane: "service",
    kind: "intake_oversize",
    actor: "worker_heal",
    heal: "none",
  }),
  check({
    id: "autonomous_stalled",
    title: "Check for origin=autonomous requests stuck in Draft/Ready/Submitted (should skip Production Approve through to Promoted)",
    lane: "both",
    kind: "autonomous_stalled",
    actor: "desk_agent",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "promoted_not_rfr",
    title: "Check for Promoted / production-approved work whose outputs are not advancing to Ready for Review",
    lane: "service",
    kind: "promoted_not_rfr",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "az_not_auto_finished",
    title: "Check for origin=az-finished-video that has cover + caption + Final_File_URL but is not auto-approved / scheduled",
    lane: "service",
    kind: "az_not_auto_finished",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "autonomous_topic_collision",
    title: "Check for origin=autonomous harvests that leaked a second package on the same landmark",
    lane: "service",
    kind: "autonomous_topic_collision",
    actor: "desk_agent",
    heal: "ticket_only",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "youtube_private_source_fail",
    title: "Check for YouTube Shorts stuck because Graph cannot fetch a private Drive final",
    lane: "service",
    kind: "youtube_private_source_fail",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "autonomous_rfr_gate",
    title: "Check that library-stills autonomous work stops at Ready for Review (must not auto-publish)",
    lane: "both",
    kind: "autonomous_rfr_gate",
    actor: "desk_agent",
    heal: "ticket_only",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "publish_never_dispatch",
    title: "Check for Approved-for-Publishing outputs that never dispatch",
    lane: "service",
    kind: "publish_never_dispatch",
    actor: "worker_heal",
    heal: "none",
  }),
  check({
    id: "publish_failed_transient",
    title: "Check for Failed or retry-eligible publishes (Instagram IN_PROGRESS, HTTP 401, or Failed for more than an hour) that Worker should requeue",
    lane: "service",
    kind: "publish_failed_transient",
    actor: "worker_heal",
    heal: "requeue_failed",
  }),
  check({
    id: "render_failed",
    title: "Check for Render_Status=Failed outputs (including Failed for more than an hour) that Worker should requeue to Ready for Render",
    lane: "service",
    kind: "render_failed",
    actor: "worker_heal",
    heal: "requeue_failed",
  }),
  check({
    id: "native_cover_missing",
    title: "Check for Reels/Shorts that published without attaching the 3D native cover",
    lane: "both",
    kind: "native_cover_missing",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "rfr_locked_missing_deliverable",
    title: "Check for Rendered / Review Sent / Ready for Review outputs that still cannot Open review because the reviewable deliverable is incomplete",
    lane: "service",
    kind: "rfr_locked_missing_deliverable",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "produce_stale",
    title: "Check for stale studio-produce jobs that Worker heal should still resume",
    lane: "service",
    kind: "produce_stale",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "produce_escalated",
    title: "Check for escalated studio-produce jobs and un-park them when the block is recoverable",
    lane: "service",
    kind: "produce_escalated",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "produce_clip_mismatch",
    title: "Check for Remotion clip-count mismatch (expected N, received M) that Worker retries cannot fix",
    lane: "service",
    kind: "produce_clip_mismatch",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "render_ready_no_job",
    title: "Check for outputs Ready for Render with no Remotion job",
    lane: "service",
    kind: "render_ready_no_job",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "render_ready_waiting_voiceover",
    title: "Check for outputs Ready for Render with no Remotion job because the voiceover never generated",
    lane: "service",
    kind: "render_ready_waiting_voiceover",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "render_long",
    title: "Check for renders still in progress past the stale window",
    lane: "service",
    kind: "render_long",
    actor: "local_companion",
    heal: "ticket_only",
  }),
  check({
    id: "produce_orphan",
    title: "Check for In Production outputs with no produce/render job",
    lane: "service",
    kind: "produce_orphan",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "variant_preparing",
    title: "Check for variant rows stuck in Preparing",
    lane: "service",
    kind: "variant_preparing",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "crop_stale",
    title: "Check for crop jobs still Processing past the stale window",
    lane: "service",
    kind: "crop_stale",
    actor: "worker_heal",
    heal: "resume_produce",
  }),
  check({
    id: "crop_parked",
    title: "Check for crop jobs parked in Error or exhausted Processing attempts",
    lane: "service",
    kind: "crop_parked",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "health_down",
    title: "Check that public Chicago Shining /health endpoints are up",
    lane: "both",
    kind: "health_down",
    actor: "local_companion",
    heal: "ticket_only",
  }),
  check({
    id: "autonomous_produce_gap",
    title: "Check for Promoted origin=autonomous work with a missing or blocked produce job",
    lane: "service",
    kind: "autonomous_produce_gap",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "az_stalled",
    title: "Check for origin=az-finished-video jobs that are stalled or escalated",
    lane: "service",
    kind: "az_stalled",
    actor: "worker_heal",
    heal: "resume_produce",
    terminal_by_origin: ADVANCEMENT_TERMINALS,
  }),
  check({
    id: "variant_heic_sprite",
    title: "Check for 9:16 fill-crops that look like two photos stacked from a raw HEIC tile grid",
    lane: "service",
    kind: "variant_heic_sprite",
    actor: "desk_agent",
    heal: "ticket_only",
  }),
  check({
    id: "tester_nightly",
    title: "Check that the last nightly regression rotation from tests/regression/catalog.json is fresh and passing",
    lane: "tester",
    kind: "tester_nightly",
    actor: "regression",
    heal: "ticket_only",
  }),
  check({
    id: "tester_catalog_assert",
    title: "Check cheap Quality Agent catalog assertions without seeding live platform-matrix rows",
    lane: "tester",
    kind: "tester_catalog_assert",
    actor: "regression",
    heal: "none",
  }),
]);

export const QUALITY_CHECK_BY_KIND = Object.freeze(
  Object.fromEntries(QUALITY_CHECKS.map((row) => [row.kind, row]))
);

export function catalogCheckForKind(kind) {
  return QUALITY_CHECK_BY_KIND[String(kind || "").trim()] || null;
}

export function assertQualityCatalog(checks = QUALITY_CHECKS) {
  const rows = Array.isArray(checks) ? checks : [];
  const ids = new Set();
  const titles = new Set();
  const kinds = new Set();
  for (const row of rows) {
    if (!row?.id || !row?.title || !row?.kind) {
      throw new Error("quality catalog row missing id, title, or kind");
    }
    if (!QUALITY_LANES.includes(row.lane)) throw new Error(`invalid lane for ${row.id}`);
    if (!QUALITY_ACTORS.includes(row.actor)) throw new Error(`invalid actor for ${row.id}`);
    if (!QUALITY_HEALS.includes(row.heal)) throw new Error(`invalid heal for ${row.id}`);
    if (ids.has(row.id)) throw new Error(`duplicate quality catalog id ${row.id}`);
    if (titles.has(row.title)) throw new Error(`duplicate quality catalog title: ${row.title}`);
    if (kinds.has(row.kind)) throw new Error(`duplicate quality catalog kind ${row.kind}`);
    ids.add(row.id);
    titles.add(row.title);
    kinds.add(row.kind);
  }
  return { ok: true, count: rows.length };
}

export function attachQualityChecks(incidents, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const scanned = options.scannedKinds instanceof Set
    ? options.scannedKinds
    : new Set(options.scannedKinds || []);
  const rows = Array.isArray(incidents) ? incidents.filter(Boolean) : [];
  const byKind = {};
  for (const row of rows) {
    const kind = String(row.kind || "").trim();
    if (!kind) continue;
    if (!byKind[kind]) byKind[kind] = [];
    byKind[kind].push(row);
  }
  return QUALITY_CHECKS.map((check) => {
    const matching = byKind[check.kind] || [];
    const wasScanned = !scanned.size || scanned.has(check.kind);
    let status = "not_run";
    if (matching.length) status = "finding";
    else if (wasScanned) status = "pass";
    return {
      ...check,
      status,
      incidents: matching,
      checked_at: generatedAt,
    };
  });
}
