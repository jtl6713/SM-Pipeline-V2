"use strict";

/**
 * Renderer-side, fail-closed Vibe Cut branding gate.
 *
 * The normal production renderer retains its existing Chicago watermark
 * authority. For protected Vibe Cut revisions, require BOTH the profile-owned
 * Drive watermark URL emitted by the Runner and a deployment-owned allowlist.
 * The URL in render props alone is never authorization to use another logo.
 *
 * REMOTION_REVIEW_PROFILE_WATERMARKS_JSON is an operator-managed JSON object
 * mapping Content Profile Airtable IDs to their approved Drive PNG IDs.
 * Missing/mismatched configuration blocks the render, never falls back to
 * Chicago's identity.
 */
const RECORD = /^rec[A-Za-z0-9]{14}$/;
const DRIVE = /^[A-Za-z0-9_-]{20,120}$/;

function selectedVibeWatermarkFileId({watermarkUrl, studioRevision, profileWatermarksJson}) {
  if (studioRevision?.source !== "rendering_review_vibe_cut") return null;

  const profileId = studioRevision.profile_id;
  if (typeof profileId !== "string" || !RECORD.test(profileId)) {
    throw new Error("vibe_watermark_profile_identity_missing");
  }
  let mapping;
  try {
    mapping = JSON.parse(profileWatermarksJson || "");
  } catch {
    throw new Error("vibe_watermark_authoritative_mapping_unavailable");
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("vibe_watermark_authoritative_mapping_unavailable");
  }
  const expectedFileId = mapping[profileId];
  if (typeof expectedFileId !== "string" || !DRIVE.test(expectedFileId)) {
    throw new Error("vibe_watermark_profile_asset_not_provisioned");
  }
  // Exact trusted Google Drive download URL; no HTML viewer, parameters,
  // custom host, redirect, username, fragment, or arbitrary third-party URL.
  let url;
  try {
    url = new URL(watermarkUrl);
  } catch {
    throw new Error("vibe_watermark_source_url_invalid");
  }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com" ||
      url.port || url.username || url.password || url.pathname !== "/uc" ||
      url.hash || [...url.searchParams.keys()].length !== 2 ||
      url.searchParams.getAll("id").length !== 1 ||
      url.searchParams.getAll("export").length !== 1 ||
      url.searchParams.get("export") !== "download" ||
      url.searchParams.get("id") !== expectedFileId) {
    throw new Error("vibe_watermark_source_not_profile_owned");
  }
  return expectedFileId;
}

module.exports = {selectedVibeWatermarkFileId};
