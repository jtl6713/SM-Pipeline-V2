/** Photo-wait selection for approved image ideas. Pure helpers used by tests and mirrored in worker.js. */

export const IDEA_PHOTO_WAIT_TYPES = new Set(["Carousel", "Photo Set", "Feed Post"]);

export function ideaPhotoWaitApplies(input = {}) {
  const contentType = String(input.content_type || "").trim();
  const mode = String(input.carousel_slide_count_mode || "").trim();
  const imageMode = String(input.carousel_image_mode || "").trim();
  return IDEA_PHOTO_WAIT_TYPES.has(contentType)
    && mode === "Target range"
    && imageMode !== "Make AI Generated";
}

export function sortHighConfidenceMatches(matches) {
  return [...(matches || [])]
    .filter((row) => String(row?.confidence || "") === "high" && row?.id)
    .sort((a, b) => {
      const dateA = String(a.intake_date || "");
      const dateB = String(b.intake_date || "");
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff) return scoreDiff;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function selectMatchedPhotos({ matches, min, max, pendingBatchIds, force = false } = {}) {
  const floor = Math.max(1, Number(min) || 0);
  const cap = Math.max(floor, Number(max) || floor);
  const high = sortHighConfidenceMatches(matches);
  const pending = new Set(Array.isArray(pendingBatchIds) ? pendingBatchIds.filter(Boolean) : []);

  if (high.length < floor) {
    return {
      action: "wait",
      high_count: high.length,
      selected: [],
      reason: "below_min",
    };
  }

  if (!force) {
    const blocked = high.some((row) => row.intake_batch_id && pending.has(row.intake_batch_id));
    if (blocked) {
      return {
        action: "wait_batch",
        high_count: high.length,
        selected: [],
        reason: "intake_batch_in_progress",
      };
    }
  }

  return {
    action: "ready",
    high_count: high.length,
    selected: high.slice(0, cap),
    reason: "min_met_take_all_up_to_max",
  };
}
