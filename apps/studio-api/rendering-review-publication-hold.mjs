/**
 * Permanent, narrow publisher safeguard for manually enrolled review outputs.
 * Detects either schema's authoritative review-owned hold independently of
 * new-enrollment feature flags and of the mutable Do_Not_Publish field.
 * No session creation and no schedule or media writes occur here.
 */
export const RENDER_REVIEW_HOLD_FIELDS = Object.freeze([
  "Studio_Render_Review_Hold_Active",
  "Studio_Render_Review_Hold_ID",
  "Studio_Review_Hold_ID",
]);

export function renderingReviewHoldPresent(readField) {
  if (typeof readField !== "function") throw new TypeError("readField is required");
  const active = readField(RENDER_REVIEW_HOLD_FIELDS[0]);
  const checked = active === true || active === 1 ||
    (typeof active === "string" && active.trim().toLowerCase() === "true");
  return checked || RENDER_REVIEW_HOLD_FIELDS.slice(1).some(
    field => String(readField(field) ?? "").trim().length > 0
  );
}
