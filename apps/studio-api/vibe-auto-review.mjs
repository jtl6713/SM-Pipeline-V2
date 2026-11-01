import { isVibeCutNotes, validateVibeCutSourceAssets } from "./vibe-cut.mjs";

/**
 * An explicitly uploaded Vibe Cut may proceed automatically to human review
 * only after Airtable and the saved Drive/source record agree it is complete.
 * This does not approve, schedule or publish any output.
 */
export function vibeAutoReviewVerifiedSource({ notes = "", assets = [], masterStatus = "", masterCount = 0 } = {}) {
  const text = String(notes || "");
  if (!isVibeCutNotes(text) || !/\bez-input=vibe-cut\b/i.test(text)) return false;
  if (String(masterStatus || "").trim() !== "Ready" || Number(masterCount) !== 1) return false;
  if (!Array.isArray(assets) || assets.length !== 1) return false;
  const source = assets[0] || {};
  if (!String(source.google_drive_file_id || "").trim() || !String(source.media_asset_record_id || "").trim()) return false;
  if (String(source.upload_status || "").trim().toLowerCase() !== "complete") return false;
  if (!["ready", "skipped"].includes(String(source.compression_status || "").trim().toLowerCase())) return false;
  return validateVibeCutSourceAssets(assets).ok === true;
}
