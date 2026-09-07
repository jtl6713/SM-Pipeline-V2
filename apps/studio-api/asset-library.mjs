// Keep these helpers aligned with apps/studio-api/worker.js
// (published library list, mapper, and release-file guards).

function field(record, name) {
  if (!record) return null;
  if (record.fields && Object.prototype.hasOwnProperty.call(record.fields, name)) {
    return record.fields[name];
  }
  return record[name] ?? null;
}

function text(record, name) {
  return String(field(record, name) || "").trim();
}

function extractGoogleDriveFileId(urlValue) {
  const value = String(urlValue || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const queryId = String(url.searchParams.get("id") || "").trim();
    if (queryId) return queryId;
    const match = url.pathname.match(/\/d\/([^/]+)/);
    if (match?.[1]) return match[1];
  } catch {}
  return "";
}

export function airtableSearchEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function publishedLibraryFilterFormula(query) {
  const parts = ["{Test_Run_ID}=BLANK()", "{Published_At}!=\"\""];
  const needle = String(query || "").trim().toLowerCase();
  if (needle) {
    const escaped = airtableSearchEscape(needle);
    const hay = "LOWER(CONCATENATE({Output_Title},' ',{Platform},' ',{Platform_Output_Type},' ',{Studio_Output_Type},' ',{Output_Filename}))";
    parts.push(`FIND("${escaped}", ${hay})`);
  }
  return `AND(${parts.join(",")})`;
}

export function isNativeStillPackage(record) {
  const platform = text(record, "Platform");
  const outputType = text(record, "Studio_Output_Type") || text(record, "Platform_Output_Type");
  const mapping = text(record, "Platform_Output_Type");
  const renderStatus = text(record, "Render_Status");
  if (platform === "TikTok" && (outputType === "Multi-Photo" || outputType === "Single Photo" || mapping === "TikTok Slideshow")) {
    return true;
  }
  if (platform === "Instagram" && (
    outputType === "Carousel" || outputType === "Single Image" || outputType === "Instagram Feed Post"
    || mapping === "Instagram Carousel" || mapping === "Instagram Feed Post"
  )) return true;
  if (platform === "Facebook" && (
    outputType === "Multi-Image Post" || outputType === "Single Image" || outputType === "Facebook Post"
    || mapping === "Facebook Photo Set" || mapping === "Facebook Post"
  )) return true;
  return renderStatus === "Native Photo Route";
}

export function publishedDurationSeconds(record) {
  const stored = Number(field(record, "Duration_Seconds") || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const frames = Number(field(record, "Render_Total_Frames") || 0);
  if (Number.isFinite(frames) && frames > 0) return Math.round(frames / 30);
  return null;
}

export function publishedFinalFileId(record) {
  return text(record, "Final_File_ID")
    || extractGoogleDriveFileId(field(record, "Final_File_URL"))
    || extractGoogleDriveFileId(field(record, "Output_URL"))
    || "";
}

export function collectJsonDriveIds(raw, { finishedOnly = false } = {}) {
  const ids = [];
  let parsed = raw;
  if (typeof raw === "string" && raw.trim()) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;
    const source = String(value.source || value.authority || "").toLowerCase();
    const transfer = String(value.transfer_id || value.Transfer_ID || "").trim();
    const isMaster = source.includes("finished_passthrough")
      || source.includes("studio_master")
      || transfer.startsWith("ITEM4-MASTER")
      || transfer.startsWith("STUDIO_MASTER");
    if (!finishedOnly || isMaster) {
      const driveId = String(value.google_drive_file_id || value.googleDriveFileId || "").trim();
      if (driveId) ids.push(driveId);
    }
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object") walk(child);
    });
  };
  walk(parsed);
  return [...new Set(ids)];
}

export function mapPublishedLibraryFile(record) {
  const platform = text(record, "Platform");
  const outputType = text(record, "Platform_Output_Type") || text(record, "Studio_Output_Type");
  const title = text(record, "Output_Title") || [platform, outputType].filter(Boolean).join(" ") || "Published file";
  const finalFileId = publishedFinalFileId(record);
  const finalFileUrl = text(record, "Final_File_URL") || text(record, "Output_URL") || "";
  const fileReleased = !finalFileId && !text(record, "Final_File_URL");
  const nativeStill = isNativeStillPackage(record) && !finalFileId;
  const duration = nativeStill ? null : publishedDurationSeconds(record);
  return {
    record_type: "platform_output",
    id: record.id,
    name: title,
    platform: platform || null,
    platform_output_type: outputType || null,
    aspect_ratio: text(record, "Aspect_Ratio") || null,
    published_at: field(record, "Published_At") || null,
    platform_post_url: text(record, "Platform_Post_URL") || null,
    platform_post_id: text(record, "Platform_Post_ID") || null,
    final_file_id: finalFileId || null,
    final_file_url: fileReleased ? null : (finalFileUrl || null),
    studio_preview_url: text(record, "Studio_Preview_URL") || null,
    thumbnail_url: text(record, "Thumbnail_URL") || null,
    duration_seconds: duration,
    file_size_bytes: libraryRecordFileBytes(record) || null,
    file_released: fileReleased,
    media_kind: nativeStill ? "photo" : "video",
    output_status: text(record, "Output_Status") || null,
    output_filename: text(record, "Output_Filename") || null,
  };
}

export function publishedFileReleaseGuard(record, { masterDriveIds = [] } = {}) {
  if (!text(record, "Published_At")) {
    return { ok: false, status: 409, error: "Only published Platform Outputs can release a Drive copy." };
  }
  if (!text(record, "Platform_Post_URL") && !text(record, "Platform_Post_ID")) {
    return { ok: false, status: 409, error: "This output has no live post URL or platform post ID, so the Drive copy cannot be removed yet." };
  }
  const outputStatus = text(record, "Output_Status").toLowerCase();
  const renderStatus = text(record, "Render_Status").toLowerCase();
  if (outputStatus === "in production" || outputStatus === "rendering" || renderStatus === "rendering") {
    return { ok: false, status: 409, error: "This output is still in production or rendering, so the Drive copy cannot be removed." };
  }
  const finalFileId = publishedFinalFileId(record);
  const finalFileUrl = text(record, "Final_File_URL");
  if (!finalFileId && !finalFileUrl) {
    return { ok: true, already_released: true };
  }
  if (!finalFileId && !finalFileUrl) {
    return { ok: false, status: 409, error: "This published file has no releasable Drive copy." };
  }
  const masters = new Set((masterDriveIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  if (finalFileId && masters.has(finalFileId)) {
    return {
      ok: false,
      status: 409,
      error: "This Drive file is the Production Request master (ITEM4-MASTER / STUDIO_MASTER). Only a dedicated final-output file can be removed.",
    };
  }
  return { ok: true, final_file_id: finalFileId || null, already_released: false };
}

export function publishedReleaseFields() {
  return {
    Final_File_ID: null,
    Final_File_URL: null,
    Output_URL: null,
    Final_File_Storage_Status: "Released",
  };
}

export function coerceLibraryDurationSeconds(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 12 * 60 * 60) return null;
  return rounded;
}

function firstPositiveNumber(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function libraryRecordFileBytes(record) {
  const bytes = firstPositiveNumber(field(record, "File_Size_Bytes"));
  if (bytes) return Math.round(bytes);
  const mb = firstPositiveNumber(field(record, "File_Size_MB"));
  if (mb) return Math.round(mb * 1024 * 1024);
  return 0;
}

export function publicMediaObjectKey(urlOrKey) {
  let path = String(urlOrKey || "").trim();
  if (!path) return "";
  const host = "https://media.chicagoshining.com/";
  if (path.startsWith(host)) path = path.slice(host.length);
  path = path.split("?")[0].replace(/^\/+/, "");
  if (!path || /\.(jpe?g|png|webp|gif)$/i.test(path)) return "";
  if (path.startsWith("studio/previews/") || path.startsWith("publish/") || path.startsWith("studio/master-assets/")) return path;
  return "";
}

export function publishedLibraryObjectKey(record) {
  const candidates = [
    field(record, "Studio_Preview_R2_Key"),
    field(record, "Studio_Preview_URL"),
    field(record, "Publish_Asset_URL"),
    field(record, "Final_File_URL"),
  ];
  for (const value of candidates) {
    const key = publicMediaObjectKey(value);
    if (key) return key;
  }
  return "";
}
