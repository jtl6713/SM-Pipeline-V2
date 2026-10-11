/**
 * Pure helpers for post-publish media release (Drive finals, R2 staging, blobs).
 * Keep aligned with apps/studio-api/worker.js release + cron paths.
 */

import {
  publicMediaObjectKey,
  publishedFileReleaseGuard,
  publishedFinalFileId,
  publishedReleaseFields,
} from "./asset-library.mjs";

export const POST_PUBLISH_RELEASE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const POST_PUBLISH_RELEASE_BATCH_LIMIT = 8;
export const POST_PUBLISH_RELEASE_DRY_RUN_SETTING = "STUDIO_POST_PUBLISH_RELEASE_DRY_RUN";

/** Sibling states that allow auto-release of finished media (not Scheduled — still needs MP4). */
export const POST_PUBLISH_RELEASE_GROUP_STATES = new Set([
  "Published",
  "Skipped",
  "Draft Delivered",
]);

const BRANDING_R2_PREFIX = "studio/previews/branding/";

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

function firstLinkedId(value) {
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

/** R2 cleanup key: videos + staged covers/images under publish/ or studio/previews/. */
export function publicMediaCleanupKey(urlOrKey) {
  let path = String(urlOrKey || "").trim();
  if (!path) return "";
  const host = "https://media.chicagoshining.com/";
  if (path.startsWith(host)) path = path.slice(host.length);
  path = path.split("?")[0].replace(/^\/+/, "");
  if (!path) return "";
  if (path.startsWith(BRANDING_R2_PREFIX)) return "";
  if (
    path.startsWith("studio/previews/")
    || path.startsWith("publish/")
    || path.startsWith("studio/master-assets/")
  ) {
    return path;
  }
  return "";
}

export function collectPublishedR2CleanupKeys(record) {
  const candidates = [
    field(record, "Studio_Preview_R2_Key"),
    field(record, "Studio_Preview_URL"),
    field(record, "Publish_Asset_URL"),
    field(record, "Final_File_URL"),
    field(record, "Thumbnail_URL"),
    field(record, "Output_URL"),
  ];
  const keys = [];
  for (const value of candidates) {
    const cleanup = publicMediaCleanupKey(value);
    if (cleanup) keys.push(cleanup);
    else {
      const videoOnly = publicMediaObjectKey(value);
      if (videoOnly) keys.push(videoOnly);
    }
  }
  return [...new Set(keys)];
}

export function publishedReleaseStampFields({ clearBlobs = false } = {}) {
  const fields = {
    ...publishedReleaseFields(),
    Studio_Preview_URL: null,
    Studio_Preview_R2_Key: null,
    Publish_Asset_URL: null,
  };
  if (clearBlobs) {
    fields.Selected_Assets_JSON = null;
    fields.Render_Clip_List_JSON = null;
    fields.Remotion_Props_JSON = null;
  }
  return fields;
}

export function normalizeReleaseGroupState(record) {
  const outputStatus = text(record, "Output_Status").toLowerCase();
  const publishStatus = text(record, "Publish_Status").toLowerCase();
  const tiktok = text(record, "TikTok_Draft_Status").toLowerCase();
  const youtubeStage = text(record, "YouTube_Stage").toLowerCase();
  if (outputStatus === "published" || publishStatus === "published") return "Published";
  if (outputStatus === "skipped" || publishStatus === "skipped") return "Skipped";
  if (
    outputStatus === "draft delivered"
    || tiktok === "publish complete"
    || tiktok === "draft delivered"
  ) return "Draft Delivered";
  if (outputStatus === "scheduled" || publishStatus === "scheduled") return "Scheduled";
  if (youtubeStage === "complete" && text(record, "Published_At")) return "Published";
  return text(record, "Output_Status") || "Unknown";
}

export function contentGroupReadyForMediaRelease(records = []) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!list.length) return false;
  return list.every((record) => POST_PUBLISH_RELEASE_GROUP_STATES.has(normalizeReleaseGroupState(record)));
}

export function latestSiblingPublishedAtMs(records = []) {
  let latest = 0;
  for (const record of records || []) {
    const raw = text(record, "Published_At") || text(record, "Review_Decision_At");
    const ms = Date.parse(raw);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest || 0;
}

export function publishedGroupCoolDownElapsed(records = [], {
  now = Date.now(),
  coolDownMs = POST_PUBLISH_RELEASE_COOLDOWN_MS,
} = {}) {
  const latest = latestSiblingPublishedAtMs(records);
  if (!latest) return false;
  return now - latest >= coolDownMs;
}

export function outputNeedsMediaRelease(record) {
  const storage = text(record, "Final_File_Storage_Status").toLowerCase();
  if (storage === "released") {
    const hasR2 = collectPublishedR2CleanupKeys(record).length > 0
      || text(record, "Studio_Preview_URL")
      || text(record, "Publish_Asset_URL");
    return Boolean(hasR2);
  }
  if (publishedFinalFileId(record) || text(record, "Final_File_URL") || text(record, "Output_URL")) {
    return true;
  }
  return collectPublishedR2CleanupKeys(record).length > 0
    || Boolean(text(record, "Studio_Preview_URL") || text(record, "Publish_Asset_URL"));
}

export function evaluatePublishedOutputRelease(record, {
  masterDriveIds = [],
  siblingRecords = null,
  now = Date.now(),
  coolDownMs = POST_PUBLISH_RELEASE_COOLDOWN_MS,
  requireGroupComplete = false,
} = {}) {
  if (!outputNeedsMediaRelease(record)) {
    return { ok: true, already_released: true, reason: "already_released" };
  }
  const guard = publishedFileReleaseGuard(record, { masterDriveIds });
  if (!guard.ok) return { ...guard, reason: "guard" };
  if (requireGroupComplete) {
    const siblings = Array.isArray(siblingRecords) ? siblingRecords : [record];
    if (!contentGroupReadyForMediaRelease(siblings)) {
      return {
        ok: false,
        status: 409,
        error: "Content Item siblings are not all Published, Skipped, or Draft Delivered.",
        reason: "group_incomplete",
      };
    }
    if (!publishedGroupCoolDownElapsed(siblings, { now, coolDownMs })) {
      return {
        ok: false,
        status: 409,
        error: "Post-publish cool-down has not elapsed for this Content Item.",
        reason: "cool_down",
      };
    }
  }
  return {
    ok: true,
    already_released: Boolean(guard.already_released),
    final_file_id: guard.final_file_id || null,
    r2_keys: collectPublishedR2CleanupKeys(record),
    reason: "eligible",
  };
}

export function postPublishReleaseCandidateFormula() {
  return 'AND({Test_Run_ID}=BLANK(),{Published_At}!="",OR({Final_File_ID}!="",{Final_File_URL}!="",{Studio_Preview_URL}!="",{Studio_Preview_R2_Key}!="",{Publish_Asset_URL}!=""),OR({Final_File_Storage_Status}!="Released",{Studio_Preview_URL}!="",{Publish_Asset_URL}!=""))';
}

export function isFillCropAssetName(name) {
  const value = String(name || "").toLowerCase();
  return value.includes("fill-crop") || /__\d+x\d+__/.test(value) || value.includes("item4-variant");
}

export function isFillCropPreviewKey(key) {
  const path = String(key || "");
  return path.includes("/item4/")
    || path.includes("clip-posters/")
    || path.includes("ITEM4-VARIANT")
    || path.includes("fill-crop");
}

export function extractDriveFileIdFromUrl(urlValue) {
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

export function contentItemDerivedDriveIds(record) {
  const ids = [];
  for (const name of ["Voiceover_URL", "Thumbnail_URL"]) {
    const id = extractDriveFileIdFromUrl(field(record, name));
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

export function contentItemIdFromOutput(record) {
  return firstLinkedId(field(record, "Content_Item"));
}

export function dryRunFlagEnabled(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export const POST_PUBLISH_RELEASE_LIST_FIELDS = [
  "Output_ID",
  "Output_Title",
  "Platform",
  "Platform_Output_Type",
  "Studio_Output_Type",
  "Output_Status",
  "Publish_Status",
  "Published_At",
  "Review_Decision_At",
  "Platform_Post_URL",
  "Platform_Post_ID",
  "TikTok_Draft_Status",
  "YouTube_Stage",
  "Render_Status",
  "Final_File_ID",
  "Final_File_URL",
  "Output_URL",
  "Final_File_Storage_Status",
  "Studio_Preview_URL",
  "Studio_Preview_R2_Key",
  "Publish_Asset_URL",
  "Thumbnail_URL",
  "Selected_Assets_JSON",
  "Render_Clip_List_JSON",
  "Content_Item",
  "Production_Request_Output",
  "Test_Run_ID",
];

export const DESK_INVENTORY_OUTPUT_FIELDS = [
  "Output_ID",
  "Platform",
  "Studio_Output_Type",
  "Platform_Output_Type",
  "Output_Status",
  "Publish_Status",
  "Review_Status",
  "Render_Status",
  "Remotion_Job_ID",
  "Final_File_URL",
  "Output_Caption",
  "Thumbnail_URL",
  "Published_At",
  "Content_Item",
  "Production_Request_Output",
  "Render_Clip_List_JSON",
  "Publish_Error_Message",
  "Remotion_Error_Message",
  "YouTube_Video_ID",
  "YouTube_Stage",
  "IG_Carousel_Status",
  "TikTok_Draft_Status",
  "Last Modified",
  "Test_Run_ID",
];

export const DESK_INVENTORY_REQUEST_FIELDS = [
  "Request_Status",
  "Production_Notes",
  "Studio_Production_Job_JSON",
  "Studio_Variant_Status",
  "Promoted_Content_Item",
  "Created_At",
  "Updated_At",
  "Test_Run_ID",
];
