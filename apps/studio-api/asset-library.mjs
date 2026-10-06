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

/** Accept only calendar days as YYYY-MM-DD for Asset Manager date filters. */
export function parseLibraryDateParam(raw) {
  const value = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  const dt = new Date(utc);
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return value;
}

/** Created-time field on Media Assets. Newest/oldest added sorts here, not date-only Intake_Date. */
export const LIBRARY_ADDED_AT_FIELD = "Added_At";

/** Exact add time: Added_At, else Airtable createdTime, else Intake_Date. */
export function libraryAssetAddedAt(record) {
  const added = text(record, LIBRARY_ADDED_AT_FIELD);
  if (added) return added;
  const created = String(record?.createdTime || "").trim();
  if (created) return created;
  return text(record, "Intake_Date") || null;
}

/**
 * Sort for Asset Manager browse. Works with or without search/date filters.
 * Media assets: Added_At / Asset Name. Published outputs: Published_At / Output_Title.
 */
export function resolveLibraryListSort(sortRaw, { published = false } = {}) {
  const key = String(sortRaw || "newest").trim().toLowerCase().replace(/-/g, "_");
  const dateField = published ? "Published_At" : LIBRARY_ADDED_AT_FIELD;
  const nameField = published ? "Output_Title" : "Asset Name";
  if (key === "oldest") {
    return { sort: "oldest", sortField: dateField, sortDirection: "asc" };
  }
  if (key === "name_asc") {
    return { sort: "name_asc", sortField: nameField, sortDirection: "asc" };
  }
  if (key === "name_desc") {
    return { sort: "name_desc", sortField: nameField, sortDirection: "desc" };
  }
  return { sort: "newest", sortField: dateField, sortDirection: "desc" };
}

/** Inclusive date-added / published-at window for Airtable date or date-time fields. */
export function libraryAddedDateFilterFormula(fromRaw, toRaw, fieldName = LIBRARY_ADDED_AT_FIELD) {
  const field = String(fieldName || LIBRARY_ADDED_AT_FIELD).trim() || LIBRARY_ADDED_AT_FIELD;
  if (!/^[A-Za-z0-9_ ]+$/.test(field)) return null;
  const from = parseLibraryDateParam(fromRaw);
  const to = parseLibraryDateParam(toRaw);
  if (!from && !to) return null;
  const parts = [`{${field}}!=""`];
  if (from) {
    const escaped = airtableSearchEscape(from);
    parts.push(`OR(IS_SAME({${field}},DATETIME_PARSE("${escaped}"),"day"),IS_AFTER({${field}},DATETIME_PARSE("${escaped}")))`);
  }
  if (to) {
    const escaped = airtableSearchEscape(to);
    parts.push(`OR(IS_SAME({${field}},DATETIME_PARSE("${escaped}"),"day"),IS_BEFORE({${field}},DATETIME_PARSE("${escaped}")))`);
  }
  return parts.length === 1 ? parts[0] : `AND(${parts.join(",")})`;
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

const LIBRARY_ASSET_NAME_MAX = 120;

export function sanitizeLibraryAssetName(raw) {
  let name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Name is required" };
  if (/[\\/\0]/.test(name)) {
    return { ok: false, error: "Name cannot contain path characters" };
  }
  name = name.replace(/\.[A-Za-z0-9]{1,8}$/, "").trim();
  if (!name) return { ok: false, error: "Name is required" };
  if (name.length > LIBRARY_ASSET_NAME_MAX) name = name.slice(0, LIBRARY_ASSET_NAME_MAX).trim();
  if (!name) return { ok: false, error: "Name is required" };
  return { ok: true, name };
}

/** Strip a trailing " 12" so "Space Museum 15" is treated as base "Space Museum". */
export function normalizeLibraryBatchBase(raw) {
  const sanitized = sanitizeLibraryAssetName(raw);
  if (!sanitized.ok) return sanitized;
  const stripped = sanitized.name.replace(/\s+\d+$/, "").trim();
  if (!stripped) return { ok: false, error: "Name is required" };
  if (stripped.length > LIBRARY_ASSET_NAME_MAX) {
    return { ok: true, name: stripped.slice(0, LIBRARY_ASSET_NAME_MAX).trim() };
  }
  return { ok: true, name: stripped };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeLibraryAirtableFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Drop a trailing .jpg/.mp4/etc so Drive-style names still match the batch stem. */
export function stripLibraryAssetExtension(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,8}$/, "")
    .trim();
}

/**
 * Parse the sequence number for a catalog name under a batch base.
 * Exact "Space Museum" (or "Space Museum.jpg") counts as 1.
 * "Space Museum 16" / "Space Museum 16.mp4" → 16. Unrelated names → null.
 * Extension does not matter — numbering continues from the highest stem.
 */
export function parseLibraryBatchSequence(assetName, baseName) {
  const name = stripLibraryAssetExtension(assetName);
  const base = stripLibraryAssetExtension(baseName);
  if (!name || !base) return null;
  if (name.toLowerCase() === base.toLowerCase()) return 1;
  const match = name.match(new RegExp(`^${escapeRegExp(base)}\\s+(\\d+)$`, "i"));
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function maxLibraryBatchSequence(existingNames, baseName) {
  let max = 0;
  for (const name of existingNames || []) {
    const sequence = parseLibraryBatchSequence(name, baseName);
    if (sequence != null && sequence > max) max = sequence;
  }
  return max;
}

/** Allocate the next count names after any existing catalog sequence for baseName. */
export function allocateLibraryBatchNames(baseName, count, existingNames = []) {
  const base = stripLibraryAssetExtension(baseName);
  const total = Math.max(0, Number(count) || 0);
  if (!base || total < 1) return [];
  let next = maxLibraryBatchSequence(existingNames, base) + 1;
  const names = [];
  for (let i = 0; i < total; i += 1) {
    const stem = `${base} ${next}`;
    names.push(stem.length > LIBRARY_ASSET_NAME_MAX
      ? `${base.slice(0, Math.max(1, LIBRARY_ASSET_NAME_MAX - String(next).length - 1)).trim()} ${next}`
      : stem);
    next += 1;
  }
  return names;
}

/**
 * Airtable formula: exact base or "base N" Asset Name matches (case-insensitive).
 * Optional trailing file extension is allowed so older Drive-style names still count.
 */
export function libraryBatchNameFilterFormula(baseName) {
  const base = stripLibraryAssetExtension(baseName);
  if (!base) return null;
  const regexEscaped = escapeRegExp(base.toLowerCase()).replace(/"/g, '\\"');
  const ext = "([.][a-z0-9]{1,8})?";
  return `OR(REGEX_MATCH(LOWER({Asset Name}&""),"^${regexEscaped}${ext}$"),REGEX_MATCH(LOWER({Asset Name}&""),"^${regexEscaped} [0-9]+${ext}$"))`;
}

export function libraryDriveFilename(stem, extension) {
  const safe = String(stem || "asset").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LIBRARY_ASSET_NAME_MAX) || "asset";
  const ext = String(extension || "").replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8);
  return ext ? `${safe}.${ext}` : safe;
}

export function mediaAssetIsHeic({ mimeType, fileExtension, name } = {}) {
  const mime = String(mimeType || "").toLowerCase();
  const ext = String(fileExtension || "").toLowerCase().replace(/^\./, "");
  const filename = String(name || "").toLowerCase();
  return mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif" || /\.(heic|heif)$/.test(filename);
}

/** Pipeline Settings row that lets Admin browse/match across Content Profiles. */
export const LIBRARY_CROSS_SCOPE_SETTING = "LIBRARY_INCLUDE_CROSS_SCOPE";

export function libraryCrossScopeEnabled(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function resolveLibraryCrossScopeFlag(url, settingRaw) {
  if (url?.searchParams?.has("cross_scope")) {
    return libraryCrossScopeEnabled(url.searchParams.get("cross_scope"));
  }
  return libraryCrossScopeEnabled(settingRaw);
}

/**
 * Asset Manager browse stays on the header Content Profile.
 * LIBRARY_INCLUDE_CROSS_SCOPE is only for idea matching / harvest.
 * Pass cross_scope=1 on the request if a tool truly needs every city.
 */
export function resolveAssetManagerCrossScopeFlag(url) {
  if (!url?.searchParams?.has("cross_scope")) return false;
  return libraryCrossScopeEnabled(url.searchParams.get("cross_scope"));
}

/**
 * Asset Manager uploads must use the operator-chosen profile.
 * Prefer the form field (header select) over the query string. Never fall back
 * to a default market — that stamps Chicago while the header shows LA.
 */
export function resolveLibraryUploadProfileId({ formProfileId = "", urlProfileId = "" } = {}) {
  const formId = String(formProfileId || "").trim();
  const urlId = String(urlProfileId || "").trim();
  const raw = formId || urlId;
  if (!raw) {
    return { ok: false, error: "Choose a Content Profile before uploading assets" };
  }
  if (!/^rec[A-Za-z0-9]+$/.test(raw)) {
    return { ok: false, error: "Invalid Content Profile id" };
  }
  return { ok: true, profileId: raw };
}

export function firstLinkedRecordId(value) {
  if (Array.isArray(value) && value.length) {
    const first = value[0];
    if (typeof first === "string" && /^rec[A-Za-z0-9]+$/.test(first)) return first;
    if (first && typeof first === "object") {
      const id = String(first.id || "").trim();
      if (/^rec[A-Za-z0-9]+$/.test(id)) return id;
    }
  }
  if (typeof value === "string" && /^rec[A-Za-z0-9]+$/.test(value.trim())) return value.trim();
  return "";
}

/**
 * Scope Media Assets to a Content Profile.
 *
 * Asset Manager browse should pass includeUnscoped: false so LA does not list
 * blank-profile Chicago stills. Photo-wait / idea matching may still include
 * blank rows until those Drive-ingest leftovers are assigned.
 *
 * Airtable formulas expose linked records as primary-field names via ARRAYJOIN,
 * not record IDs. Match both id (legacy) and Profile_Name so stamped Chicago
 * stills are not filtered out of library / photo-wait scans.
 */
export function mediaAssetProfileScopeFormula(profileId, {
  crossScope = false,
  includeUnscoped = true,
  profileName = "",
} = {}) {
  if (crossScope) return null;
  const id = String(profileId || "").trim();
  const name = String(profileName || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(id) && !name) return null;
  const parts = [];
  if (/^rec[A-Za-z0-9]+$/.test(id)) {
    parts.push(`FIND("${escapeLibraryAirtableFormulaValue(id)}", ARRAYJOIN({Content_Profile})&"")`);
  }
  if (name) {
    parts.push(`FIND("${escapeLibraryAirtableFormulaValue(name)}", ARRAYJOIN({Content_Profile})&"")`);
  }
  const match = parts.length === 1 ? parts[0] : `OR(${parts.join(",")})`;
  if (includeUnscoped) return `OR({Content_Profile}=BLANK(),${match})`;
  return match;
}

export function combineAirtableFormulas(...parts) {
  const clauses = parts.map((part) => String(part || "").trim()).filter(Boolean);
  if (!clauses.length) return null;
  if (clauses.length === 1) return clauses[0];
  return `AND(${clauses.join(",")})`;
}

export function parseLibraryRecordIdsParam(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return [...new Set(raw.split(/[\s,]+/).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
}

export function libraryClassificationInProgress(status) {
  const value = String(status || "").trim();
  return value !== "Classified" && value !== "Classification Error";
}

export function libraryRecordIdsFilterFormula(ids) {
  const clean = parseLibraryRecordIdsParam(Array.isArray(ids) ? ids.join(",") : ids);
  if (!clean.length) return null;
  const parts = clean.map((id) => `RECORD_ID()="${id}"`);
  return parts.length === 1 ? parts[0] : `OR(${parts.join(",")})`;
}

/** Drop Item 4 fill-crop / aspect variants from library + photo-wait Airtable scans. */
export function ideaLibraryExcludeDerivedStillFormula() {
  return `AND(NOT(FIND("fill-crop",LOWER({Asset Name}&""))),NOT(REGEX_MATCH({Asset Name}&"","__[0-9]+x[0-9]+__")))`;
}

/**
 * Studio uploads used to stamp Classification_Status=Classified with a stub
 * description and no A3 tags. Classify all must pick those up, not only
 * Needs Classification / Classification Error.
 */
export function libraryClassifyPendingFormula(listFormula) {
  const list = String(listFormula || "").trim();
  if (!list) return null;
  return `AND(${list},{Content_Profile}!=BLANK(),OR({Classification_Status}='Needs Classification',{Classification_Status}='Classification Error',AND(OR({Classification_Status}='Classified',{Classification_Status}=BLANK()),{Search_Keywords}=BLANK())))`;
}
