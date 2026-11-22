/**
 * Facebook/Instagram auto-publish repair disposition.
 *
 * Disabling the automated publisher is never, by itself, proof that a human
 * must post the item. This classifier is read-only: it does not change the
 * publishing lease, schedule, retry eligibility, or external provider IDs.
 * Actual manual methods/fallbacks continue through the existing manual path.
 */
const value = (fields, key) => String(fields?.[key] ?? "").trim();
const trueFlag = value => value === true || value === 1 || String(value ?? "").trim().toLowerCase() === "true";
const hasExternalIdentity = fields => [
  "Platform_Post_ID", "Platform_Media_ID", "IG_Story_Container_ID",
  "IG_Story_Post_ID", "Instagram_Reel_Container_ID",
  "IG_Carousel_Parent_Container_ID", "IG_Carousel_Published_Media_ID",
  "FB_Photo_IDs_JSON", "FB_Slideshow_Meta_Video_ID",
].some(key => Boolean(value(fields, key)));
const hasAttempt = fields =>
  Number(value(fields, "Studio_Publish_Dispatch_Count") || 0) > 0
  || Number(value(fields, "Publish_Attempt_Count") || 0) > 0
  || ["Studio_Publish_Dispatch_At", "Publish_Started_At", "Last_Publish_Attempt_At"]
    .some(key => Boolean(value(fields, key)))
  || hasExternalIdentity(fields);

export function metaAutoPublishDisabledState(fields = {}) {
  if (!["facebook", "instagram"].includes(value(fields, "Platform").toLowerCase())) return null;
  if (fields.Auto_Publish_Enabled !== false) return null;
  if (value(fields, "Review_Status").toLowerCase() !== "approved"
      || value(fields, "Output_Status").toLowerCase() !== "approved for publishing") return null;

  // A real terminal outcome and a true manual method outrank configuration.
  if (value(fields, "Published_At") || value(fields, "Platform_Post_URL")
      || value(fields, "Manual_Published_URL")
      || /published/i.test(value(fields, "Publish_Status"))) return null;
  if (/failed|error/i.test(value(fields, "Publish_Status"))
      || /failed|error/i.test(value(fields, "Render_Status"))) return null;
  if (trueFlag(fields.Manual_Fallback_Required)
      || /manual/i.test(value(fields, "Publish_Method"))
      || /manual publish required/i.test(value(fields, "Publish_Status"))) return null;

  // An explicit hold is not a user publishing task.
  if (trueFlag(fields.Do_Not_Publish)) return "Review Held";
  if (hasAttempt(fields)) return "Needs Verification";
  return "Auto Publish Disabled";
}
