import { isVibeCutNotes, validateVibeCutSourceAssets, vibeCutProductionDefaults, parseVibeCutDirective } from "./vibe-cut.mjs";

/**
 * Decide the NEXT bounded server-side step for one Vibe Cut. No work is
 * authorized by an upload alone: the original media must be fully persisted
 * and ready. Promotion starts rendering; final approval is always human.
 */
export function vibeAutoReviewDecision({
  notes = "", requestStatus = "", masterStatus = "", planStatus = "",
  assets = [], revisionOpen = false, disabled = false,
} = {}) {
  const text = String(notes || "");
  // Only operator-created, explicit video Vibe Cuts. Never sweep generic
  // historical photo montages, autonomous Ideas or Factory revisions.
  if (!isVibeCutNotes(text) || !/ez-input=vibe-cut/i.test(text)
      || !/origin=ez-wizard/i.test(text)) return { step: "skip", reason: "not_wizard_vibe" };
  if (disabled) return { step: "skip", reason: "disabled" };
  if (revisionOpen) return { step: "skip", reason: "human_revision" };
  const status = String(requestStatus || "").trim();
  if (status === "Promoted") return { step: "complete", reason: "already_promoted" };
  if (status === "Submitted") return { step: "finalize", reason: "awaiting_promotion_fanout" };
  if (!["Draft", "Ready"].includes(status)) return { step: "skip", reason: "not_editable" };
  const source = validateVibeCutSourceAssets(assets);
  if (!source.ok) return { step: "wait", reason: source.reason || "source_not_ready" };
  const asset = assets[0] || {};
  if (String(masterStatus || "").trim() !== "Ready"
      || !String(asset.google_drive_file_id || "").trim()
      || !/^rec[A-Za-z0-9]+$/.test(String(asset.media_asset_record_id || "").trim())) {
    return { step: "wait", reason: "waiting_for_verified_media_authority" };
  }
  if (String(planStatus || "").trim() !== "Ready") {
    return { step: "plan", reason: "missing_platform_plan", defaults: vibeCutProductionDefaults(parseVibeCutDirective(text) || {}, { notes: text }) };
  }
  return { step: "promote", reason: "prepare_media_then_submit_to_render" };
}
