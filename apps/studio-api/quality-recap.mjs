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
  tiktok_auth_signature: {
    found: "A TikTok draft failed because the city auth Worker rejected the pipeline secret (HTTP 401).",
    action: "Aligned the auth Worker signature, then rearmed and republished the draft once.",
  },
  ig_carousel_too_many_children: {
    found: "An Instagram carousel had more than 10 slides, so Instagram refused to create the parent album.",
    action: "Kept the cover as slide 1, trimmed to 10 slides, and retried the parent create.",
  },
  ig_carousel_child_verification_race: {
    found: "Instagram created the carousel children, but AP1C's immediate Airtable check briefly saw fewer child IDs and marked the post failed.",
    action: "Verified the required child IDs, kept the existing containers, cleared the stale AP1C error, and advanced to child processing. If an ID is truly missing, rerun AP1C once.",
  },
  ig_carousel_child_poll_failure: {
    found: "Instagram child polling reported a terminal child or timeout, sometimes because an overflow slide or finished sibling distorted the poll count.",
    action: "Checked only the required ordered children. If they are valid, continued AP2C; if a required child is actually missing or terminal, recreated the children once with AP1C.",
  },
  ig_carousel_rate_limited: {
    found: "Meta temporarily throttled Instagram carousel child creation because AP1C made too many creation requests.",
    action: "Preserved the healthy child containers, backed off for at least 30 minutes, and will retry only the missing or terminal child instead of rebuilding the carousel.",
  },
  publish_never_dispatch: {
    found: "An approved post is due and the send never started.",
    action: "Queued the send because the scheduled time is due.",
  },
  render_failed: {
    found: "A video failed while it was being built.",
    action: "Queued the video to build again.",
  },
  render_unfetchable_source: {
    found: "A video was trying to render with a Studio-only media URL that the render server cannot fetch.",
    action: "Replaced the Studio-only source with the asset's Google Drive URL, cleared the stale render job, and rebuilt the video.",
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
  produce_stamp_422: {
    found: "A video could not be packaged because Airtable rejected the clip list as too large.",
    action: "Flagged it so the clip list can be shortened before production is restarted. Another restart would send the same list.",
  },
  drive_music_404: {
    found: "A video could not build because its background music file was deleted from Google Drive.",
    action: "Pointed the catalog at a live copy of the same track, then restarted production.",
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
  native_photo_review_strand: {
    found: "A scheduled native-photo post was complete, but stayed Ready for Review after the same content package had already been approved.",
    action: "Ran the full approve path so Review, Auto Publish, schedule status, and slides are armed.",
  },
  native_photo_approve_incomplete: {
    found: "A photo post shows Approved for Publishing, but publish was never armed (no Review Approved / Ready to Schedule / slides).",
    action: "Finished approve arming and created the carousel slides so the publisher can run.",
  },
  native_cover_missing: {
    found: "A Reel or Short published without the grid cover.",
    action: "Flagged it so the cover can be attached on the platform.",
  },
  youtube_private_source_fail: {
    found: "A YouTube Short could not upload because the video file was private.",
    action: "Made a public copy and restarted the YouTube upload.",
  },
  youtube_cover_quota: {
    found: "A YouTube Short is already live. YouTube hit the daily send limit while finishing the cover or status check.",
    action: "Nothing to do. YouTube retries after Pacific midnight. The Short is not re-sent.",
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

const PUBLISH_DISPATCH_COPY = {
  never_attempted: {
    found: "An approved post is due and the send never started.",
    action: "Queued the send because the scheduled time is due.",
  },
  youtube_quota: {
    found: "A YouTube Short hit the daily API send limit.",
    action: "Stopped kicking. YouTube retries automatically after Pacific midnight.",
  },
  youtube_thumbnail: {
    found: "A YouTube Short uploaded, but the cover still failed to attach.",
    action: "Stopped kicking the video send. The cover is a separate retry.",
  },
  missing_asset: {
    found: "An approved post could not send because the platform cannot fetch the file.",
    action: "Stopped kicking. A public file has to be staged before another send.",
  },
  dispatch_exhausted: {
    found: "An approved post is due, but several send attempts did not land.",
    action: "Stopped kicking. Needs a look at the last send note instead of another pulse.",
  },
  dispatch_skipped: {
    found: "An approved post is due, but the sender skipped it.",
    action: "Stopped kicking. The last send note is the reason, not another pulse.",
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
  "profile_name",
  "blocker",
  "scheduled_post_date",
  "dispatch_note",
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

export function qualityRecapCopy(kind, row = {}) {
  const key = String(kind || "").trim();
  if (key === "publish_never_dispatch") {
    return PUBLISH_DISPATCH_COPY[String(row.blocker || "").trim()] || PUBLISH_DISPATCH_COPY.never_attempted;
  }
  return COPY[key] || DEFAULT_COPY;
}

export function qualityRecapStatus({ actor, class: klass, open, blocker, kind } = {}) {
  if (!open) return { label: "Handled", tone: "ok" };
  if (blocker === "youtube_quota" || kind === "youtube_cover_quota") return { label: "Waiting on YouTube", tone: "work" };
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
    profile_name: cleanRecapText(row.profile_name || row.content_profile_name || row.profile),
    blocker: cleanRecapText(row.blocker),
    scheduled_post_date: cleanRecapText(row.scheduled_post_date),
    dispatch_note: cleanRecapText(row.dispatch_note || row.studio_publish_dispatch_note),
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

export function buildQualityRecap({ incidents = [], events = [], limit = 250, generatedAt } = {}) {
  const checkedAt = generatedAt || new Date().toISOString();
  const byFingerprint = new Map();
  const remember = (row, extraTimes = []) => {
    if (!row) return;
    const current = byFingerprint.get(row.fingerprint) || { row, times: [], open: false };
    current.row = mergeIncidentRow(current.row, row);
    current.times.push(row.when, ...extraTimes);
    byFingerprint.set(row.fingerprint, current);
  };

  const skipScheduledHold = (row) => {
    if (!row || row.kind !== "publish_never_dispatch") return false;
    if (row.blocker === "scheduled_hold" || row.blocker === "auto_publish_off") return true;
    if (row.blocker && row.blocker !== "never_attempted") return false;
    const scheduled = Date.parse(String(row.scheduled_post_date || ""));
    return Number.isFinite(scheduled) && scheduled > Date.parse(checkedAt) + 120000;
  };

  for (const raw of incidents) {
    const row = asIncident(raw);
    if (!row || skipScheduledHold(row)) continue;
    remember(row);
    byFingerprint.get(row.fingerprint).open = true;
  }

  const sortedEvents = [...(Array.isArray(events) ? events : [])].sort((left, right) => {
    return Date.parse(left?.created_at || 0) - Date.parse(right?.created_at || 0);
  });
  for (const event of sortedEvents) {
    const row = incidentFromEvent(event);
    if (!row || skipScheduledHold(row)) continue;
    remember(row, [event?.created_at, eventBody(event).resolved_at]);
  }

  const cards = [...byFingerprint.values()].map(({ row, times, open: isOpen }) => {
    const copy = qualityRecapCopy(row.kind, row);
    const status = qualityRecapStatus({ actor: row.actor, class: row.class, open: isOpen, blocker: row.blocker, kind: row.kind });
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
      profile_name: cleanRecapText(row.profile_name),
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
