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

// Resolve existing Airtable guidance before showing a blank new Settings record.
// The underlying Brand, Persona and core AI Prompts may be shared between
// Content Profiles; editing here saves a profile-scoped override, not a shared
// source mutation.
export function resolveCreativeGuidance({ saved = {}, profile = {}, brand = {}, persona = {} } = {}) {
  const overrides = normalizeCreativeGuidance(saved);
  const options = {
    shared_direction: [
      ["Content Profiles · Profile_Override_Guidelines", profile.Profile_Override_Guidelines],
      ["Content Profiles · Content_Strategy_Overrides", profile.Content_Strategy_Overrides],
      ["Brands · Brand_Personality", brand.Brand_Personality],
      ["Brands · Visual_Style_Guidelines", brand.Visual_Style_Guidelines],
    ],
    thumbnail_instructions: [
      ["Content Profiles · Thumbnail_Guideline_Overrides", profile.Thumbnail_Guideline_Overrides],
      ["Brands · Thumbnail_Style_Guidelines", brand.Thumbnail_Style_Guidelines],
      ["Brands · Visual_Style_Guidelines", brand.Visual_Style_Guidelines],
    ],
    narration_instructions: [
      ["Content Profiles · Brand_Voice", profile.Brand_Voice],
      ["Brands · Brand_Voice", brand.Brand_Voice],
      ["AI Personas · Tone_Guidelines", persona.Tone_Guidelines],
      ["AI Personas · Communication_Style", persona.Communication_Style],
    ],
  };
  const creative = {};
  const sources = {};
  for (const key of CREATIVE_FIELDS) {
    if (overrides[key]) {
      creative[key] = overrides[key];
      sources[key] = { label: "Saved profile-specific Creative Guidance", inherited: false };
    } else {
      const [label, value] = options[key].find(([, text]) => String(text || "").trim()) || ["No existing guidance in this source", ""];
      creative[key] = String(value || "").trim().slice(0, CREATIVE_MAX_CHARS);
      sources[key] = { label, inherited: true };
    }
  }
  const references = [
    { label: "Brand · Visual Style", text: brand.Visual_Style_Guidelines, scope: "Shared Brand" },
    { label: "Brand · Thumbnail Style", text: brand.Thumbnail_Style_Guidelines, scope: "Shared Brand" },
    { label: "AI Persona · Tone", text: persona.Tone_Guidelines, scope: "Shared Persona" },
    { label: "AI Persona · Pacing", text: persona.Pacing_Guidelines, scope: "Shared Persona" },
    { label: "AI Persona · Communication Style", text: persona.Communication_Style, scope: "Shared Persona" },
  ].filter((item) => String(item.text || "").trim())
    .map((item) => ({ ...item, text: String(item.text).slice(0, 10000) }));
  return { creative, sources, references };
}
