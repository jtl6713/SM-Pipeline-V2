/** Plain-language Quality Agent recap for Operations. No Airtable I/O. */

const SKIP_KINDS = new Set([
  "tester_nightly",
  "tester_catalog_assert",
  "autonomous_rfr_gate",
]);

const SERVICE_LABELS = {
  "pipeline-runner": "the main pipeline",
  "remotion-renderer": "video rendering",
  "frame-extractor": "frame extraction",
  "video-compressor": "video compression",
  "timing-engine": "timing",
  "watermark": "watermarks",
  "voiceover-normalizer": "voiceover",
  "youtube-uploader": "YouTube upload",
};

const COPY = {
  publish_failed_transient: {
    found: "A post failed while sending to Instagram, Facebook, TikTok, or YouTube.",
    action: "Restarted the send.",
  },
  publish_never_dispatch: {
    found: "An approved post never started sending.",
    action: "Started the send.",
  },
  render_failed: {
    found: "A video failed while it was being built.",
    action: "Queued the video to build again.",
  },
  render_ready_no_job: {
    found: "A video was ready to build, but the build never started.",
    action: "Started the video build.",
  },
  render_ready_waiting_voiceover: {
    found: "A video is waiting on a voiceover that never finished.",
    action: "Restarted the voiceover, then the video build.",
  },
  render_long: {
    found: "A video has been building for a long time.",
    action: "Checked the render machine and nudged the build.",
  },
  produce_stale: {
    found: "A production job stopped moving.",
    action: "Restarted production.",
  },
  produce_escalated: {
    found: "A production job was stuck and marked for investigation.",
    action: "Attached missing photos when they were in the library, then restarted production.",
  },
  produce_clip_mismatch: {
    found: "A video was built with the wrong number of clips.",
    action: "Flagged it so the clip list can be fixed before another build.",
  },
  produce_orphan: {
    found: "A post is In Production with no job running.",
    action: "Started production again.",
  },
  promoted_not_rfr: {
    found: "Approved work is not moving toward Ready for Review.",
    action: "Restarted production so it can finish.",
  },
  autonomous_stalled: {
    found: "An automatic idea is sitting in approval instead of moving forward.",
    action: "Moved it through production so it can reach Ready for Review.",
  },
  autonomous_produce_gap: {
    found: "An automatic idea was promoted, but production never started.",
    action: "Started production.",
  },
  autonomous_topic_collision: {
    found: "Two automatic ideas used the same landmark.",
    action: "Kept the original package and parked the extra one.",
  },
  az_stalled: {
    found: "A finished-video job stalled.",
    action: "Restarted the finished-video path.",
  },
  az_not_auto_finished: {
    found: "A finished video has a cover and caption but was not scheduled.",
    action: "Scheduled it and sent it on.",
  },
  rfr_locked_missing_deliverable: {
    found: "A post looks Ready for Review, but the review file or cover is missing.",
    action: "Staged the cover and finished the review file.",
  },
  native_cover_missing: {
    found: "A Reel or Short published without the grid cover.",
    action: "Flagged it so the cover can be attached on the platform.",
  },
  youtube_private_source_fail: {
    found: "A YouTube Short could not upload because the video file was private.",
    action: "Made a public copy and restarted the YouTube upload.",
  },
  intake_parked: {
    found: "New photos or videos are still sitting in the intake folder.",
    action: "Started processing the folder.",
  },
  intake_processed_residue: {
    found: "Old intake leftovers are still in the system after the files were processed.",
    action: "Cleaned up the leftovers.",
  },
  intake_oversize: {
    found: "A video in the intake folder is too large to import as-is.",
    action: "Queued it for compression.",
  },
  crop_stale: {
    found: "A photo crop has been running too long.",
    action: "Restarted the crop.",
  },
  crop_parked: {
    found: "A photo crop stopped with an error.",
    action: "Flagged it so the photo can be recropped.",
  },
  variant_preparing: {
    found: "Photo variants are stuck in Preparing.",
    action: "Restarted the crop and variant step.",
  },
  variant_heic_sprite: {
    found: "A vertical crop looks like two photos stacked.",
    action: "Flagged it so the original iPhone photo can be decoded and recropped.",
  },
  health_down: {
    found: "A Studio service is offline.",
    action: "Restarted the service.",
  },
};

const DEFAULT_COPY = {
  found: "Something in the pipeline stopped moving.",
  action: "Logged it and tried the usual restart.",
};

const IDENTITY_KEYS = [
  "output_id",
  "output_title",
  "platform",
  "platform_output_type",
  "content_id",
  "content_title",
  "content_item_id",
];

function cleanRecapText(value) {
  const text = String(value == null ? "" : value).trim();
  return text || null;
}

function cleanRecapId(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && String(numeric) === text) return numeric;
  return text;
}

export function qualityRecapOutputLabel(row = {}) {
  const type = [row.platform, row.platform_output_type].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (type) return type;
  return cleanRecapText(row.output_title) || "";
}

export function qualityRecapItemLabel(row = {}) {
  const content = cleanRecapText(row.content_title);
  const contentId = cleanRecapId(row.content_id);
  const output = qualityRecapOutputLabel(row);
  const outputId = cleanRecapId(row.output_id);
  const parts = [];
  if (content) parts.push(content);
  else if (contentId != null) parts.push(`Content ID ${contentId}`);
  if (output) parts.push(output);
  else if (outputId != null) parts.push(`Platform Output ID ${outputId}`);
  if (parts.length) return parts.join(" · ");
  const service = SERVICE_LABELS[String(row.record_id || "").trim()];
  if (service) return service;
  if (outputId != null) return `Platform Output ID ${outputId}`;
  const linked = cleanRecapText(row.content_item_id);
  if (linked && !/^rec[A-Za-z0-9]+$/.test(linked)) return `Content ID ${linked}`;
  return "";
}

export function qualityRecapCopy(kind) {
  return COPY[String(kind || "").trim()] || DEFAULT_COPY;
}

export function qualityRecapStatus({ actor, class: klass, open } = {}) {
  if (!open) return { label: "Handled", tone: "ok" };
  if (klass === "infra_down") return { label: "Service is down", tone: "alert" };
  if (klass === "code_bug" || klass === "data_repair" || actor === "desk_agent") {
    return { label: "Needs you", tone: "alert" };
  }
  return { label: "Retrying now", tone: "work" };
}

function eventBody(event) {
  return event?.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload
    : {};
}

function asIncident(row) {
  if (!row || typeof row !== "object") return null;
  const kind = String(row.kind || "").trim();
  if (!kind || SKIP_KINDS.has(kind)) return null;
  return {
    kind,
    class: row.class || null,
    actor: row.actor || null,
    record_id: row.record_id || row.id || null,
    fingerprint: row.fingerprint || [kind, row.record_id || row.id || "-", row.class || "unknown"].join(":"),
    output_id: cleanRecapId(row.output_id),
    output_title: cleanRecapText(row.output_title),
    platform: cleanRecapText(row.platform),
    platform_output_type: cleanRecapText(row.platform_output_type || row.studio_output_type),
    content_id: cleanRecapId(row.content_id),
    content_title: cleanRecapText(row.content_title),
    content_item_id: cleanRecapText(row.content_item_id),
    when: row.updated_at || row.created_at || null,
  };
}

function mergeIncidentRow(current, next) {
  const merged = { ...current, ...next };
  for (const key of IDENTITY_KEYS) {
    if (next[key] == null || next[key] === "") merged[key] = current[key] ?? next[key] ?? null;
  }
  return merged;
}

function incidentFromEvent(event) {
  const body = eventBody(event);
  return asIncident({
    ...body,
    created_at: event?.created_at || body.at || body.created_at || null,
  });
}

function stampMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function earliestIso(values, fallback) {
  const times = values.map(stampMs).filter((value) => value != null);
  if (!times.length) return fallback || null;
  return new Date(Math.min(...times)).toISOString();
}

function latestIso(values, fallback) {
  const times = values.map(stampMs).filter((value) => value != null);
  if (!times.length) return fallback || null;
  return new Date(Math.max(...times)).toISOString();
}

export function buildQualityRecap({ incidents = [], events = [], limit = 12, generatedAt } = {}) {
  const checkedAt = generatedAt || new Date().toISOString();
  const byFingerprint = new Map();
  const remember = (row, extraTimes = []) => {
    if (!row) return;
    const current = byFingerprint.get(row.fingerprint) || { row, times: [], open: false };
    current.row = mergeIncidentRow(current.row, row);
    current.times.push(row.when, ...extraTimes);
    byFingerprint.set(row.fingerprint, current);
  };

  for (const raw of incidents) {
    const row = asIncident(raw);
    if (!row) continue;
    remember(row);
    byFingerprint.get(row.fingerprint).open = true;
  }

  const sortedEvents = [...(Array.isArray(events) ? events : [])].sort((left, right) => {
    return Date.parse(left?.created_at || 0) - Date.parse(right?.created_at || 0);
  });
  for (const event of sortedEvents) {
    const row = incidentFromEvent(event);
    if (!row) continue;
    remember(row, [event?.created_at, eventBody(event).resolved_at]);
  }

  const cards = [...byFingerprint.values()].map(({ row, times, open: isOpen }) => {
    const copy = qualityRecapCopy(row.kind);
    const status = qualityRecapStatus({ actor: row.actor, class: row.class, open: isOpen });
    const foundAt = earliestIso(times, checkedAt);
    const lastSeen = latestIso(times, foundAt);
    const resolvedAt = isOpen
      ? null
      : (stampMs(lastSeen) === stampMs(foundAt) ? checkedAt : lastSeen);
    const contentTitle = cleanRecapText(row.content_title);
    const contentId = cleanRecapId(row.content_id);
    const outputLabel = qualityRecapOutputLabel(row) || null;
    const outputId = cleanRecapId(row.output_id);
    return {
      fingerprint: row.fingerprint,
      kind: row.kind,
      record_id: row.record_id,
      content_title: contentTitle,
      content_id: contentId,
      output_title: cleanRecapText(row.output_title),
      output_label: outputLabel,
      output_id: outputId,
      platform: cleanRecapText(row.platform),
      platform_output_type: cleanRecapText(row.platform_output_type),
      found: copy.found,
      action: copy.action,
      resolved_how: copy.action,
      status: status.label,
      tone: status.tone,
      found_at: foundAt,
      resolved_at: resolvedAt,
      resolved_label: isOpen ? "Still open" : null,
      when: foundAt,
      open: Boolean(isOpen),
    };
  }).sort((left, right) => {
    if (left.open !== right.open) return left.open ? -1 : 1;
    return Date.parse(right.found_at || 0) - Date.parse(left.found_at || 0);
  });

  const limited = cards.slice(0, Math.max(1, Number(limit) || 12));
  const openCount = limited.filter((row) => row.open).length;
  let empty_copy = "";
  if (!limited.length) {
    empty_copy = "Quality Agent has not found a pipeline block recently.";
  } else if (!openCount) {
    empty_copy = "Nothing is blocked right now. Recent work is below.";
  }
  return {
    open_count: openCount,
    cards: limited,
    empty_copy,
  };
}
