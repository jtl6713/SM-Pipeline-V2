// Profile-scoped creative direction. Values are stored in Pipeline Settings rather
// than adding fields to Content Profiles; Airtable remains authoritative.
export const CREATIVE_FIELDS = Object.freeze([
  "shared_direction",
  "thumbnail_instructions",
  "narration_instructions",
]);
export const CREATIVE_MAX_CHARS = 4000;

export function creativeSettingName(profileId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(profileId || ""))) {
    throw new Error("Invalid Content Profile record id");
  }
  return `Studio_Profile_Creative_${profileId}`;
}

export function normalizeCreativeGuidance(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(CREATIVE_FIELDS.map((key) => [key, String(source[key] ?? "").trim()]));
}

export function parseCreativeGuidance(value) {
  try { return normalizeCreativeGuidance(JSON.parse(String(value || "{}"))); }
  catch { return normalizeCreativeGuidance({}); }
}

export function validateCreativeGuidancePatch(patch, previous = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Creative guidance must be an object");
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((key) => !CREATIVE_FIELDS.includes(key))) {
    throw new Error("Expected only shared_direction, thumbnail_instructions, and narration_instructions");
  }
  const result = normalizeCreativeGuidance(previous);
  for (const key of keys) {
    if (typeof patch[key] !== "string" || patch[key].length > CREATIVE_MAX_CHARS) {
      throw new Error(`${key} must be text no longer than ${CREATIVE_MAX_CHARS} characters`);
    }
    result[key] = patch[key].trim();
  }
  return result;
}
